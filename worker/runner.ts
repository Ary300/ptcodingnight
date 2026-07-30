import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { aggregate } from "@/lib/judge/aggregate";
import { matches, UnknownCheckerError } from "@/lib/judge/comparators";
import { buildDiffSnippet, buildErrorSnippet } from "@/lib/judge/diff";
import type { JudgeJob, JudgeResult, JudgeTestResult, Verdict } from "@/lib/schemas/judge";
import {
  OUTPUT_CAP_FLOOR_BYTES,
  runInContainer,
  type ContainerLimits,
  type ContainerRunResult,
} from "@/worker/docker";
import { BATCH_DRIVER, parseMeta, type BatchTestOutcome } from "@/worker/batch-driver";

/**
 * Judges one submission: prepare a source directory, compile if the language needs it, run
 * every test in its own fresh container, map each outcome to a verdict, aggregate.
 *
 * Nothing here executes student code in-process. Every execution goes through
 * `runInContainer`.
 */

/**
 * Scratch lives under the repo rather than os.tmpdir().
 *
 * On macOS `os.tmpdir()` is `/var/folders/…`, which Docker Desktop does not share by
 * default — bind-mounting it silently yields an empty directory inside the container and
 * every submission fails with "file not found". The project directory is under /Users,
 * which is shared out of the box.
 */
const SCRATCH_ROOT = path.join(process.cwd(), ".judge-tmp");

interface LanguageSpec {
  readonly image: string;
  readonly sourceFile: string;
  /**
   * Shell command run once inside the submission's container before any test. Absent for
   * languages with nothing to build. Writes artifacts to /tmp/build.
   */
  readonly compileCommand?: string;
  readonly compileTimeoutMs: number;
  /** Shell command run once per test, reading the test input on stdin. */
  readonly runCommand: string;
}

function languageSpec(job: JudgeJob, images: JudgeImages): LanguageSpec {
  if (job.language === "PYTHON") {
    return {
      image: images.python,
      sourceFile: "main.py",
      // Python has no build step, but a syntax error is still a compile error, not a runtime
      // one — reporting `RE` would tell a student their algorithm crashed when the file never
      // parsed. `compile()` rather than `py_compile`, which would write __pycache__ next to
      // the source on a read-only mount.
      compileCommand:
        `python -c "import sys; compile(open('/work/main.py').read(), 'main.py', 'exec')"`,
      compileTimeoutMs: 15_000,
      runCommand: "exec python -I /work/main.py",
    };
  }

  return {
    image: images.java,
    sourceFile: "Main.java",
    // -proc:none disables annotation processing. Without it a submission can ship an
    // annotation processor and execute arbitrary code AT COMPILE TIME.
    //
    // Classes go to the tmpfs rather than a host mount: they are read by the JVM, never
    // exec'd, so `noexec` is no obstacle, and it keeps build output off the host entirely.
    compileCommand: "javac -proc:none -nowarn -d /tmp/build /work/Main.java",
    // javac on a cold JVM is slow, and a slow compile is not the student's fault the way a
    // slow program is.
    compileTimeoutMs: 60_000,
    // A container memory cap the JVM cannot see leads to it sizing the heap against host RAM
    // and being OOM-killed on startup. MaxRAMPercentage keeps the heap under the cgroup.
    runCommand: "exec java -XX:MaxRAMPercentage=75 -cp /tmp/build Main",
  };
}

export interface JudgeImages {
  readonly python: string;
  readonly java: string;
}

/**
 * Map one container run to a verdict.
 *
 * Order matters, and each step answers a question the next one cannot:
 *  1. OOM-killed by the kernel — unambiguous MLE.
 *  2. Killed by our wall-clock timer — TLE. Both 1 and 2 surface as exit 137, which is why
 *     they are distinguished by inspected state rather than exit code.
 *  3. Killed for flooding stdout — the output is wrong, not the process. Checked before the
 *     exit code, because killing it makes the exit code non-zero too.
 *  4. Runtime memory exhaustion reported by the runtime itself. The JVM raises
 *     OutOfMemoryError and exits rather than being OOM-killed, so without this a Java
 *     memory bomb would report RE and hide a real MLE.
 *  5. Non-zero exit — RE.
 *  6. Over the problem's time limit even though it finished — TLE. The hard kill sits at 3x
 *     the limit, so a program can finish "successfully" and still be too slow.
 *  7. Compare output.
 */
