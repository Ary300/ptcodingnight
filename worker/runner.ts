import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
import { withHostMaxProcs } from "./host";
import { BATCH_DRIVER, parseMeta, type BatchTestOutcome } from "@/worker/batch-driver";
import { removeAsRoot } from "@/worker/docker";
import { scaledStartupBudgetMs } from "@/worker/host";

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
 *
 * `JUDGE_SCRATCH_ROOT` overrides it, and a containerised worker MUST set it.
 *
 * These directories are bind-mounted into each judge container by the HOST daemon, which
 * resolves the path in the host's namespace. A worker running inside a container therefore
 * hands over a path that means something different — or nothing — on the other side, and the
 * judge container gets an empty mount with no error anywhere. `docker-compose.prod.yml` mounts
 * one host directory at the identical path inside the worker so the two namespaces agree.
 */
const SCRATCH_ROOT =
  process.env.JUDGE_SCRATCH_ROOT ?? path.join(process.cwd(), ".judge-tmp");

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
  /**
   * Checked before the wall clock, because the watchdog kills the container and the kill then
   * looks exactly like a timeout. Reporting `TLE` for a submission that tried to fill the judge
   * host would hide the only interesting thing about it.
   *
   * `RE` rather than a new verdict: the program did something the runtime refused to let it
   * finish, which is what `RE` means here, and a verdict a student has never seen on a scoreboard
   * is a support question during a contest. The organizer gets the detail from the worker log.
   */
  if (run.diskExceeded) return "RE";
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
    fsizeBytes: job.limits.tmpfsBytes,
  };
}

/**
 * Total bytes a submission may leave in the writable `/out` mount (T4).
 *
 * Derived from the cap the driver is already allowed to write per test, not chosen: the driver
 * writes one `.out` of at most `largestCap` and one small `.meta` per test, so the legitimate
 * total is bounded by `largestCap × tests`. Doubling that and adding a fixed floor leaves room
 * for the `.meta` files and for a compiler's artifacts without leaving room for a disk-fill.
 *
 * Sizing this from a guess rather than from the driver's own cap is how a legitimate large
 * answer gets killed and reported as `WA` — the same mistake `outputCapFor` exists to avoid, and
 * one this project has already shipped once.
 */
export function outputDirBudget(largestCap: number, testCount: number): number {
  return largestCap * Math.max(1, testCount) * 2 + 64 * 1024 * 1024;
}

/**
 * How many files the batch driver legitimately leaves in `/out`.
 *
 * Known exactly rather than guessed: `<n>.out`, `<n>.err` and `<n>.meta` per test, plus
 * `compile.out`, `compile.err`, `compile.meta` and `complete`. The slack is for a runtime that
 * drops something of its own beside them.
 *
 * This is the cheap half of the disk watchdog — see `exceedsWritableBudget`. A byte total cannot
 * be measured fast enough to catch a program creating thousands of files, but a file count can.
 */
