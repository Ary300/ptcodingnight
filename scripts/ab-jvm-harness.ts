// Standalone tsx entrypoint — load .env before anything reads process.env.
import "dotenv/config";

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { probeFor } from "@/lib/judge/starters";
import type { LanguageId } from "@/lib/judge/runtimes";
import type { JudgeJob, JudgeResult } from "@/lib/schemas/judge";
import { parseProblemManifest, type ProblemManifest } from "@/lib/schemas/seed";
import { isDockerAvailable, sweepJudgeContainers } from "@/worker/docker";
import { ContainerPool } from "@/worker/container-pool";
import { judge, slotProfileForJob, type RunReport } from "@/worker/runner";

/**
 * A/B for the in-JVM harness: judge the SAME submissions with the harness on and with it off, and
 * diff every per-test verdict, the score, the captured stdout and the snippet a student would see.
 *
 *     npx tsx scripts/ab-jvm-harness.ts [--set g4,probes,sols] [--sol-dir DIR ...] [--out f.json]
 *                                       [--only name-part,...]
 *
 * Sets:
 *   g4      every Java fixture in fixtures/judge (all levels; only JAVA_21 has a harness, the
 *           others prove they are untouched), against the fixture problem.
 *   probes  the Java 21 starter probe of every problem in content/problems — the program G13
 *           judges — against ALL of that problem's tests rather than the first.
 *   sols    every `<sol-dir>/<slug>/Main.java` (correct Java solutions) against its problem.
 *
 * Every test is marked a sample so the diff snippet and the runtime-error stderr snippet — what a
 * student is shown — are produced, and compared, for every test. The harness-on run must actually
 * use the harness: the summary counts how many tests it judged, so an A/B in which the harness
 * silently never ran cannot read as a pass.
 *
 * Exits 1 on any difference. A faster judge that changes a verdict is not a faster judge.
 */

const ROOT = process.cwd();
const FIXTURES = path.join(ROOT, "fixtures", "judge");
const CONTENT = path.join(ROOT, "content", "problems");

interface Args {
  readonly sets: ReadonlySet<string>;
  readonly solDirs: readonly string[];
  readonly out: string | null;
  /** `--only a,b`: judge only the cases whose name contains one of these. */
  readonly only: readonly string[];
  /**
   * What the two sides differ in: `harness` (on/off, the default), or `pool` (pre-created
   * containers versus containers made on demand, the harness on for both).
   */
  readonly compare: "harness" | "pool";
}

function parseArgs(argv: readonly string[]): Args {
  let sets = new Set(["g4", "probes", "sols"]);
  const solDirs: string[] = [];
  let out: string | null = null;
  let only: string[] = [];
  let compare: "harness" | "pool" = "harness";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--set") sets = new Set((argv[++i] ?? "").split(","));
    else if (arg === "--sol-dir") solDirs.push(argv[++i] ?? "");
    else if (arg === "--out") out = argv[++i] ?? null;
    else if (arg === "--only") only = (argv[++i] ?? "").split(",").filter((x) => x.length > 0);
    else if (arg === "--compare") compare = argv[++i] === "pool" ? "pool" : "harness";
  }
  return { sets, solDirs, out, only, compare };
}

interface Case {
  readonly name: string;
  readonly job: JudgeJob;
}

/* --------------------------------- G4 fixtures --------------------------------- */

interface G4Manifest {
  problem: { timeLimitMs: number; testCount: number; pointsPerTest: number };
  cases: {
    id: string;
    language: LanguageId;
    sourceFile: string;
    timeLimitMs?: number;
    memoryLimitMb?: number;
    problemDir?: string;
    testCount?: number;
  }[];
}

