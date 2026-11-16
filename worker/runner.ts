import { mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { aggregate } from "@/lib/judge/aggregate";
import { matches, UnknownCheckerError } from "@/lib/judge/comparators";
import { buildDiffSnippet, buildErrorSnippet } from "@/lib/judge/diff";
import type {
  JudgeJob,
  JudgeResult,
  JudgeTestResult,
  JudgeTimings,
  Verdict,
} from "@/lib/schemas/judge";
import { runtimeFor, variantFor, type Runtime, type Variant } from "@/lib/judge/runtimes";
import {
  OUTPUT_CAP_FLOOR_BYTES,
  runInContainer,
  type ContainerControl,
  type ContainerLimits,
  type ControlStdin,
  type ContainerRunResult,
} from "@/worker/docker";
import { withHostMaxProcs } from "./host";
import {
  BATCH_DRIVER,
  doorbellFor,
  parseDoneLine,
  parseMeta,
  type BatchTestOutcome,
} from "@/worker/batch-driver";
import { scaledStartupBudgetMs } from "@/worker/host";
import {
  HARNESS_BACKSTOP_GRACE_S,
  HARNESS_PROTOCOL,
  HARNESS_SETTLE_TIMEOUT_S,
  HARNESS_START_TIMEOUT_S,
  JVM_DRIVER,
  parseRunMode,
  type RunMode,
} from "@/worker/jvm-driver";
import { harnessDeclineReason } from "@/worker/jvm-harness-eligibility";
import type { ContainerPool } from "@/worker/container-pool";
import { specsFor, startScript, type SlotNames, type SlotProfile } from "@/worker/slot-profile";
import { createWorkspace, removeWorkspace, SCRATCH_ROOT } from "@/worker/workspace";

/**
 * Judges one submission: prepare a source directory, compile if the language needs it, run
 * every test in its own fresh container, map each outcome to a verdict, aggregate.
 *
 * Nothing here executes student code in-process. Every execution goes through
 * `runInContainer`.
 */

/**
 * Kept as an optional override so a caller can pin different images (a test host with
 * pre-pulled tags, say). Absent means the registry's images, which is the normal case.
 *
 * It is no longer a per-language map: the registry owns which image a language uses, and
 * adding a language must not require a new field here.
 */
export type ImageOverrides = Partial<Record<string, string>>;

/**
 * How the tests of one submission were run, for the A/B harness and the worker log. Nothing in the
 * verdict depends on it.
 */
export interface RunReport {
  /** The variant has an in-process harness and it was switched on for this job. */
  readonly harnessOffered: boolean;
  /** Why the harness was not used for this submission, when it was offered and not used. */
  readonly declined: string | null;
  /** Per test, in ordinal order: the path that produced its result. */
  readonly modes: readonly (RunMode | "retry")[];
  /** The submission's containers were pre-created (worker/container-pool.ts), not made on demand. */
  readonly pooled: boolean;
}

export interface JudgeOptions {
  /**
   * Override for the in-process harness (worker/jvm-driver.ts). Absent means on, unless the worker
   * runs with JUDGE_JVM_HARNESS=off — the switch an organizer flips if the harness misbehaves on
   * the night, without a deploy.
   */
  readonly harness?: boolean;
  readonly onReport?: (report: RunReport) => void;
  /**
   * Containers created ahead of time (worker/container-pool.ts). A submission whose profile has a
   * ready slot uses it; otherwise its containers are created on demand, exactly as without a pool.
   */
  readonly pool?: ContainerPool;
}

/**
 * The creation profile of a submission's containers: what a pooled container must have been
 * created with to serve it. Built from the registry, the job's limits and the largest output cap,
 * and nothing else. `wallClockKillMs` is carried by every run as `containerKillMs`, never by the
 * container, so it is left out and does not split the pool by time limit.
 */
/**
 * The profile a job WILL ask the pool for, from the sizes of its expected outputs — for whoever
 * fills the pool ahead of a job (the worker's warm-up, the gates, the benchmark). `judge` itself
 * computes the same value from the bytes it reads.
 */
export async function slotProfileForJob(job: JudgeJob, images?: ImageOverrides): Promise<SlotProfile> {
  let largestCap = OUTPUT_CAP_FLOOR_BYTES;
  for (const testCase of job.testCases) {
    const { size } = await stat(testCase.expectedOutputPath);
    largestCap = Math.max(largestCap, outputCapFor(size));
  }
  return slotProfileFor(job, images, largestCap);
}

export function slotProfileFor(job: JudgeJob, images: ImageOverrides | undefined, largestCap: number): SlotProfile {
  const variant = variantFor(job.language);
  const runtime = runtimeFor(job.language);
  const base = { ...containerLimits(job), wallClockKillMs: 0 };
  // Widened for a large expected output; fsize tracks it, so a per-file cap below the tmpfs cannot
  // fail a legitimate answer the tmpfs was sized to hold.
  const tmpfsBytes = Math.max(base.tmpfsBytes, largestCap * 2 + 64 * 1024 * 1024);
  return {
    image: images?.[runtime.id] ?? runtime.image,
    compile:
      variant.compileCommand !== undefined && variant.producesArtifacts
        ? {
            argv: [
              "timeout",
              "-k",
              "1",
              String(Math.max(1, Math.ceil(runtime.compileTimeoutMs / 1000))),
              "/bin/sh",
              "/in/compile.sh",
            ],
            limits: {
              ...base,
              memoryLimitMb: runtime.compileMemoryLimitMb,
              pidsLimit: runtime.compilePidsLimit,
              tmpfsBytes: runtime.compileTmpfsBytes,
              cpus: runtime.compileCpus,
              // fsize is the SIXTH axis on which compile limits differ from run limits, and it has
              // to be set here for the same reason as the other five (CLAUDE.md): inheriting the
              // run container's value would cap `javac` or `go build` at a size chosen for a
              // student's program, and the student sees CE on code that compiles perfectly well.
              fsizeBytes: runtime.compileTmpfsBytes,
            },
          }
        : null,
    run: { limits: { ...base, tmpfsBytes, fsizeBytes: tmpfsBytes }, mountsBuild: variant.producesArtifacts },
  };
}

function harnessSwitchedOn(options: JudgeOptions | undefined): boolean {
  if (options?.harness !== undefined) return options.harness;
  return (process.env.JUDGE_JVM_HARNESS ?? "on").toLowerCase() !== "off";
}

/**
 * The two queue-side clocks and the attempt number, handed in by `worker/index.ts`.
 *
 * BullMQ already stamps when a job was enqueued (`job.timestamp`) and when a worker picked it
 * up (`job.processedOn`); inventing clocks of our own for those two marks would just be a second
 * opinion that drifts. Optional, because the fixture harnesses (G4/G5/G13) call `judge()` with
 * no queue in front of it — with no facts, no timings are attached.
 */
export interface QueueTimingFacts {
  readonly enqueuedAtMs: number;
  readonly dequeuedAtMs: number;
  readonly attempt: number;
}

/**
 * A clock for stage marks: monotonic between marks, epoch-anchored in value.
 *
 * `Date.now()` can step (NTP corrections) mid-judge, and a stage duration derived from two
 * stepped wall readings can come out negative or wildly wrong. `performance.now()` cannot step,
 * so the marks are measured monotonically and anchored to the epoch once, at construction —
 * giving numbers that are comparable to `submittedAt`/`judgedAt` without inheriting the wall
 * clock's jumps between marks.
 */
function epochAnchoredClock(): () => number {
  const epochAnchorMs = Date.now();
  const monoAnchorMs = performance.now();
  return () => Math.round(epochAnchorMs + (performance.now() - monoAnchorMs));
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
 * Hands the container one test input at a time, removes each once its test has finished, and
 * FREEZES each test's results at the moment of the handover.
 *
 * ## The handshake
 *
 * The driver prints `ptcn-done <n>` on its stdout once test n's results are on disk; this feeder
 * then reads them, deletes input n, renames input n+1 into place, and rings `go <n+1>` on the
 * container's stdin. See `worker/batch-driver.ts` for the driver's half.
 *
 * It used to poll for `<n>.meta` every 25 ms while the driver polled for `<n>.in` every 50 ms. The
 * two polls cost ~57 ms of idle judge slot per test — measured, about a second of every Python
 * submission — and did no work in that time. The doorbell blocks instead of polling.
 *
 * At any instant the container's `/in` holds **at most one** test input: the one currently being
 * fed to the program on stdin, which it is entitled to see. Earlier inputs are gone and later ones
 * have not arrived, so there is nothing to read ahead to and nothing to go back for.
 *
 * ## Why results are frozen at the handover, and never read again
 *
 * `/out` is writable by the program, so anything the host reads AFTER the container exits could
 * have been written by any later test — including one that had a hidden input on its stdin. Under
 * the old file handshake a program could write `/out/1.meta` itself, collect the next inputs as the
 * feeder obligingly placed them, and finally rewrite `/out/1.out` — a SAMPLE, whose diff snippet the
 * student sees — with a hidden input's bytes. Freezing closes that: once test n is handed over, its
 * outcome is whatever was on disk at that moment, and `acknowledged` tells the caller never to
 * read n's files again. A forged early `ptcn-done` therefore freezes the program's OWN output and
 * gains it nothing.
 *
 * Out-of-order or unparseable lines are ignored, so a forged bell cannot skip the feeder ahead.
 *
 * The feeder never rejects. If a handover fails the driver waits for a bell that never comes, the
 * container exits when its backstop fires or its stdin closes, and the untouched tests are re-run
 * individually — the existing missing-`.meta` path. A crashed feeder must not also crash the judge.
 */
interface InputFeed {
  readonly control: ContainerControl;
  /** Outcomes read at the moment each test was handed over. */
  readonly frozen: ReadonlyMap<number, BatchTestOutcome>;
  /** Ordinals the driver reported finished. Their files are never read again. */
  readonly acknowledged: ReadonlySet<number>;
  /** Resolves when every handover the container triggered has finished. */
  readonly drained: () => Promise<void>;
}

function feedInputs(options: {
  readonly inputDir: string;
  readonly resultDir: string;
  readonly inputByOrdinal: ReadonlyMap<number, string>;
  readonly cap: number;
}): InputFeed {
  const { inputDir, resultDir, inputByOrdinal, cap } = options;
  const frozen = new Map<number, BatchTestOutcome>();
  const acknowledged = new Set<number>();
  let expected = 1;
  let chain: Promise<void> = Promise.resolve();

  const handOver = async (ordinal: number, stdin: ControlStdin): Promise<void> => {
    const outcome = await readBatchOutcome(resultDir, ordinal, cap);
    if (outcome !== null) frozen.set(ordinal, outcome);

    // This test is finished with its input.
    await rm(path.join(inputDir, `${String(ordinal)}.in`), { force: true }).catch(() => undefined);

    const next = inputByOrdinal.get(ordinal + 1);
    if (next === undefined) return;
    await placeInput(inputDir, ordinal + 1, next);
    // Only after the rename: the bell promises the input is complete.
    stdin.send(doorbellFor(ordinal + 1));
  };

  const control: ContainerControl = {
    initial: doorbellFor(1),
    onLine: (line, stdin) => {
      const ordinal = parseDoneLine(line);
      if (ordinal === null || ordinal !== expected) return;
      expected += 1;
      acknowledged.add(ordinal);
      // A handover that fails closes stdin: the driver's `read` sees EOF and stops at once,
      // instead of waiting on a bell that will never ring until the host backstop fires.
      chain = chain.then(() => handOver(ordinal, stdin)).catch(() => stdin.end());
    },
  };

  return { control, frozen, acknowledged, drained: () => chain };
}

/**
 * Place a test's input where the container is waiting for it — ATOMICALLY.
 *
 * ## The bug this exists to prevent
 *
 * `worker/batch-driver.ts` waits for the input with `[ ! -f "/in/$i.in" ]` and then immediately
 * redirects stdin from it. `-f` becomes true the instant the file is CREATED, which with a plain
 * `writeFile` is before any of its bytes have been written. A program that starts fast enough
 * reads a truncated or empty stdin and produces a wrong answer from correct source.
 *
 * Measured: byte-identical correct C++17 returned **5 AC and 3 WA across 8 runs**, and a probe
 * that exits 42 when it reads fewer tokens than promised returned `RE` — direct proof of a short
 * read rather than an inference from a wrong answer. Python was 6 for 6, because interpreter
 * startup is long enough for the write to land.
 *
 * **So the failure hits the FAST languages hardest — C, C++, Go — which is exactly backwards**,
 * and it is intermittent, which is worse. A student sees a wrong answer for code that is right,
 * resubmits, and it passes.
 *
 * G4 and G13 do not catch it: their fixture inputs are small, so the window between create and
 * complete is narrow enough to usually win.
 *
 * ## Why rename, and why the temporary name starts with a dot
 *
 * `rename(2)` within one directory is atomic — the name either does not resolve or resolves to the
 * complete file, with no state in between. Writing to `.<n>.in.partial` first keeps the partial
 * file out of the `<n>.in` name the driver polls for; a temp name that also ended in `.in` would
 * reintroduce the same race under a different spelling.
 *
 * The temporary must live in the SAME directory: rename is only atomic within a filesystem, and
 * this directory is a bind mount.
 */
async function placeInput(inputDir: string, ordinal: number, contents: string): Promise<void> {
  const finalPath = path.join(inputDir, `${String(ordinal)}.in`);
  const partialPath = path.join(inputDir, `.${String(ordinal)}.in.partial`);
  await writeFile(partialPath, contents, "utf8");
  await rename(partialPath, finalPath);
}

/**
 * 50 ms polls the driver allows for an input whose bell has already rung — 2 s.
 *
 * The bell is sent only after the rename, so on Linux the file is there at once and this is never
 * used. It exists for Docker Desktop, whose bind mount crosses a VM boundary and can surface a
 * renamed file a moment after a bell that travelled by a different path.
 */
const FEED_SETTLE_POLLS = 40;

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
  let mode: RunMode | null = null;
  try {
    const metaLine = await readFile(metaPath, "utf8");
    meta = parseMeta(metaLine);
    mode = parseRunMode(metaLine);
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
    ...(mode === null ? {} : { mode }),
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
    await placeInput(inputDir, ordinal, retryInput);

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
        // The input is already on disk before the container starts, so this is never waited on.
        PTCN_FEED_TIMEOUT: String(FEED_SETTLE_POLLS),
      },
      // The one bell this container needs, then end of stdin: the driver runs test `ordinal` and
      // stops.
      stdin: doorbellFor(ordinal),
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

export async function judge(
  job: JudgeJob,
  images?: ImageOverrides,
  queueFacts?: QueueTimingFacts,
  options?: JudgeOptions,
): Promise<JudgeResult> {
  // Everything language-specific comes from the registry. There is no switch on job.language
  // anywhere in this file, and adding C++20 or Rust must not add one.
  const variant: Variant = variantFor(job.language);
  const runtime: Runtime = runtimeFor(job.language);
  const image = images?.[runtime.id] ?? runtime.image;

  /*
    Stage marks for the six-point latency model (lib/schemas/judge.ts, JudgeTimingsSchema).

    Each is null until its stage is reached, and STAYS null if the job never gets there — a CE
    runs no tests, so its lastTestFinishedAtMs is honestly absent rather than zero. "Container
    started" is back-computed from the daemon's own StartedAt/FinishedAt span (`durationMs`)
    rather than timed around `docker run`, for the same reason submissions are never timed that
    way (CLAUDE.md): the epoch mark when the call returns minus the daemon-measured execution
    span IS the daemon's StartedAt, so container creation lands in the create bucket, not the
    compile or run bucket.
  */
  const stageClock = epochAnchoredClock();
  let containerStartedAtMs: number | null = null;
  let compileFinishedAtMs: number | null = null;
  let lastTestFinishedAtMs: number | null = null;

  // Attached at every return site through this one door, so a new early return cannot silently
  // ship a result with no timings while the queue facts sit unused.
  const withTimings = (result: JudgeResult): JudgeResult => {
    if (queueFacts === undefined) return result;
    const timings: JudgeTimings = {
      enqueuedAtMs: queueFacts.enqueuedAtMs,
      dequeuedAtMs: queueFacts.dequeuedAtMs,
      containerStartedAtMs,
      compileFinishedAtMs,
      lastTestFinishedAtMs,
      attempt: queueFacts.attempt,
    };
    return { ...result, timings };
  };

  const algorithmMs = job.limits.timeLimitMs * runtime.multiplier;
  // Scaled, not raw. The registry's budgets describe native Linux; a virtualised dev host declares
  // itself with JUDGE_STARTUP_BUDGET_SCALE rather than having its slowness written into the rules.
  const startupMs = scaledStartupBudgetMs(runtime.startupBudgetMs);
  const timeLimitMs = algorithmMs + startupMs;
  const wallClockKillMs = algorithmMs * 3 + startupMs;

  const runLimits = containerLimits(job);

  // The tests are read FIRST: the output cap they imply is part of the run container's creation
  // profile, which decides whether a pre-created container can serve this submission.
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

  const profile = slotProfileFor(job, images, largestCap);
  const pool = options?.pool;
  const slot = pool?.take(profile) ?? null;
  const ws = slot?.workspace ?? (await createWorkspace("job-"));
  const freshNames: SlotNames = {
    build: profile.compile === null ? null : containerName(job, "build"),
    run: containerName(job, "run"),
  };
  const specs = specsFor(profile, ws, slot?.names ?? freshNames);
  const { sourceDir, buildDir, inputDir, resultDir } = ws;
  // A pooled container is started rather than created, and queued for removal rather than removed.
  const pooled =
    slot !== null && pool !== undefined
      ? { precreated: true, retire: (name: string) => pool.retire(name) }
      : {};
  let freshContainerUsed = false;
  const noteFreshFallback = (which: string): void => {
    freshContainerUsed = true;
    console.warn(
      JSON.stringify({ level: "warn", event: "judge.pool.not_started", submissionId: job.submissionId, which }),
    );
  };

  try {
    await writeFile(path.join(sourceDir, variant.sourceFile), job.sourceCode, "utf8");    await writeFile(path.join(sourceDir, variant.sourceFile), job.sourceCode, "utf8");

    // --- build, in its OWN container when it emits artifacts --------------
    //
    // A cgroup has one memory cap, so a container sized for javac's 1 GB cannot also hold the
    // program to the problem's 256 MB — and MLE detection depends on that cap being the
    // problem's. Compiled languages therefore build separately, at the runtime's compile
    // memory limit, and hand /build to the run container read-only.
    if (variant.compileCommand !== undefined && specs.compile !== null && freshNames.build !== null) {
      await writeFile(path.join(inputDir, "compile.sh"), `${withHostMaxProcs(variant.compileCommand)}\n`, "utf8");

      const compileOptions = {
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
      };
      let compile = await runInContainer({ ...specs.compile, ...compileOptions, ...pooled });
      if (compile.neverStarted === true) {
        // The pre-created container could not be started, so nothing ran: build in a fresh one.
        noteFreshFallback("build");
        compile = await runInContainer({ ...specs.compile, ...compileOptions, name: freshNames.build });
      }

      // The daemon's execution span ends at (roughly) this instant, so subtracting it recovers
      // the daemon's StartedAt: everything before that mark — workspace prep, image start,
      // container create — is the create bucket. The compile bucket is the compiler itself.
      const compileEndedAtMs = stageClock();
      containerStartedAtMs = compileEndedAtMs - Math.max(0, Math.round(compile.durationMs));
      compileFinishedAtMs = compileEndedAtMs;

      if (compile.exitCode !== 0) {
        return withTimings(aggregate({
          submissionId: job.submissionId,
          results: [],
          testCases: job.testCases,
          // Verbatim compiler stderr. The compiler is describing the student's own code, so
          // nothing about the hidden tests leaks (PRD §7.2), and a truncated or paraphrased
          // g++ template error is useless to them.
          compileError: compile.stderr.trim() || "Compilation failed",
        }));
      }
    }

    // --- ONE container: every test for this submission --------------------
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
      // Written before the container starts, so this one was never racy — but it goes through the
      // same door so that there is exactly one way an input is placed.
      await placeInput(inputDir, 1, firstInput);
    }

    // The per-process driver is always written: the single-test retry below runs it whatever drove
    // the batch.
    await writeFile(path.join(inputDir, "driver.sh"), BATCH_DRIVER, "utf8");
    await writeFile(path.join(inputDir, "run.sh"), `${withHostMaxProcs(variant.runCommand)}\n`, "utf8");

    // The in-process harness, when the registry offers one, it is switched on, and the compiled
    // program uses nothing the harness cannot reproduce per test (worker/jvm-harness-eligibility.ts).
    // Otherwise the batch runs exactly as it always has. No language is named here.
    const harnessOffered =
      variant.harnessCommand !== undefined && variant.producesArtifacts && harnessSwitchedOn(options);
    const declined = harnessOffered ? await harnessDeclineReason(buildDir) : null;
    const harnessCommand = harnessOffered && declined === null ? variant.harnessCommand : undefined;
    if (harnessCommand !== undefined) {
      await writeFile(path.join(inputDir, "jvm-driver.sh"), JVM_DRIVER, "utf8");
      await writeFile(path.join(inputDir, "harness.sh"), `${withHostMaxProcs(harnessCommand)}\n`, "utf8");
    }

    // A parse-only check writes nothing, so it costs nothing to do inside the run container.
    // An artifact-producing build already ran above and its compile.sh must NOT run again.
    if (variant.compileCommand !== undefined && !variant.producesArtifacts) {
      await writeFile(path.join(inputDir, "compile.sh"), `${withHostMaxProcs(variant.compileCommand)}\n`, "utf8");
    } else if (variant.producesArtifacts) {
      await rm(path.join(inputDir, "compile.sh"), { force: true });
    }

    const perTestTimeoutS = Math.max(1, Math.ceil(wallClockKillMs / 1000));
    // The driver's parameters reach it through /in/start.sh, not the container's environment: the
    // container may have been created before this submission existed (worker/slot-profile.ts).
    const driverEnv: Record<string, string> = {
      PTCN_TESTS: String(job.testCases.length),
      PTCN_TIMEOUT: String(perTestTimeoutS),
      PTCN_COMPILE_TIMEOUT: String(Math.max(1, Math.ceil(runtime.compileTimeoutMs / 1000))),
      PTCN_CAP: String(largestCap),
      // How long the driver waits for an input the bell has ALREADY announced. The wait for the
      // previous test to finish is the bell itself, which blocks, so this only has to cover a
      // bind mount surfacing a renamed file late.
      PTCN_FEED_TIMEOUT: String(FEED_SETTLE_POLLS),
      ...(harnessCommand === undefined
        ? {}
        : {
            PTCN_HARNESS_PROTOCOL: String(HARNESS_PROTOCOL),
            PTCN_HARNESS_START: String(HARNESS_START_TIMEOUT_S),
            PTCN_HARNESS_SETTLE: String(HARNESS_SETTLE_TIMEOUT_S),
            // The harness's own watchdog fires at PTCN_TIMEOUT. This is the driver's backstop for
            // a harness that has stopped answering; past it the test reruns as a process.
            PTCN_HARNESS_BACKSTOP: String(perTestTimeoutS + HARNESS_BACKSTOP_GRACE_S),
          }),
    };
    await writeFile(
      path.join(inputDir, "start.sh"),
      startScript(
        driverEnv,
        harnessCommand === undefined ? ["/bin/sh", "/in/driver.sh"] : ["/bin/bash", "/in/jvm-driver.sh"],
      ),
      "utf8",
    );

    const batchOptions = {
      // With the harness, the JVM's start is waited for once, and one test may cost its harness
      // attempt up to the backstop AND a rerun as a process. Both are added, so the host backstop
      // never cuts a legitimate run short.
      containerKillMs:
        wallClockKillMs * job.testCases.length +
        runtime.compileTimeoutMs +
        (harnessCommand === undefined
          ? 0
          : (HARNESS_START_TIMEOUT_S +
              perTestTimeoutS +
              HARNESS_BACKSTOP_GRACE_S +
              HARNESS_SETTLE_TIMEOUT_S) *
            1000),
      outputCapBytes: 64 * 1024,
      outputDirBudgetBytes: outputDirBudget(largestCap, job.testCases.length),
      outputDirMaxFiles: outputDirFileLimit(job.testCases.length),
    };

    // Runs alongside the container, handing over one input at a time on the driver's doorbell.
    let feed = feedInputs({ inputDir, resultDir, inputByOrdinal, cap: largestCap });
    let batch = await runInContainer({ ...specs.run, ...batchOptions, control: feed.control, ...pooled });
    if (batch.neverStarted === true) {
      // The pre-created container could not be started, so no test ran and no input was handed
      // over: run the batch in a fresh container, with a fresh feeder.
      noteFreshFallback("run");
      await feed.drained();
      feed = feedInputs({ inputDir, resultDir, inputByOrdinal, cap: largestCap });
      batch = await runInContainer({ ...specs.run, ...batchOptions, control: feed.control, name: freshNames.run });
    }

    // The container has exited; let any handover it triggered finish before reading results.
    await feed.drained();

    // Clear every input the feeder may have left before any single-test retry starts. A batch
    // that died after a handover leaves the NEXT test's input in `/in`, and a retry container
    // mounts the same directory — so without this, the retry of an earlier SAMPLE (whose diff
    // snippet the student sees) could read a hidden input that its own run never got to. Each
    // retry places, and removes, exactly its own input.
    await Promise.all(
      job.testCases.map((_, index) =>
        rm(path.join(inputDir, `${String(index + 1)}.in`), { force: true }).catch(() => undefined),
      ),
    );

    /**
     * One test's outcome as the host may believe it.
     *
     * A test the driver reported finished is read ONLY from what was frozen at its handover —
     * never from disk again, because a later test could have rewritten its files (see
     * `feedInputs`). `null` there sends it to a fresh single-test container. A test never reported
     * finished is read from disk as before: the container died during it, and no input after it
     * was ever placed.
     */
    const outcomeOf = async (ordinal: number): Promise<BatchTestOutcome | null> => {
      if (feed.acknowledged.has(ordinal)) return feed.frozen.get(ordinal) ?? null;
      return readBatchOutcome(resultDir, ordinal, largestCap);
    };

    // Same back-computation as the compile container above. For interpreted and parse-only
    // languages this batch IS the first container, so its daemon-measured start is the create
    // boundary; compileFinishedAtMs stays null for them, because their (in-batch) parse step is
    // not separately observable and a made-up number is worse than an honest absence.
    const batchEndedAtMs = stageClock();
    if (containerStartedAtMs === null) {
      containerStartedAtMs = batchEndedAtMs - Math.max(0, Math.round(batch.durationMs));
    }
    lastTestFinishedAtMs = batchEndedAtMs;

    // A parse-only check that failed is still a CE.
    const compileStatus = await readCompileStatus(resultDir);
    if (compileStatus !== null && compileStatus.exitCode !== 0) {
      // No test ran, so the mark set moments ago would claim a run stage that never happened.
      lastTestFinishedAtMs = null;
      return withTimings(aggregate({
        submissionId: job.submissionId,
        results: [],
        testCases: job.testCases,
        compileError: compileStatus.stderr.trim() || "Compilation failed",
      }));
    }

    const results: JudgeTestResult[] = [];
    const modes: (RunMode | "retry")[] = [];

    // Read every self-reported duration first, so the batch can be cross-checked against a clock
    // the submission cannot touch. See `selfReportedTimingIsCredible`.
    const claimedTotalMs = (
      await Promise.all(
        job.testCases.map((_, index) => outcomeOf(index + 1)),
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

      const outcome = await outcomeOf(ordinal);
      modes.push(outcome === null ? "retry" : (outcome.mode ?? "process"));

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

      // A retry runs a fresh container after the batch, so the run stage genuinely ends later.
      if (outcome === null) lastTestFinishedAtMs = stageClock();

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
        // Already capped: `run.stdout` was read through the derived per-test output cap.
        ...(job.captureOutput ? { capturedStdout: run.stdout } : {}),
      });
    }

    reportRun({
      job,
      harnessOffered,
      declined,
      harnessCommand,
      modes,
      pooled: slot !== null && !freshContainerUsed,
      onReport: options?.onReport,
    });

    return withTimings(aggregate({
      submissionId: job.submissionId,
      results,
      testCases: job.testCases,
    }));
  } finally {
    // Whatever of the slot this submission did not start is removed unused, never handed on.
    if (slot !== null) pool?.discardUnused(slot);
    await removeWorkspace(ws.root);
  }
}

/**
 * Tell the caller how the tests ran, and log when the in-process harness handed tests back to the
 * per-process path — the line an organizer looks for if Java grading slows down on the night.
 */
function reportRun(input: {
  readonly job: JudgeJob;
  readonly harnessOffered: boolean;
  readonly declined: string | null;
  readonly harnessCommand: string | undefined;
  readonly modes: readonly (RunMode | "retry")[];
  readonly pooled: boolean;
  readonly onReport: ((report: RunReport) => void) | undefined;
}): void {
  const { job, harnessOffered, declined, harnessCommand, modes, pooled, onReport } = input;
  onReport?.({ harnessOffered, declined, modes, pooled });
  if (harnessCommand === undefined) return;
  const fellBack = modes.filter((mode) => mode !== "harness").length;
  if (fellBack === 0) return;
  console.warn(
    JSON.stringify({
      level: "info",
      event: "judge.jvm_harness.fallback",
      submissionId: job.submissionId,
      tests: modes.length,
      perProcess: fellBack,
      firstFallback: modes.findIndex((mode) => mode !== "harness") + 1,
    }),
  );
}