export function outputDirFileLimit(testCount: number): number {
  return Math.max(1, testCount) * 3 + 16;
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
/**
 * Whether the batch's SELF-REPORTED per-test timings can be believed.
 *
 * ## The attack this closes
 *
 * `/out` is bind-mounted read-write so the driver can hand results back, and the student's program
 * runs as the same uid as the driver in the same container. So a submission can write its own
 * `/out/N.meta`, and the file the host reads carries the exit code, the duration, and the raw byte
 * count that `verdictFor` trusts.
 *
 * A slow-but-correct solution could therefore:
 *
 *   1. finish inside the in-container `timeout` (3x the limit) but over the problem's own limit,
 *   2. fork a detached loop writing `0 5 0` over every `.meta` — `--pids-limit` allows it, and
 *      `timeout` only waits on its direct child, so the orphan outlives the program,
 *   3. be read by the host as "exit 0, 5 ms" and score **AC** on the real stdout.
 *
 * The batch driver's own comment claimed forging `/out` "buys it nothing, because expected outputs
 * are never mounted". That is true of the answers and false of the timings.
 *
 * ## Why a comparison against the container clock works
 *
 * `batch.durationMs` comes from the Docker daemon's `State.StartedAt`/`FinishedAt` — outside the
 * container, unreachable from inside it. The tests genuinely ran, so their real total is bounded
 * above by the container's lifetime. A forged total is far BELOW it.
 *
 * The allowance has to be generous, because the container legitimately spends time the tests do not
 * account for: image start, the compile step, the shell, and the driver's own copies. Startup alone
 * measured up to 38 s for the JVM on this host. So this only fires when the claim is implausibly
 * small — orders of magnitude, not percentages — and a correct submission is never caught by it.
 */
export function selfReportedTimingIsCredible(input: {
  readonly claimedTotalMs: number;
  readonly containerMs: number;
  readonly startupBudgetMs: number;
}): boolean {
  const { claimedTotalMs, containerMs, startupBudgetMs } = input;

  // Everything the container spends that is not the tests themselves: image start, compile, shell,
  // the driver's copies. Doubling the startup budget and adding a flat floor keeps a fast, honest
  // submission comfortably inside the allowance.
  const unaccountedAllowanceMs = startupBudgetMs * 2 + 10_000;

  // The container was quick enough that nothing could have been hidden in it.
  if (containerMs <= unaccountedAllowanceMs) return true;

  const unexplainedMs = containerMs - unaccountedAllowanceMs - claimedTotalMs;

  // Believe it unless a large amount of container time is unaccounted for. This is deliberately
  // lax: a false positive fails a correct student, which is worse than letting a marginal case
  // through, and the honest reading of a big gap is "the tests really did take that long".
  return unexplainedMs <= unaccountedAllowanceMs;
}

/**
 * Hands the container one test input at a time, and removes each once its test has finished.
 *
 * Runs concurrently with the container. The handshake is the driver's own `<n>.meta`, which it
 * writes only after test n has exited — so seeing it means test n is done and its input can go,
 * and test n+1's can appear.
 *
 * At any instant the container's `/in` holds **at most one** test input: the one currently being
 * fed to the program on stdin, which it is entitled to see. Earlier inputs are gone and later ones
 * have not arrived, so there is nothing to read ahead to and nothing to go back for.
 *
 * `/in` is mounted read-only INSIDE the container; the host still owns the directory and can write
 * to it freely. The container cannot interfere with the feed.
 *
 * The feeder never rejects. If it dies the driver simply waits for an input that never comes and is
 * killed by the container backstop, and those tests are re-run individually — the existing missing
 * `.meta` path. A crashed feeder must not also crash the judge.
 */
async function feedInputs(options: {
  readonly inputDir: string;
  readonly resultDir: string;
  readonly inputByOrdinal: ReadonlyMap<number, string>;
  readonly count: number;
  /**
   * Set by the caller the instant the container exits.
   *
   * **Without this the feeder deadlocks the judge.** A container that dies at test 1 — an MLE
   * fixture, a fork bomb, the host backstop — never writes `2.meta`, so the feeder waits for a
   * file that is never coming while the runner waits for the feeder. The first version used only
   * a 30-minute ceiling and turned a 21-minute G4 into an hour with no output.
   */
  readonly stopped: { value: boolean };
}): Promise<void> {
  const { inputDir, resultDir, inputByOrdinal, count, stopped } = options;

  // Short enough that it costs a test a few milliseconds, long enough not to spin a core. Container
  // creation on this host is seconds, so this is noise by comparison.
  const POLL_MS = 25;
  // A bound, not a deadline: the container's own backstop is the real limit. This only stops the
  // feeder looping forever if the container has already gone.
  const MAX_WAIT_MS = 30 * 60 * 1000;

  const startedAt = Date.now();

  for (let ordinal = 1; ordinal <= count; ordinal += 1) {
    const metaPath = path.join(resultDir, `${String(ordinal)}.meta`);

    while (!stopped.value && Date.now() - startedAt < MAX_WAIT_MS) {
      try {
        await readFile(metaPath, "utf8");
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
    }

    // The container is gone. Nothing will consume another input, and the remaining tests are
    // re-run individually by the missing-`.meta` path.
    if (stopped.value) return;

    // This test is finished with its input.
    await rm(path.join(inputDir, `${String(ordinal)}.in`), { force: true }).catch(() => undefined);

    const next = inputByOrdinal.get(ordinal + 1);
    if (next !== undefined) {
      await writeFile(path.join(inputDir, `${String(ordinal + 1)}.in`), next, "utf8").catch(
        () => undefined,
      );
    }
  }
}

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
  /** This test's input. Inputs are fed one at a time and removed after use, so a retry re-places it. */
  inputText: string;
}): Promise<ContainerRunResult | null> {
  const { image, runtime, variant, limits, sourceDir, inputDir, buildDir, job, ordinal, cap,
    perTestKillMs } = options;

  const resultDir = await mkdtemp(path.join(SCRATCH_ROOT, "retry-"));
  try {
    // The feeder is not running for a retry, so this test's input has to be placed directly — and
    // only this one. The sequential feed removed it when its original attempt finished.
    const retryInput = options.inputText;
    await writeFile(path.join(inputDir, `${String(ordinal)}.in`), retryInput, "utf8");

    await runInContainer({
      image,
      argv: ["/bin/sh", "/in/driver.sh"],
      sourceDir,
      inputDir,
      outputDir: resultDir,
      // The artifacts still exist on the host from the build container, so a retry does not
      // rebuild — which is the whole reason the build was hoisted out of the run container.
      readonlyDir: variant.producesArtifacts ? buildDir : undefined,
      // fsize tracks whatever tmpfs this retry was given, exactly as the batch container does.
      limits: { ...limits, fsizeBytes: limits.tmpfsBytes },
      name: containerName(job, `retry-t${String(ordinal)}`),
      containerKillMs: perTestKillMs + runtime.compileTimeoutMs,
      outputCapBytes: 64 * 1024,
      /**
       * The retry needs the disk bounds as much as the batch does — arguably more.
       *
       * Leaving them off here was not a small omission. A submission that fills `/out` gets its
       * batch container killed, which means no `.meta`, which is precisely the condition that
       * *triggers* this retry. So the disk-fill path led directly into the one container with no
       * disk bound: measured, the batch was correctly contained to 268 MB and the retry then
       * wrote **8.6 GB** to the host.
       *
       * One test's worth of budget, because that is what a retry runs.
       */
      outputDirBudgetBytes: outputDirBudget(cap, 1),
      outputDirMaxFiles: outputDirFileLimit(1),
      env: {
        PTCN_TESTS: String(job.testCases.length),
        PTCN_ONLY: String(ordinal),
        PTCN_TIMEOUT: String(Math.max(1, Math.ceil(perTestKillMs / 1000))),
        PTCN_COMPILE_TIMEOUT: String(Math.max(1, Math.ceil(runtime.compileTimeoutMs / 1000))),
        PTCN_CAP: String(cap),
        // The input is already on disk for a retry, so the driver never waits. One poll is enough.
        PTCN_FEED_TIMEOUT: "1",
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
      // A retry that produced a readable `.meta` did not blow the disk budget — the watchdog
      // kills the container before the driver can finish writing one.
      diskExceeded: false,
    };
  } finally {
    /**
     * Remove THIS retry's input as well as its results.
     *
     * `feedInputs` enforces the H3 invariant — at most one test input exists in `/in` at any
     * instant — but it is stopped before the retry loop begins, and each retry writes its own
     * input and never took it away. So a submission that kills its batch container early (memory
     * bomb, fork bomb, filling `/out`) has every remaining test retried in order, and `/in`
     * ACCUMULATES: by retry k the container mounts inputs 1..k, all readable by the student's
     * program, which runs as the same uid as the driver.
     *
     * No client-visible leak follows today, because samples occupy the lowest ordinals and the
     * snippet channel is only open for samples. That is an unstated property of how problems
     * happen to be authored, not a control — a single problem with a sample at a high ordinal
     * turns it into a hidden-input disclosure.
     */
    await rm(path.join(inputDir, `${String(ordinal)}.in`), { force: true }).catch(
      () => undefined,
    );
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
  // Scaled, not raw. The registry's budgets describe native Linux; a virtualised dev host declares
  // itself with JUDGE_STARTUP_BUDGET_SCALE rather than having its slowness written into the rules.
  const startupMs = scaledStartupBudgetMs(runtime.startupBudgetMs);
  const timeLimitMs = algorithmMs + startupMs;
  const wallClockKillMs = algorithmMs * 3 + startupMs;

  const runLimits = containerLimits(job);

  await mkdir(SCRATCH_ROOT, { recursive: true });
  const workspace = await mkdtemp(path.join(SCRATCH_ROOT, "job-"));

  /**
   * Make the workspace traversable and the RESULT directory writable by the container's uid.
   *
   * `mkdtemp` creates 0700 owned by the worker process. The judge container runs as
   * `--user=65534:65534`, so on Linux it cannot traverse that parent — the driver cannot write
   * `<n>.meta`, every test falls to the retry path, the retry fails identically, and **every
   * submission reports IE**. It is invisible on macOS only because Docker Desktop's file-sharing
   * layer rewrites ownership (SECURITY.md A6).
   *
   * Narrow on purpose. `0o711` on the workspace grants traverse and NOT read, so the container
   * cannot list its siblings; only the results directory below is made writable. The field fix
   * somebody reaches for at 6pm — `chmod 777`, or dropping `--user` — would widen the source and
   * build mounts too and make both the timing-forgery and disk-fill classes strictly worse.
   */
  await chmod(workspace, 0o711);
  const sourceDir = path.join(workspace, "src");
  const buildDir = path.join(workspace, "build");
  const inputDir = path.join(workspace, "in");
  const resultDir = path.join(workspace, "res");

  try {
    await mkdir(sourceDir, { recursive: true });
    await mkdir(buildDir, { recursive: true });
    await mkdir(inputDir, { recursive: true });
    await mkdir(resultDir, { recursive: true });
    /**
     * The two directories a container is given write access to, and no others.
     *
     * ## `resultDir` — `/out` on the run container
     *
     * The batch driver writes each test's captured stdout and exit status here, as uid 65534.
     *
     * ## `buildDir` — `/build` on the COMPILE container
     *
     * **This one was missing, and it made every compiled language unjudgeable on real Linux.**
     *
     * The comment that used to sit here said `buildDir` "stays at their default mode and is
     * mounted read-only". That is true of the RUN container, which mounts it via `readonlyDir` so
     * a submission cannot rewrite the binary it is executing between tests. It was never true of
     * the compile container, which mounts the same directory via `writableBuildDir` precisely so
     * the compiler can emit its artifact — into a directory `mkdir` had left owned by the worker
     * at mode 0755, while the container runs as `--user=65534:65534`.
     *
     * So the compiler could traverse and not write:
     *
     *     /usr/bin/ld: cannot open output file /build/prog: Permission denied
     *
     * reported to the student as **CE on correct code**, for jdk21, gcc14 and go123 — every
     * runtime that emits a binary. python312 and node22 passed throughout, because their compile
     * step writes nothing (`python -c compile(...)`, `node --check`), which is exactly why the
     * failure looked language-specific rather than structural.
     *
     * Invisible on Docker Desktop, which rewrites file ownership across its VM boundary
     * (SECURITY.md A6). It appears the moment the judge runs on real Linux — which is every
     * deployment that matters, and none of the machines any gate had ever run on.
     *
     * Still narrow: the workspace above stays 0711 so a container cannot list its siblings, and
     * `sourceDir` and `inputDir` keep their default mode and are mounted read-only. Widening
     * those is what makes the timing-forgery (H2) and hidden-input (H3) classes worse.
     */
    await chmod(resultDir, 0o777);
    await chmod(buildDir, 0o777);
    await writeFile(path.join(sourceDir, variant.sourceFile), job.sourceCode, "utf8");

    // --- build, in its OWN container when it emits artifacts --------------
    //
    // A cgroup has one memory cap, so a container sized for javac's 1 GB cannot also hold the
    // program to the problem's 256 MB — and MLE detection depends on that cap being the
    // problem's. Compiled languages therefore build separately, at the runtime's compile
    // memory limit, and hand /build to the run container read-only.
    if (variant.compileCommand !== undefined && variant.producesArtifacts) {
      await writeFile(path.join(inputDir, "compile.sh"), `${withHostMaxProcs(variant.compileCommand)}\n`, "utf8");

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
          // fsize is the SIXTH axis on which compile limits differ from run limits, and it has to
          // be set here for the same reason as the other five (CLAUDE.md): inheriting the run
          // container's value would cap `javac` or `go build` at a size chosen for a student's
          // program, and the student sees CE on code that compiles perfectly well.
          fsizeBytes: runtime.compileTmpfsBytes,
        },
        name: containerName(job, "build"),
        containerKillMs: runtime.compileTimeoutMs,
        outputCapBytes: 256 * 1024,
        // `/build` is writable host disk too, and it is the compile container's `/out`. Bounded
        // generously — a compiler legitimately writes far more than a program does, and a cap
        // that fires on a real build is a CE on correct code.
        outputDirBudgetBytes: runtime.compileTmpfsBytes * 4 + 256 * 1024 * 1024,
        // Compilers legitimately emit many files — one .class per class, one object per unit —
        // so this is far looser than the run container's and is a runaway backstop rather than a
        // tight bound.
        outputDirMaxFiles: 4096,
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
    }

    // ONLY THE FIRST test's input is on disk when the container starts. The rest are fed one at a
    // time by `feedInputs` below, and each is deleted once its test has finished.
    //
    // Writing them all up front let a submission read every HIDDEN test's input — `/in` is
    // read-only but it is readable, and the program runs as the same uid as the driver. From
    // there, `print(open('/in/7.in').read()[k:k+199], file=sys.stderr)` on a SAMPLE test returns
    // 199 bytes at a time in that sample's diff snippet, which is legitimately shown to the
    // student. A few dozen submissions reconstruct the hidden inputs, and from there the answers
    // can be computed offline and hardcoded. PRD §7.2 says hidden test data never reaches the
    // client; this was a way for it to.
    const firstInput = inputByOrdinal.get(1);
    if (firstInput !== undefined) {
      await writeFile(path.join(inputDir, "1.in"), firstInput, "utf8");
    }

    await writeFile(path.join(inputDir, "driver.sh"), BATCH_DRIVER, "utf8");
    await writeFile(path.join(inputDir, "run.sh"), `${withHostMaxProcs(variant.runCommand)}\n`, "utf8");

    // A parse-only check writes nothing, so it costs nothing to do inside the run container.
    // An artifact-producing build already ran above and its compile.sh must NOT run again.
    if (variant.compileCommand !== undefined && !variant.producesArtifacts) {
      await writeFile(path.join(inputDir, "compile.sh"), `${withHostMaxProcs(variant.compileCommand)}\n`, "utf8");
    } else if (variant.producesArtifacts) {
      await rm(path.join(inputDir, "compile.sh"), { force: true });
    }

    // Runs alongside the container, handing over one input at a time. Started before the
    // container so the feeder is already watching when the first test finishes.
    const feedStopped = { value: false };
    const feeder = feedInputs({
      inputDir,
      resultDir,
      inputByOrdinal,
      count: job.testCases.length,
      stopped: feedStopped,
    });

    const batch = await runInContainer({
      image,
      argv: ["/bin/sh", "/in/driver.sh"],
      sourceDir,
      inputDir,
      outputDir: resultDir,
      // Compiled artifacts arrive read-only: the program must not be able to rewrite the
      // binary it is running from between tests.
      readonlyDir: variant.producesArtifacts ? buildDir : undefined,
      limits: (() => {
        const tmpfsBytes = Math.max(
          runLimits.tmpfsBytes,
          largestCap * 2 + 64 * 1024 * 1024,
        );
        // fsize tracks the tmpfs rather than the base limit: the tmpfs was already widened for a
        // large expected output, and a per-file cap below it would fail a legitimate answer that
        // the tmpfs was explicitly sized to hold.
        return { ...runLimits, tmpfsBytes, fsizeBytes: tmpfsBytes };
      })(),
      name: containerName(job, "run"),
      containerKillMs: wallClockKillMs * job.testCases.length + runtime.compileTimeoutMs,
      outputCapBytes: 64 * 1024,
      outputDirBudgetBytes: outputDirBudget(largestCap, job.testCases.length),
      outputDirMaxFiles: outputDirFileLimit(job.testCases.length),
      env: {
        PTCN_TESTS: String(job.testCases.length),
        PTCN_TIMEOUT: String(Math.max(1, Math.ceil(wallClockKillMs / 1000))),
        PTCN_COMPILE_TIMEOUT: String(Math.max(1, Math.ceil(runtime.compileTimeoutMs / 1000))),
        PTCN_CAP: String(largestCap),
        // 50ms polls. Sized against the whole container backstop rather than one test, because a
        // test waits for its input only after the PREVIOUS test has finished, and that one may
        // legitimately have run for the full wall-clock kill.
        PTCN_FEED_TIMEOUT: String(Math.max(20, Math.ceil((wallClockKillMs * 3) / 50))),
      },
    });

    // Tell the feeder to stop BEFORE awaiting it. The container has exited, so any `.meta` it was
    // waiting on will never appear — awaiting first would block for the full ceiling.
    feedStopped.value = true;
    await feeder.catch(() => undefined);

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

    // Read every self-reported duration first, so the batch can be cross-checked against a clock
    // the submission cannot touch. See `selfReportedTimingIsCredible`.
    const claimedTotalMs = (
      await Promise.all(
        job.testCases.map((_, index) => readBatchOutcome(resultDir, index + 1, largestCap)),
      )
    ).reduce((sum, outcome) => sum + (outcome?.durationMs ?? 0), 0);

    const timingCredible = selfReportedTimingIsCredible({
      claimedTotalMs,
      containerMs: batch.durationMs,
      startupBudgetMs: runtime.startupBudgetMs,
    });

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
              inputText: input,
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
              // A missing `.meta` after the watchdog fired is that submission filling the disk,
              // not the judge failing. Carrying the flag through is what keeps it out of `IE` —
              // and `IE` is never shown to a student as a failure (CLAUDE.md).
              diskExceeded: batch.diskExceeded,
            })
          : {
              stdout: outcome.stdout,
              stderr: outcome.stderr,
              exitCode: outcome.exitCode,
              oomKilled: batch.oomKilled && ordinal === results.length + 1,
              diskExceeded: batch.diskExceeded,
              // When the self-reported timing is not credible, every test in the batch is treated
              // as having hit the wall clock. That is the safe direction: a genuinely fast
              // submission whose batch was mis-measured gets re-examined by a human, while a
              // submission that forged its timing does not get the AC it was fishing for.
              timedOut: !timingCredible,
              outputTruncated: outcome.rawBytes > Buffer.byteLength(outcome.stdout, "utf8"),
              durationMs: timingCredible ? outcome.durationMs : batch.durationMs,
              wallMs: timingCredible ? outcome.durationMs : batch.durationMs,
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
    await removeWorkspace(workspace);
  }
}

/**
 * Remove a job workspace, including anything the container left behind that the worker cannot
 * unlink.
 *
 * `rm -rf` runs as the worker. A container running as uid 65534 can create directories inside the
 * writable mounts, and it creates them with ITS umask and ITS ownership — so the worker ends up
 * unable to write to a directory it needs to empty:
 *
 *     EACCES: permission denied, unlink '.../job-WyNUey/res/hidden/0'
 *
 * A failed cleanup is not cosmetic. Scratch accumulates on a box that also runs Postgres, and a
 * full disk stops the database accepting writes — which takes the contest down rather than one
 * submission.
 *
 * The fallback asks the daemon to delete the tree from a throwaway container running as root.
 * That is the same daemon that created the files, it touches only this job's directory, and it is
 * reached only when the ordinary removal has already failed.
 */
async function removeWorkspace(workspace: string): Promise<void> {
  try {
    await rm(workspace, { recursive: true, force: true });
    return;
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "judge.workspace.cleanup_fallback",
        workspace,
        reason: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  const removed = await removeAsRoot(workspace);
  if (!removed) {
    // Reported, never thrown: a workspace that will not delete must not fail a submission that
    // has already been judged.
    console.error(
      JSON.stringify({
        level: "error",
        event: "judge.workspace.leaked",
        workspace,
        detail: "scratch could not be removed; disk will accumulate",
      }),
    );
  }
}