function g4Cases(): Case[] {
  const manifest = JSON.parse(readFileSync(path.join(FIXTURES, "manifest.json"), "utf8")) as G4Manifest;
  return manifest.cases
    .filter((c) => c.language.startsWith("JAVA_"))
    .map((c) => {
      const dir = c.problemDir ?? "problem";
      const count = c.testCount ?? manifest.problem.testCount;
      const timeLimitMs = c.timeLimitMs ?? manifest.problem.timeLimitMs;
      return {
        name: `g4/${c.id}`,
        job: {
          submissionId: `ab-${c.id}`,
          language: c.language,
          sourceCode: readFileSync(path.join(FIXTURES, "cases", c.id, c.sourceFile), "utf8"),
          limits: {
            timeLimitMs,
            memoryLimitMb: c.memoryLimitMb ?? 512,
            wallClockKillMs: timeLimitMs * 3,
            pidsLimit: 64,
            tmpfsBytes: 16 * 1024 * 1024,
            cpus: 1,
          },
          comparator: { kind: "whitespace" },
          testCases: Array.from({ length: count }, (_, i) => ({
            testCaseId: `t${String(i + 1)}`,
            ordinal: i + 1,
            inputPath: path.join(FIXTURES, dir, `${String(i + 1)}.in`),
            expectedOutputPath: path.join(FIXTURES, dir, `${String(i + 1)}.out`),
            isSample: true,
            points: manifest.problem.pointsPerTest,
            group: null,
          })),
          attempt: 1,
          captureOutput: true,
        },
      };
    });
}

/* --------------------------------- content problems --------------------------------- */

function problemManifest(slug: string): ProblemManifest | null {
  const file = path.join(CONTENT, slug, "problem.json");
  if (!existsSync(file)) return null;
  return parseProblemManifest(JSON.parse(readFileSync(file, "utf8")), file);
}

function problemJob(slug: string, manifest: ProblemManifest, sourceCode: string, tag: string): JudgeJob {
  const testDir = path.join(CONTENT, slug, "tests");
  const inputs = readdirSync(testDir).filter((f) => f.endsWith(".in")).sort();
  return {
    submissionId: `ab-${tag}-${slug}`,
    language: "JAVA_21",
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
    testCases: inputs.map((f, i) => ({
      testCaseId: f.replace(/\.in$/, ""),
      ordinal: i + 1,
      inputPath: path.join(testDir, f),
      expectedOutputPath: path.join(testDir, f.replace(/\.in$/, ".out")),
      isSample: true,
      points: 10,
      group: null,
    })),
    attempt: 1,
    captureOutput: true,
  };
}

function probeCases(): Case[] {
  const cases: Case[] = [];
  for (const slug of readdirSync(CONTENT).sort()) {
    const manifest = problemManifest(slug);
    if (manifest?.signature === undefined) continue;
    if (!manifest.allowedLanguages.includes("JAVA_21")) continue;
    cases.push({
      name: `probe/${slug}`,
      job: problemJob(slug, manifest, probeFor(manifest.signature, "JAVA_21"), "probe"),
    });
  }
  return cases;
}

function solCases(solDirs: readonly string[]): Case[] {
  const cases: Case[] = [];
  for (const dir of solDirs) {
    for (const slug of readdirSync(dir).sort()) {
      const source = path.join(dir, slug, "Main.java");
      const manifest = problemManifest(slug);
      if (!existsSync(source) || manifest === null) continue;
      cases.push({
        name: `sol/${path.basename(path.dirname(dir))}/${slug}`,
        job: problemJob(slug, manifest, readFileSync(source, "utf8"), "sol"),
      });
    }
  }
  return cases;
}

/* --------------------------------- the diff --------------------------------- */

interface Side {
  readonly result: JudgeResult;
  readonly report: RunReport | null;
  readonly wallMs: number;
}

const pool = new ContainerPool({ target: 0, removalBacklog: 10_000, isBusy: () => false });

/**
 * One side of the comparison. With `--compare pool`, the "on" side gets one slot created for its
 * profile just before it is judged — the same thing the worker does ahead of a burst — and the
 * "off" side creates its containers on demand.
 */
async function run(job: JudgeJob, on: boolean, compare: "harness" | "pool"): Promise<Side> {
  let report: RunReport | null = null;
  if (compare === "pool" && on) await pool.prefill(await slotProfileForJob(job), 1);
  const started = Date.now();
  const result = await judge(job, undefined, undefined, {
    ...(compare === "harness" ? { harness: on } : on ? { pool } : {}),
    onReport: (r) => {
      report = r;
    },
  });
  return { result, report, wallMs: Date.now() - started };
}

