// Standalone tsx entrypoint — load .env before anything reads process.env.
import "dotenv/config";

import childProcess, { execFileSync, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { LanguageId } from "@/lib/judge/runtimes";
import type { JudgeJob, JudgeResult } from "@/lib/schemas/judge";
import { isDockerAvailable, sweepJudgeContainers } from "@/worker/docker";
import { ContainerPool } from "@/worker/container-pool";
import { JavacService } from "@/worker/javac-service";
import { RUNTIMES, VARIANTS } from "@/lib/judge/runtimes";
import { judge, slotProfileForJob } from "@/worker/runner";

/**
 * Judge-throughput micro-benchmark: what one submission costs the judge, per stage.
 *
 *     npx tsx scripts/bench-judge.ts --sol-dir <dir> [--reps 3] [--out file.json] [slug ...]
 *
 * For each problem it judges the reference solution (Python, `reference.py`) and, when
 * `<sol-dir>/<slug>/Main.java` and `main.cpp` exist, a correct Java 21 and C++17 solution,
 * through `judge()` in `worker/runner.ts` — the same function the worker calls, real containers,
 * real isolation flags. It records:
 *
 *   - wall time of the whole `judge()` call (the judge-slot time a submission occupies);
 *   - per-stage wall, from the judge's own stage marks;
 *   - every `docker` CLI call the runner makes and how long each took, observed by wrapping
 *     `child_process.spawn` in this process (calls made over the Engine API socket by
 *     worker/docker-api.ts are not CLI processes and do not appear here);
 *   - CPU seconds burned on the Docker host (the Linux VM on Docker Desktop, the box itself on
 *     Linux) during the judge, read from `/proc/stat` through a long-lived probe container and
 *     corrected for the host's idle background rate, plus this process's own CPU.
 *
 * It asserts the verdict is AC with full marks every time. A faster judge that changes a verdict
 * is not a faster judge, and the benchmark refuses to report a number for one.
 *
 * Nothing here relaxes an isolation flag or bypasses `judge()`. It measures the product.
 */

const ROOT = process.cwd();
// BENCH_CONTENT_DIR points the benchmark at another copy of the problems, so the same judge can be
// measured against the test data before and after it was lightened.
const CONTENT = process.env.BENCH_CONTENT_DIR ?? path.join(ROOT, "content", "problems");
const PROBE = "ptcn-bench-cpuprobe";

const DEFAULT_SLUGS = [
  "diagonal-difference",
  "drawing-book",
  "funny-string",
  "insertionsort2",
  "mars-exploration",
  "sherlock-and-squares",
];

interface Args {
  readonly solDir: string | null;
  readonly reps: number;
  readonly out: string | null;
  readonly slugs: readonly string[];
  readonly languages: readonly LanguageId[];
  /**
   * `--pool`: judge in containers created BEFORE the measurement, and remove them after it, as the
   * worker's pool does ahead of and after a burst. What is measured is then what a submission costs
   * DURING a burst.
   */
  readonly pool: boolean;
  /** `--javac-service`: compile Java in a warm javac service started before the measurement. */
  readonly javacService: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  let solDir: string | null = null;
  let reps = 3;
  let out: string | null = null;
  let languages: LanguageId[] = ["PYTHON_312", "JAVA_21", "CPP_17"];
  let pool = false;
  let javacService = false;
  const slugs: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg === "--sol-dir") solDir = argv[++i] ?? null;
    else if (arg === "--reps") reps = Number(argv[++i] ?? "3");
    else if (arg === "--out") out = argv[++i] ?? null;
    else if (arg === "--lang") languages = (argv[++i] ?? "").split(",") as LanguageId[];
    else if (arg === "--pool") pool = true;
    else if (arg === "--javac-service") javacService = true;
    else slugs.push(arg);
  }
  return { solDir, reps, out, slugs: slugs.length > 0 ? slugs : DEFAULT_SLUGS, languages, pool, javacService };
}

/* ------------------------------------------------------------------------------------------ */
/* Observing the docker calls the runner makes                                                 */
/* ------------------------------------------------------------------------------------------ */

interface DockerCall {
  readonly op: string;
  readonly startMs: number;
  endMs: number;
}

const calls: DockerCall[] = [];

/**
 * Wrap `spawn` so every `docker <op>` the runner makes is timed. The runner imports
 * `node:child_process` as a namespace under tsx's CJS transform, so the wrapper is seen at call
 * time.
 */
function instrumentDockerCalls(): void {
  const original = childProcess.spawn;
  const patched = ((command: string, args: readonly string[], options: object) => {
    const child: ChildProcess = original(command, args, options);
    if (command === "docker") {
      const call: DockerCall = { op: `cli:${args[0] ?? "?"}`, startMs: performance.now(), endMs: 0 };
      calls.push(call);
      child.on("close", () => {
        call.endMs = performance.now();
      });
    }
    return child;
  }) as typeof childProcess.spawn;
  (childProcess as { spawn: typeof childProcess.spawn }).spawn = patched;
}

/* ------------------------------------------------------------------------------------------ */
/* Host CPU                                                                                     */
/* ------------------------------------------------------------------------------------------ */