function verdictFor(
  run: ContainerRunResult,
  timeLimitMs: number,
  wallClockKillMs: number,
  compare: () => boolean,
): Verdict {
  if (run.oomKilled) return "MLE";
  if (run.timedOut || hitWallClock(run.exitCode, run.durationMs, wallClockKillMs)) return "TLE";
  if (run.outputTruncated) return "WA";
  if (/OutOfMemoryError|MemoryError/.test(run.stderr)) return "MLE";
  if (run.exitCode !== 0) return "RE";
  if (run.durationMs > timeLimitMs) return "TLE";
  return compare() ? "AC" : "WA";
}

function containerLimits(job: JudgeJob): ContainerLimits {
  return {
    memoryLimitMb: job.limits.memoryLimitMb,
    cpus: job.limits.cpus,
    pidsLimit: job.limits.pidsLimit,
    tmpfsBytes: job.limits.tmpfsBytes,
    wallClockKillMs: job.limits.wallClockKillMs,
  };
}

/** Container names must be unique and traceable back to a submission. */
function containerName(job: JudgeJob, suffix: string): string {
  const safe = job.submissionId.replace(/[^a-zA-Z0-9_.-]/g, "");
  return `ptcn-judge-${safe}-${suffix}-${job.attempt}`;
}

/**
 * Exit statuses that mean the wall-clock kill fired.
 *
 * `timeout` returns 124 only when it had to kill the command itself. A process that
 * *handles* the SIGTERM and exits on its own — which the JVM does, running shutdown hooks —
 * exits 143 (128+SIGTERM), and `timeout` faithfully propagates that instead. A process that
 * ignores SIGTERM and gets the follow-up SIGKILL exits 137.
 *
 * Reading only 124 reports a Java infinite loop as `RE`, which tells a student their program
 * crashed when it actually ran too long.
 */
const TIMEOUT_EXIT_CODE = 124;
const SIGTERM_EXIT_CODE = 143;
const SIGKILL_EXIT_CODE = 137;

/**
 * 137 and 143 are ordinary exit statuses a program could return deliberately, so they only
 * mean "timed out" when the run actually lasted about as long as the limit. 124 is
 * `timeout`'s own status and needs no corroboration.
 */
function hitWallClock(exitCode: number | null, durationMs: number, wallClockKillMs: number): boolean {
  if (exitCode === TIMEOUT_EXIT_CODE) return true;
  if (exitCode !== SIGKILL_EXIT_CODE && exitCode !== SIGTERM_EXIT_CODE) return false;
  return durationMs >= wallClockKillMs * 0.8;
}

/**
 * Per-language time allowance: `problemLimit * multiplier + startupBudgetMs`.
 *
 * The additive term is the point. Runtime startup is a fixed cost that has nothing to do
 * with the student's algorithm, and folding it into a multiplier makes short problems
 * unjudgeable while giving long ones far too much slack.
 *
 * ## MEASUREMENT CONDITIONS — read these before changing a number
 *
 * All figures from this build host, inside the real isolation flags at `--cpus=1`, for a
 * program that does no meaningful work. This host is **not a clean judge host**: an
 * unrelated container stack runs alongside, which is exactly what PRD §14 says to avoid.
 * Container creation alone costs 2.4–15.6 s and varies run to run.
 *
 *   Java, quiet host      1010, 1479, 1815, 2374, 3659, 5342 ms  (5.3x spread)
 *   Python, quiet host    1006, 1042, 1114, 1319, 1377, 1418, 1505, 1651 ms  (median 1377)
 *   Python, under churn   up to 4327 ms observed across the 20 reference solutions
 *
 * **The same mistake was made twice, once per language: a budget fitted on a quiet host
 * that became wrong under load.** Python's first budget was 1000 ms — below the *minimum*
 * startup measured on an idle machine — and it failed 8 of 20 correct reference solutions
 * as TLE. Both numbers below are sized for the LOADED case, because a judge that is only
 * correct when the machine is idle is not correct.
 *
 * Re-measure on a dedicated judge host rather than guessing; both should drop sharply,
 * Java to roughly 3 s and Python to well under 1 s.
 *
 * A 6-second Java allowance therefore fails correct solutions intermittently — which is
 * exactly what happened to the java-wa-multiplies fixture before this change, and is far
 * worse than being generous: a flaky TLE on a correct submission is indistinguishable from
 * a broken judge to the student holding the keyboard.
 *
 * Under the full fixture suite — with container churn and, on this machine, an unrelated
 * container stack competing for CPU — the Java tail exceeded even a 12-second allowance. The
 * budget below covers that tail. PRD §14's real mitigation is a dedicated judge host; on one,
 * `JAVA.startupBudgetMs` can safely drop to around 3000.
 *
 * The 3x wall-clock kill from PRD §7.1 is applied to the ALGORITHM portion only, with the
 * startup budget added once. Multiplying a fixed startup cost by three would make proving a
 * timeout take minutes without making the judgement any more correct.
 */
