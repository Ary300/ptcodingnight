import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { aggregate } from "@/lib/judge/aggregate";
import { matches, UnknownCheckerError } from "@/lib/judge/comparators";
import { buildDiffSnippet, buildErrorSnippet } from "@/lib/judge/diff";
import type { JudgeJob, JudgeResult, JudgeTestResult, Verdict } from "@/lib/schemas/judge";
import { runtimeFor, variantFor, type Runtime, type Variant } from "@/lib/judge/runtimes";
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

/**
 * Kept as an optional override so a caller can pin different images (a test host with
 * pre-pulled tags, say). Absent means the registry's images, which is the normal case.
 *
 * It is no longer a per-language map: the registry owns which image a language uses, and
 * adding a language must not require a new field here.
 */
export type ImageOverrides = Partial<Record<string, string>>;

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
 * Per-language budgets now live in `lib/judge/runtimes.ts`.
 *
 * They moved because they are a property of the RUNTIME, not of the runner: Java's four
 * language levels share one JVM and therefore one measured budget, and keeping the numbers next
 * to the image they were measured against is what stops them drifting apart. The effective
 * limits are still computed the same way:
 *
 *     effectiveLimit = problemLimit * multiplier + startupBudgetMs
 *     wallClockKill  = problemLimit * multiplier * 3 + startupBudgetMs
 *
 * with PRD §7.1's 3x applied to the algorithm portion only, the fixed startup cost added once.
 */


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
  image: string;
  runtime: Runtime;
  variant: Variant;
  limits: ContainerLimits;
  sourceDir: string;
  inputDir: string;
  buildDir: string;
  job: JudgeJob;
  ordinal: number;
  cap: number;
  perTestKillMs: number;
}): Promise<ContainerRunResult | null> {
  const { image, runtime, variant, limits, sourceDir, inputDir, buildDir, job, ordinal, cap,
    perTestKillMs } = options;

  const resultDir = await mkdtemp(path.join(SCRATCH_ROOT, "retry-"));
  try {
    await runInContainer({
      image,
      argv: ["/bin/sh", "/in/driver.sh"],
      sourceDir,
      inputDir,
      outputDir: resultDir,
      // The artifacts still exist on the host from the build container, so a retry does not
      // rebuild — which is the whole reason the build was hoisted out of the run container.
      readonlyDir: variant.producesArtifacts ? buildDir : undefined,
      limits,
      name: containerName(job, `retry-t${String(ordinal)}`),
      containerKillMs: perTestKillMs + runtime.compileTimeoutMs,
      outputCapBytes: 64 * 1024,
      env: {
        PTCN_TESTS: String(job.testCases.length),
        PTCN_ONLY: String(ordinal),
        PTCN_TIMEOUT: String(Math.max(1, Math.ceil(perTestKillMs / 1000))),
        PTCN_COMPILE_TIMEOUT: String(Math.max(1, Math.ceil(runtime.compileTimeoutMs / 1000))),
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

export async function judge(job: JudgeJob, images?: ImageOverrides): Promise<JudgeResult> {
  // Everything language-specific comes from the registry. There is no switch on job.language
  // anywhere in this file, and adding C++20 or Rust must not add one.
  const variant: Variant = variantFor(job.language);
  const runtime: Runtime = runtimeFor(job.language);
  const image = images?.[runtime.id] ?? runtime.image;

  const algorithmMs = job.limits.timeLimitMs * runtime.multiplier;
  const timeLimitMs = algorithmMs + runtime.startupBudgetMs;
  const wallClockKillMs = algorithmMs * 3 + runtime.startupBudgetMs;

  const runLimits = containerLimits(job);

  await mkdir(SCRATCH_ROOT, { recursive: true });
  const workspace = await mkdtemp(path.join(SCRATCH_ROOT, "job-"));
  const sourceDir = path.join(workspace, "src");
  const buildDir = path.join(workspace, "build");
  const inputDir = path.join(workspace, "in");
  const resultDir = path.join(workspace, "res");

  try {
    await mkdir(sourceDir, { recursive: true });
    await mkdir(buildDir, { recursive: true });
    await mkdir(inputDir, { recursive: true });
    await mkdir(resultDir, { recursive: true });
    await writeFile(path.join(sourceDir, variant.sourceFile), job.sourceCode, "utf8");

    // --- build, in its OWN container when it emits artifacts --------------
    //
    // A cgroup has one memory cap, so a container sized for javac's 1 GB cannot also hold the
    // program to the problem's 256 MB — and MLE detection depends on that cap being the
    // problem's. Compiled languages therefore build separately, at the runtime's compile
    // memory limit, and hand /build to the run container read-only.
    if (variant.compileCommand !== undefined && variant.producesArtifacts) {
      await writeFile(path.join(inputDir, "compile.sh"), `${variant.compileCommand}\n`, "utf8");

      const compile = await runInContainer({
        image,
        argv: [
          "timeout",
          "-k",
          "1",
          String(Math.max(1, Math.ceil(runtime.compileTimeoutMs / 1000))),
          "/bin/sh",
          "/in/compile.sh",
        ],
        sourceDir,
        inputDir,
        // Writable /build here; the run container gets the same directory read-only.
        writableBuildDir: buildDir,
        limits: {
          ...runLimits,
          memoryLimitMb: runtime.compileMemoryLimitMb,
          pidsLimit: runtime.compilePidsLimit,
          tmpfsBytes: runtime.compileTmpfsBytes,
          cpus: runtime.compileCpus,
        },
        name: containerName(job, "build"),
        containerKillMs: runtime.compileTimeoutMs,
        outputCapBytes: 256 * 1024,
      });

      if (compile.exitCode !== 0) {
        return aggregate({
          submissionId: job.submissionId,
          results: [],
          testCases: job.testCases,
          // Verbatim compiler stderr. The compiler is describing the student's own code, so
          // nothing about the hidden tests leaks (PRD §7.2), and a truncated or paraphrased
          // g++ template error is useless to them.
          compileError: compile.stderr.trim() || "Compilation failed",
        });
      }
    }

    // --- ONE container: every test for this submission --------------------
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

    await writeFile(path.join(inputDir, "driver.sh"), BATCH_DRIVER, "utf8");
    await writeFile(path.join(inputDir, "run.sh"), `${variant.runCommand}\n`, "utf8");

    // A parse-only check writes nothing, so it costs nothing to do inside the run container.
    // An artifact-producing build already ran above and its compile.sh must NOT run again.
    if (variant.compileCommand !== undefined && !variant.producesArtifacts) {
      await writeFile(path.join(inputDir, "compile.sh"), `${variant.compileCommand}\n`, "utf8");
    } else if (variant.producesArtifacts) {
      await rm(path.join(inputDir, "compile.sh"), { force: true });
    }

    const batch = await runInContainer({
      image,
      argv: ["/bin/sh", "/in/driver.sh"],
      sourceDir,
      inputDir,
      outputDir: resultDir,
      // Compiled artifacts arrive read-only: the program must not be able to rewrite the
      // binary it is running from between tests.
      readonlyDir: variant.producesArtifacts ? buildDir : undefined,
      limits: {
        ...runLimits,
        tmpfsBytes: Math.max(runLimits.tmpfsBytes, largestCap * 2 + 64 * 1024 * 1024),
      },
      name: containerName(job, "run"),
      containerKillMs: wallClockKillMs * job.testCases.length + runtime.compileTimeoutMs,
      outputCapBytes: 64 * 1024,
      env: {
        PTCN_TESTS: String(job.testCases.length),
        PTCN_TIMEOUT: String(Math.max(1, Math.ceil(wallClockKillMs / 1000))),
        PTCN_COMPILE_TIMEOUT: String(Math.max(1, Math.ceil(runtime.compileTimeoutMs / 1000))),
        PTCN_CAP: String(largestCap),
      },
    });

    // A parse-only check that failed is still a CE.
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

      const retried =
        outcome === null
          ? await runSingleTest({
              image,
              runtime,
              variant,
              limits: runLimits,
              sourceDir,
              inputDir,
              buildDir,
              job,
              ordinal,
              cap: largestCap,
              perTestKillMs: wallClockKillMs,
            })
          : null;

      const run: ContainerRunResult =
        outcome === null
          ? (retried ?? {
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