function hostBusyTicks(): number {
  const stat = execFileSync("docker", ["exec", PROBE, "head", "-1", "/proc/stat"], {
    encoding: "utf8",
  });
  const fields = stat.trim().split(/\s+/).slice(1).map(Number);
  // user nice system idle iowait irq softirq steal
  const idle = (fields[3] ?? 0) + (fields[4] ?? 0);
  const total = fields.slice(0, 8).reduce((a, b) => a + b, 0);
  return total - idle;
}

const TICKS_PER_SECOND = 100;

async function measureBackgroundRate(seconds: number): Promise<number> {
  const before = hostBusyTicks();
  const t0 = performance.now();
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  const after = hostBusyTicks();
  const elapsedS = (performance.now() - t0) / 1000;
  return (after - before) / TICKS_PER_SECOND / elapsedS;
}

/* ------------------------------------------------------------------------------------------ */
/* Jobs                                                                                         */
/* ------------------------------------------------------------------------------------------ */

const SOURCE_FILE: Readonly<Partial<Record<LanguageId, string>>> = {
  JAVA_21: "Main.java",
  CPP_17: "main.cpp",
};

function sourceFor(slug: string, language: LanguageId, solDir: string | null): string | null {
  if (language === "PYTHON_312") return readFileSync(path.join(CONTENT, slug, "reference.py"), "utf8");
  const file = SOURCE_FILE[language];
  if (solDir === null || file === undefined) return null;
  const p = path.join(solDir, slug, file);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

function jobFor(slug: string, language: LanguageId, sourceCode: string, rep: number): JudgeJob {
  const manifest = JSON.parse(readFileSync(path.join(CONTENT, slug, "problem.json"), "utf8")) as {
    timeLimitMs: number;
    memoryLimitMb: number;
    sampleCount: number;
  };
  const testDir = path.join(CONTENT, slug, "tests");
  const inputs = readdirSync(testDir).filter((f) => f.endsWith(".in")).sort();
  return {
    submissionId: `bench-${slug}-${language}-${String(rep)}`,
    language,
    sourceCode,
    limits: {
      timeLimitMs: manifest.timeLimitMs,
      memoryLimitMb: manifest.memoryLimitMb,
      wallClockKillMs: manifest.timeLimitMs * 3,
      pidsLimit: 64,
      tmpfsBytes: 16 * 1024 * 1024,
      cpus: 1,
    },
    comparator: { kind: "whitespace" },
    testCases: inputs.map((f, i) => {
      const base = f.replace(/\.in$/, "");
      return {
        testCaseId: base,
        ordinal: i + 1,
        inputPath: path.join(testDir, f),
        expectedOutputPath: path.join(testDir, `${base}.out`),
        isSample: i < manifest.sampleCount,
        points: 10,
        group: null,
      };
    }),
    attempt: 1,
    captureOutput: false,
  };
}

interface Sample {
  readonly slug: string;
  readonly language: LanguageId;
  readonly tests: number;
  readonly verdict: string;
  readonly score: number;
  readonly maxScore: number;
  readonly wallMs: number;
  /** Sum of per-test durations the driver reported: the program's own time, startup included. */
  readonly testsMs: number;
  readonly hostCpuS: number;
  readonly workerCpuS: number;
  readonly stages: Readonly<Record<string, number>>;
  readonly dockerCalls: Readonly<Record<string, { n: number; ms: number }>>;
}

async function benchOne(
  slug: string,
  language: LanguageId,
  source: string,
  rep: number,
  backgroundCoresBusy: number,
  pool: ContainerPool | null,
  service: JavacService | null,
): Promise<Sample> {
  const job = jobFor(slug, language, source, rep);
  if (pool !== null) await pool.prefill(await slotProfileForJob(job, undefined, service !== null), 1);
  calls.length = 0;

  const busy0 = hostBusyTicks();
  const cpu0 = process.cpuUsage();
  const t0 = performance.now();
  const epoch0 = Date.now();
  const result: JudgeResult = await judge(
    job,
    undefined,
    { enqueuedAtMs: epoch0, dequeuedAtMs: epoch0, attempt: 1 },
    { ...(pool === null ? {} : { pool }), ...(service === null ? {} : { javacService: service }) },
  );
  const t1 = performance.now();
  const cpu1 = process.cpuUsage(cpu0);
  const busy1 = hostBusyTicks();
  // The removals the pool deferred happen after the measurement, as they do after a burst.
  if (pool !== null) await pool.maintain();

  const wallMs = t1 - t0;
  const hostCpuS = Math.max(
    0,
    (busy1 - busy0) / TICKS_PER_SECOND - backgroundCoresBusy * (wallMs / 1000),
  );
  const maxScore = job.testCases.reduce((sum, t) => sum + t.points, 0);

  const timings = result.timings;
  const stages: Record<string, number> = {};
  if (timings !== undefined && timings !== null) {
    const started = timings.containerStartedAtMs;
    const compiled = timings.compileFinishedAtMs;
    const finished = timings.lastTestFinishedAtMs;
    if (started !== null) stages.toFirstContainerStart = started - epoch0;
    if (started !== null && compiled !== null) stages.compileContainer = compiled - started;
    if (finished !== null) stages.runContainerEnd = finished - (compiled ?? started ?? epoch0);
    if (finished !== null) stages.afterRun = epoch0 + wallMs - finished;
  }

  const dockerCalls: Record<string, { n: number; ms: number }> = {};
  for (const call of calls) {
    const entry = dockerCalls[call.op] ?? { n: 0, ms: 0 };
    entry.n += 1;
    entry.ms += Math.max(0, call.endMs - call.startMs);
    dockerCalls[call.op] = entry;
  }

  return {
    slug,
    language,
    tests: job.testCases.length,
    verdict: result.verdict,
    score: result.score,
    maxScore,
    wallMs,
    testsMs: result.testResults.reduce((sum, t) => sum + (t.runtimeMs ?? 0), 0),
    hostCpuS,
    workerCpuS: (cpu1.user + cpu1.system) / 1e6,
    stages,
    dockerCalls,
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!(await isDockerAvailable())) {
    console.error("NOT RUN: the Docker daemon is not reachable.");
    process.exit(2);
  }
  instrumentDockerCalls();

  execFileSync("docker", ["rm", "-f", PROBE], { stdio: "ignore" });
  execFileSync("docker", ["run", "-d", "--name", PROBE, "--network=none", "alpine:3", "sleep", "86400"], {
    stdio: "ignore",
  });

  const samples: Sample[] = [];
  let failures = 0;
  const pool = args.pool
    ? new ContainerPool({ target: 0, removalBacklog: 10_000, isBusy: () => false })
    : null;
  const service = args.javacService
    ? new JavacService({ lanes: 1, image: RUNTIMES.jdk21.image, runtime: RUNTIMES.jdk21 })
    : null;
  if (service !== null) {
    if ((await service.start()) === 0) throw new Error("the javac service did not start");
    // Warmed before the measurement, as the worker warms it at start.
    await service.warmUp(VARIANTS.JAVA_21.compileCommand ?? "", RUNTIMES.jdk21.compileTimeoutMs);
  }
  try {
    const background = await measureBackgroundRate(5);
    console.log(`host background: ${background.toFixed(2)} cores busy while idle`);

    for (const slug of args.slugs) {
      for (const language of args.languages) {
        const source = sourceFor(slug, language, args.solDir);
        if (source === null) continue;
        // One unmeasured warm-up, so the first sample does not carry the page cache filling.
        await benchOne(slug, language, source, 0, background, pool, service);
        for (let rep = 1; rep <= args.reps; rep += 1) {
          const s = await benchOne(slug, language, source, rep, background, pool, service);
          samples.push(s);
          const ok = s.verdict === "AC" && s.score === s.maxScore;
          if (!ok) failures += 1;
          console.log(
            `${ok ? "ok  " : "FAIL"} ${slug.padEnd(22)} ${language.padEnd(10)} tests=${String(s.tests).padStart(2)} ` +
              `${s.verdict} ${String(s.score)}/${String(s.maxScore)} wall=${s.wallMs.toFixed(0)}ms ` +
              `tests=${s.testsMs.toFixed(0)}ms hostCpu=${s.hostCpuS.toFixed(2)}s worker=${s.workerCpuS.toFixed(2)}s ` +
              `stages=${JSON.stringify(Object.fromEntries(Object.entries(s.stages).map(([k, v]) => [k, Math.round(v)])))} ` +
              `docker=${JSON.stringify(Object.fromEntries(Object.entries(s.dockerCalls).map(([k, v]) => [k, `${String(v.n)}x${v.ms.toFixed(0)}ms`])))}`,
          );
        }
      }
    }
  } finally {
    await pool?.close();
    await service?.close();
    execFileSync("docker", ["rm", "-f", PROBE], { stdio: "ignore" });
    await sweepJudgeContainers();
  }

  console.log("\nper language, median over problems of the per-problem median:");
  console.log("language    wall_ms  tests_ms  host_cpu_s  worker_cpu_s");
  for (const language of args.languages) {
    const byProblem = args.slugs
      .map((slug) => samples.filter((s) => s.slug === slug && s.language === language))
      .filter((group) => group.length > 0);
    if (byProblem.length === 0) continue;
    const pick = (f: (s: Sample) => number) =>
      byProblem.map((group) => median(group.map(f))).reduce((a, b) => a + b, 0) / byProblem.length;
    console.log(
      `${language.padEnd(10)} ${pick((s) => s.wallMs).toFixed(0).padStart(8)} ${pick((s) => s.testsMs).toFixed(0).padStart(9)} ` +
        `${pick((s) => s.hostCpuS).toFixed(2).padStart(11)} ${pick((s) => s.workerCpuS).toFixed(2).padStart(13)}`,
    );
  }

  if (args.out !== null) writeFileSync(args.out, JSON.stringify(samples, null, 2));
  if (failures > 0) {
    console.error(`\n${String(failures)} sample(s) did not score AC with full marks`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