export const RUNTIME_BUDGETS = {
  PYTHON: { multiplier: 1, startupBudgetMs: 6_000 },
  JAVA: { multiplier: 2, startupBudgetMs: 20_000 },
} as const;

/**
 * Bytes of stdout to capture for one test before treating the run as a flood.
 *
 * Derived from the expected output, never fixed. A correct solution cannot produce
 * meaningfully more than the expected answer, so twice it plus slack is generous, while a
 * hostile fixture writing 1 GB still trips it within the first moments.
 *
 * A fixed 1 MiB cap is what made a *correct* `cut-the-sticks` submission report `WA`. Its
 * expected output is 1.29 MB, so the judge captured a megabyte, killed the container, and
 * returned the verdict a wrong answer gets — the worst failure this judge can produce,
 * because the student has no way to tell it from their own bug. It survived G4 at 24/24
 * because every fixture used a problem whose output is a single line.
 */
export function outputCapFor(expectedBytes: number): number {
  return Math.max(OUTPUT_CAP_FLOOR_BYTES, expectedBytes * 2 + 64 * 1024);
}

/**
 * NOTE: the host no longer wraps commands in `timeout`. The batch driver applies `timeout`
 * per test INSIDE the container, which is both what PRD §7.1's per-submission container
 * implies and the only place the program's own clock can be measured — container creation
 * costs 2.4-15.6 s here and must never be charged to a student.
 *
 * The exit statuses that mean the kill fired are interpreted by `hitWallClock` below.
 */


/**
 * Read one test's outcome from the batch results directory.
 *
 * Returns null when the `.meta` file is absent, which means the container never reached this
 * test — an OOM kill, a fork bomb, or the host backstop. The caller re-runs those individually.
 */
async function readBatchOutcome(
  resultDir: string,
  ordinal: number,
  cap: number,
): Promise<BatchTestOutcome | null> {
  const metaPath = path.join(resultDir, `${String(ordinal)}.meta`);

  let meta: { exitCode: number; durationMs: number; rawBytes: number } | null = null;
  try {
    meta = parseMeta(await readFile(metaPath, "utf8"));
  } catch {
    return null;
  }
  if (meta === null) return null;

  const read = async (suffix: string): Promise<string> => {
    try {
      return await readFile(path.join(resultDir, `${String(ordinal)}.${suffix}`), "utf8");
    } catch {
      return "";
    }
  };

  const stdout = (await read("out")).slice(0, cap);
  return {
    ordinal,
    exitCode: meta.exitCode,
    durationMs: meta.durationMs,
    rawBytes: meta.rawBytes,
    stdout,
    stderr: await read("err"),
  };
}

/**
 * Run a single test in its own container — the fallback path when the batch died before
 * reaching it.
 *
 * This is the original per-test implementation, kept precisely because batching cannot handle
 * a test that kills the container. A submission that OOMs on test 1 would otherwise forfeit
 * tests 2 and 3, and PRD §6.1 awards partial credit per test case: a speed optimisation must
 * not cost a student points that isolation would have earned them.
 */