function differences(a: JudgeResult, b: JudgeResult): string[] {
  const diffs: string[] = [];
  if (a.verdict !== b.verdict) diffs.push(`verdict ${a.verdict} vs ${b.verdict}`);
  if (a.score !== b.score) diffs.push(`score ${String(a.score)} vs ${String(b.score)}`);
  if (a.compileError !== b.compileError) diffs.push("compileError differs");
  const count = Math.max(a.testResults.length, b.testResults.length);
  for (let i = 0; i < count; i += 1) {
    const x = a.testResults[i];
    const y = b.testResults[i];
    if (x === undefined || y === undefined) {
      diffs.push(`test ${String(i + 1)} missing on one side`);
      continue;
    }
    if (x.verdict !== y.verdict) diffs.push(`${x.testCaseId} verdict ${x.verdict} vs ${y.verdict}`);
    if (x.capturedStdout !== y.capturedStdout) diffs.push(`${x.testCaseId} stdout differs`);
    if (x.diffSnippet !== y.diffSnippet) {
      diffs.push(
        `${x.testCaseId} snippet differs: ${JSON.stringify(x.diffSnippet)} vs ${JSON.stringify(y.diffSnippet)}`,
      );
    }
  }
  return diffs;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!(await isDockerAvailable())) {
    console.error("Docker daemon is not reachable. The A/B is NOT RUN.");
    process.exit(2);
  }
  await sweepJudgeContainers();

  const all = [
    ...(args.sets.has("g4") ? g4Cases() : []),
    ...(args.sets.has("probes") ? probeCases() : []),
    ...(args.sets.has("sols") ? solCases(args.solDirs) : []),
  ];
  const cases =
    args.only.length === 0 ? all : all.filter((c) => args.only.some((part) => c.name.includes(part)));

  const rows: unknown[] = [];
  let diffCount = 0;
  let tests = 0;
  let harnessTests = 0;
  let declinedJobs = 0;
  let pooledJobs = 0;
  let wallOn = 0;
  let wallOff = 0;

  for (const [index, c] of cases.entries()) {
    // Alternate which side goes first, so neither systematically inherits a warmer host.
    const onFirst = index % 2 === 0;
    const first = await run(c.job, onFirst, args.compare);
    const second = await run(c.job, !onFirst, args.compare);
    const on = onFirst ? first : second;
    const off = onFirst ? second : first;

    const diffs = differences(on.result, off.result);
    const modes = on.report?.modes ?? [];
    const judgedInHarness = modes.filter((m) => m === "harness").length;
    if (args.compare === "pool" && on.report?.pooled === true) pooledJobs += 1;
    tests += on.result.testResults.length;
    harnessTests += judgedInHarness;
    wallOn += on.wallMs;
    wallOff += off.wallMs;
    if (on.report?.declined !== null && on.report?.declined !== undefined) declinedJobs += 1;
    diffCount += diffs.length;

    const tag = diffs.length === 0 ? "same" : "DIFF";
    console.log(
      `${tag} ${c.name.padEnd(48)} ${on.result.verdict.padEnd(3)} ${String(on.result.score).padStart(4)}` +
        `  harness ${String(judgedInHarness)}/${String(modes.length)}` +
        (args.compare === "pool" ? `  pooled ${on.report?.pooled === true ? "yes" : "NO"}` : "") +
        `${on.report?.declined ? ` (declined: ${on.report.declined})` : ""}` +
        `  on ${String(on.wallMs)} ms  off ${String(off.wallMs)} ms`,
    );
    for (const d of diffs) console.log(`       ${d}`);
    rows.push({ name: c.name, diffs, verdict: on.result.verdict, modes, onMs: on.wallMs, offMs: off.wallMs });
  }

  // Removing the pooled side's finished containers is idle-time work; the run is over, so do it.
  await pool.close();
  await sweepJudgeContainers();

  console.log(
    `\nA/B: ${String(cases.length)} submissions, ${String(tests)} tests, ` +
      `${String(harnessTests)} judged in the harness, ${String(declinedJobs)} declined, ` +
      (args.compare === "pool" ? `${String(pooledJobs)} judged in pre-created containers, ` : "") +
      `${String(diffCount)} differences. wall on ${String(wallOn)} ms, off ${String(wallOff)} ms`,
  );
  if (args.out !== null) writeFileSync(args.out, JSON.stringify(rows, null, 2));
  process.exit(diffCount === 0 ? 0 : 1);
}

void main();