async function runSingleTest(options: {
  spec: LanguageSpec;
  limits: ContainerLimits;
  sourceDir: string;
  inputDir: string;
  job: JudgeJob;
  ordinal: number;
  cap: number;
  perTestKillMs: number;
}): Promise<ContainerRunResult | null> {
  const { spec, limits, sourceDir, inputDir, job, ordinal, cap, perTestKillMs } = options;

  const resultDir = await mkdtemp(path.join(SCRATCH_ROOT, "retry-"));
  try {
    await runInContainer({
      image: spec.image,
      argv: ["/bin/sh", "/in/driver.sh"],
      sourceDir,
      inputDir,
      outputDir: resultDir,
      limits,
      name: containerName(job, `retry-t${String(ordinal)}`),
      outputCapBytes: 64 * 1024,
      env: {
        PTCN_TESTS: String(job.testCases.length),
        PTCN_ONLY: String(ordinal),
        PTCN_TIMEOUT: String(Math.max(1, Math.ceil(perTestKillMs / 1000))),
        PTCN_COMPILE_TIMEOUT: String(Math.max(1, Math.ceil(spec.compileTimeoutMs / 1000))),
        PTCN_CAP: String(cap),
      },
    });

    const outcome = await readBatchOutcome(resultDir, ordinal, cap);
    if (outcome === null) return null;

    return {
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      exitCode: outcome.exitCode,
      oomKilled: false,
      timedOut: false,
      outputTruncated: outcome.rawBytes > Buffer.byteLength(outcome.stdout, "utf8"),
      durationMs: outcome.durationMs,
      wallMs: outcome.durationMs,
    };
  } finally {
    await rm(resultDir, { recursive: true, force: true });
  }
}

/** Read the driver's compile status, if the language had a compile step. */
async function readCompileStatus(
  resultDir: string,
): Promise<{ exitCode: number; stderr: string } | null> {
  try {
    const raw = await readFile(path.join(resultDir, "compile.meta"), "utf8");
    const exitCode = Number(raw.trim());
    if (!Number.isFinite(exitCode)) return null;

    let stderr = "";
    try {
      stderr = await readFile(path.join(resultDir, "compile.err"), "utf8");
    } catch {
      stderr = "";
    }
    return { exitCode, stderr };
  } catch {
    return null;
  }
}

export async function judge(job: JudgeJob, images: JudgeImages): Promise<JudgeResult> {
  const spec = languageSpec(job, images);
  const limits = containerLimits(job);

  const budget = RUNTIME_BUDGETS[job.language];
  const algorithmMs = job.limits.timeLimitMs * budget.multiplier;
  const timeLimitMs = algorithmMs + budget.startupBudgetMs;
  const wallClockKillMs = algorithmMs * 3 + budget.startupBudgetMs;

  await mkdir(SCRATCH_ROOT, { recursive: true });
  const workspace = await mkdtemp(path.join(SCRATCH_ROOT, "job-"));
  const sourceDir = path.join(workspace, "src");

  try {
    await mkdir(sourceDir, { recursive: true });
    await writeFile(path.join(sourceDir, spec.sourceFile), job.sourceCode, "utf8");

    // --- ONE container: compile, then every test -------------------------
    const inputDir = path.join(workspace, "in");
    const resultDir = path.join(workspace, "res");
    await mkdir(inputDir, { recursive: true });
    await mkdir(resultDir, { recursive: true });

    const expectedByOrdinal = new Map<number, string>();
    const inputByOrdinal = new Map<number, string>();
    let largestCap = OUTPUT_CAP_FLOOR_BYTES;

    for (const [index, testCase] of job.testCases.entries()) {
      const ordinal = index + 1;
      const [input, expected] = await Promise.all([
        readFile(testCase.inputPath, "utf8"),
        readFile(testCase.expectedOutputPath, "utf8"),
      ]);
      inputByOrdinal.set(ordinal, input);
      expectedByOrdinal.set(ordinal, expected);
      largestCap = Math.max(largestCap, outputCapFor(Buffer.byteLength(expected, "utf8")));
      await writeFile(path.join(inputDir, `${String(ordinal)}.in`), input, "utf8");
    }

    // Commands ship as generated scripts rather than being interpolated into the driver, so
    // nothing inside the container ever evals a string.
    await writeFile(path.join(inputDir, "driver.sh"), BATCH_DRIVER, "utf8");
    await writeFile(path.join(inputDir, "run.sh"), `${spec.runCommand}\n`, "utf8");
    if (spec.compileCommand !== undefined) {
      await writeFile(path.join(inputDir, "compile.sh"), `${spec.compileCommand}\n`, "utf8");
    }

    const batch = await runInContainer({
      image: spec.image,
      argv: ["/bin/sh", "/in/driver.sh"],
      sourceDir,
      inputDir,
      outputDir: resultDir,
      limits: {
        ...limits,
        // The driver buffers each answer in the tmpfs before copying it out, and Java's build
        // output lands there too, so the tmpfs must hold the largest legitimate answer with
        // room to spare. A flood still hits ENOSPC in RAM that dies with the container rather
        // than filling the host disk.
        tmpfsBytes: Math.max(limits.tmpfsBytes, largestCap * 2 + 64 * 1024 * 1024),
      },
      name: containerName(job, "run"),
      // The backstop covers the WHOLE container now: every test plus the compile. Sizing it
      // for a single test is what killed a three-test TLE fixture partway through test 3.
      containerKillMs:
        wallClockKillMs * job.testCases.length + spec.compileTimeoutMs,
      // The driver itself emits almost nothing; per-test answers go to /out.
      outputCapBytes: 64 * 1024,
      env: {
        PTCN_TESTS: String(job.testCases.length),
        PTCN_TIMEOUT: String(Math.max(1, Math.ceil(wallClockKillMs / 1000))),
        PTCN_COMPILE_TIMEOUT: String(Math.max(1, Math.ceil(spec.compileTimeoutMs / 1000))),
        PTCN_CAP: String(largestCap),
      },
    });

    // A non-zero compile status short-circuits everything: no test ran, so there is nothing to
    // aggregate and no points to award. Compiler stderr goes back verbatim (PRD §7.2) — the
    // compiler is describing the student's own code, so nothing about the tests leaks.
    const compileStatus = await readCompileStatus(resultDir);
    if (compileStatus !== null && compileStatus.exitCode !== 0) {
      return aggregate({
        submissionId: job.submissionId,
        results: [],
        testCases: job.testCases,
        compileError: compileStatus.stderr.trim() || "Compilation failed",
      });
    }

    const results: JudgeTestResult[] = [];

    for (const [index, testCase] of job.testCases.entries()) {
      const ordinal = index + 1;
      const expected = expectedByOrdinal.get(ordinal) ?? "";
      const input = inputByOrdinal.get(ordinal) ?? "";

      const outcome = await readBatchOutcome(resultDir, ordinal, largestCap);

      // No .meta means the container died before reaching this test — an OOM kill, a fork
      // bomb, or the host backstop. Re-run just the missing tests in their own containers so
      // partial credit survives: batching is a speed optimisation and must not cost a student
      // points that per-test isolation would have earned them.
      const retried =
        outcome === null
          ? await runSingleTest({
              spec,
              limits,
              sourceDir,
              inputDir,
              job,
              ordinal,
              cap: largestCap,
              perTestKillMs: wallClockKillMs,
            })
          : null;

      const run: ContainerRunResult =
        outcome === null
          ? // A retry that produced no result at all means the judge could not determine
            // anything about this test. That is IE territory, not a student-facing failure.
            (retried ?? {
              stdout: "",
              stderr: "judge could not run this test",
              exitCode: null,
              oomKilled: batch.oomKilled,
              timedOut: batch.timedOut,
              outputTruncated: false,
              durationMs: 0,
              wallMs: 0,
            })
          : {
              stdout: outcome.stdout,
              stderr: outcome.stderr,
              exitCode: outcome.exitCode,
              // A container-level OOM kills the whole batch, so it is attributed to the test
              // that was running when the metas stopped appearing.
              oomKilled: batch.oomKilled && ordinal === results.length + 1,
              timedOut: false,
              outputTruncated: outcome.rawBytes > Buffer.byteLength(outcome.stdout, "utf8"),
              durationMs: outcome.durationMs,
              wallMs: outcome.durationMs,
            };

      let verdict: Verdict;
      try {
        verdict = verdictFor(run, timeLimitMs, wallClockKillMs, () =>
          matches(job.comparator, run.stdout, expected, input),
        );
      } catch (error) {
        // A misconfigured special judge must not silently mark everyone wrong. IE alerts an
        // admin instead.
        if (error instanceof UnknownCheckerError) verdict = "IE";
        else throw error;
      }

      results.push({
        testCaseId: testCase.testCaseId,
        verdict,
        runtimeMs: run.durationMs,
        memoryKb: null,
        diffSnippet:
          verdict === "WA"
            ? buildDiffSnippet(run.stdout, expected, testCase.isSample)
            : verdict === "RE" && testCase.isSample
              ? buildErrorSnippet(run.stderr)
              : null,
      });
    }

    return aggregate({
      submissionId: job.submissionId,
      results,
      testCases: job.testCases,
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
