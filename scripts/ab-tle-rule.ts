#!/usr/bin/env tsx
import "dotenv/config";

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { probeFor, starterFor } from "@/lib/judge/starters";
import { RUNTIMES, VARIANTS, type LanguageId } from "@/lib/judge/runtimes";
import type { JudgeJob, JudgeResult } from "@/lib/schemas/judge";
import { parseProblemManifest, type ProblemManifest } from "@/lib/schemas/seed";
import { isDockerAvailable, sweepJudgeContainers } from "@/worker/docker";
import { scaledStartupBudgetMs } from "@/worker/host";
import { JavacService } from "@/worker/javac-service";
import { judge } from "@/worker/runner";

/**
 * A/B for the TLE rule: judge the SAME submissions with the old rule (a test killed at 3x its
 * limit, and a crash, flood or memory kill reported as such however late) and the new one (a test
 * past its threshold is TLE, killed at the threshold plus TLE_KILL_MARGIN_MS).
 *
 *     npx tsx scripts/ab-tle-rule.ts [--set g4,sandbox,refs,starters,probes,sols] [--sol-dir DIR ...]
 *                                    [--only name-part,...] [--out file.json]
 *
 * The organizers' requirement is that SCORES never change. So it requires, for every submission:
 *   - the same score, and the same points on every test;
 *   - the same verdict on every test, EXCEPT a test that was over its threshold under the old rule
 *     (its measured time past the threshold, or TLE), whose label may change — it earns no points
 *     either way. Each such change is listed.
 * A score or under-threshold label that differs is asked again, both sides, twice. A difference
 * that does not repeat is reported as timing noise with every measurement; one that does fails.
 */

const ROOT = path.resolve(__dirname, "..");
const FIXTURES = path.join(ROOT, "fixtures");
const CONTENT = path.join(ROOT, "content", "problems");

interface Case {
  readonly name: string;
  readonly job: JudgeJob;
}

function args(argv: readonly string[]) {
  let sets = new Set(["g4", "sandbox", "refs", "starters", "probes", "sols"]);
  const solDirs: string[] = [];
  let only: string[] = [];
  let out: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--set") sets = new Set((argv[++i] ?? "").split(","));
    else if (arg === "--sol-dir") solDirs.push(argv[++i] ?? "");
    else if (arg === "--only") only = (argv[++i] ?? "").split(",").filter((x) => x.length > 0);
    else if (arg === "--out") out = argv[++i] ?? null;
  }
  return { sets, solDirs, only, out };
}

/** The verdict threshold judge() computes for a job: limit x multiplier + startup budget. */
function thresholdMs(job: JudgeJob): number {
  const runtime = RUNTIMES[VARIANTS[job.language].runtime];
  return job.limits.timeLimitMs * runtime.multiplier + scaledStartupBudgetMs(runtime.startupBudgetMs);
}

function fixtureTests(dir: string, count: number, points: number): JudgeJob["testCases"] {
  return Array.from({ length: count }, (_, i) => ({
    testCaseId: `t${String(i + 1)}`,
    ordinal: i + 1,
    inputPath: path.join(FIXTURES, "judge", dir, `${String(i + 1)}.in`),
    expectedOutputPath: path.join(FIXTURES, "judge", dir, `${String(i + 1)}.out`),
    isSample: i === 0,
    points,
    group: null,
  }));
}

function limits(timeLimitMs: number, memoryLimitMb: number): JudgeJob["limits"] {
  return { timeLimitMs, memoryLimitMb, wallClockKillMs: timeLimitMs * 3, pidsLimit: 64, tmpfsBytes: 16 * 1024 * 1024, cpus: 1 };
}

function g4Cases(): Case[] {
  const manifest = JSON.parse(readFileSync(path.join(FIXTURES, "judge", "manifest.json"), "utf8")) as {
    problem: { timeLimitMs: number; testCount: number; pointsPerTest: number };
    cases: { id: string; language: LanguageId; sourceFile: string; timeLimitMs?: number; memoryLimitMb?: number; problemDir?: string; testCount?: number }[];
  };
  return manifest.cases.map((c) => ({
    name: `g4/${c.id}`,
    job: {
      submissionId: `abtle-${c.id}`,
      language: c.language,
      sourceCode: readFileSync(path.join(FIXTURES, "judge", "cases", c.id, c.sourceFile), "utf8"),
      limits: limits(
        c.timeLimitMs ?? manifest.problem.timeLimitMs,
        c.memoryLimitMb ?? (VARIANTS[c.language].runtime === "jdk21" ? 512 : 256),
      ),
      comparator: { kind: "whitespace" },
      testCases: fixtureTests(c.problemDir ?? "problem", c.testCount ?? manifest.problem.testCount, manifest.problem.pointsPerTest),
      attempt: 1,
      captureOutput: false,
    },
  }));
}

function sandboxCases(): Case[] {
  const manifest = JSON.parse(readFileSync(path.join(FIXTURES, "sandbox", "manifest.json"), "utf8")) as {
    problem: { timeLimitMs: number };
    cases: { id: string; language: LanguageId; sourceFile: string; testCount?: number }[];
  };
  return manifest.cases.map((c) => ({
    name: `sandbox/${c.id}`,
    job: {
      submissionId: `abtle-sb-${c.id}`,
      language: c.language,
      sourceCode: readFileSync(path.join(FIXTURES, "sandbox", "cases", c.id, c.sourceFile), "utf8"),
      limits: limits(manifest.problem.timeLimitMs, 256),
      comparator: { kind: "whitespace" },
      testCases: fixtureTests("problem", c.testCount ?? 1, 10),
      attempt: 1,
      captureOutput: false,
    },
  }));
}

function problemManifest(slug: string): ProblemManifest | null {
  const file = path.join(CONTENT, slug, "problem.json");
  if (!existsSync(file)) return null;
  return parseProblemManifest(JSON.parse(readFileSync(file, "utf8")), file);
}

function problemJob(slug: string, manifest: ProblemManifest, language: LanguageId, sourceCode: string, tag: string): JudgeJob {
  const testDir = path.join(CONTENT, slug, "tests");
  const inputs = readdirSync(testDir).filter((f) => f.endsWith(".in")).sort();
  return {
    submissionId: `abtle-${tag}-${slug}`,
    language,
    sourceCode,
    limits: limits(manifest.timeLimitMs, manifest.memoryLimitMb),
    comparator: { kind: "whitespace" },
    testCases: inputs.map((f, i) => ({
      testCaseId: f.replace(/\.in$/, ""),
      ordinal: i + 1,
      inputPath: path.join(testDir, f),
      expectedOutputPath: path.join(testDir, f.replace(/\.in$/, ".out")),
      isSample: i < manifest.sampleCount,
      points: 10,
      group: null,
    })),
    attempt: 1,
    captureOutput: false,
  };
}

function contentCases(sets: ReadonlySet<string>, solDirs: readonly string[]): Case[] {
  const cases: Case[] = [];
  for (const slug of readdirSync(CONTENT).sort()) {
    const manifest = problemManifest(slug);
    if (manifest === null) continue;
    const reference = path.join(CONTENT, slug, "reference.py");
    if (sets.has("refs") && existsSync(reference)) {
      cases.push({ name: `ref/${slug}`, job: problemJob(slug, manifest, "PYTHON_312", readFileSync(reference, "utf8"), "ref") });
    }
    if (manifest.signature !== undefined) {
      for (const language of manifest.allowedLanguages) {
        if (sets.has("starters")) {
          cases.push({ name: `starter/${slug}/${language}`, job: problemJob(slug, manifest, language, starterFor(manifest.signature, language), `st-${language}`) });
        }
        if (sets.has("probes")) {
          cases.push({ name: `probe/${slug}/${language}`, job: problemJob(slug, manifest, language, probeFor(manifest.signature, language), `pr-${language}`) });
        }
      }
    }
    if (sets.has("sols")) {
      for (const dir of solDirs) {
        for (const [file, language] of [["Main.java", "JAVA_21"], ["main.cpp", "CPP_17"]] as const) {
          const source = path.join(dir, slug, file);
          if (existsSync(source)) {
            cases.push({ name: `sol/${slug}/${language}`, job: problemJob(slug, manifest, language, readFileSync(source, "utf8"), `sol-${language}`) });
          }
        }
      }
    }
  }
  return cases;
}

interface Side {
  readonly result: JudgeResult;
  readonly wallMs: number;
}

const service = new JavacService({ lanes: 1, image: RUNTIMES.jdk21.image, runtime: RUNTIMES.jdk21 });

async function run(job: JudgeJob, atThreshold: boolean): Promise<Side> {
  const started = Date.now();
  const result = await judge(job, undefined, undefined, { tleAtThreshold: atThreshold, javacService: service });
  return { result, wallMs: Date.now() - started };
}

const pointsOf = (job: JudgeJob, id: string, verdict: string): number =>
  verdict === "AC" ? (job.testCases.find((t) => t.testCaseId === id)?.points ?? 0) : 0;

interface Comparison {
  readonly scoreDiffs: string[];
  readonly labelChanges: string[];
}

function compare(job: JudgeJob, before: JudgeResult, after: JudgeResult, threshold: number): Comparison {
  const scoreDiffs: string[] = [];
  const labelChanges: string[] = [];
  if (before.score !== after.score) scoreDiffs.push(`score ${String(before.score)} -> ${String(after.score)}`);
  if (before.compileError !== after.compileError) scoreDiffs.push("compileError differs");
  if (before.testResults.length !== after.testResults.length) scoreDiffs.push("test count differs");
  for (const [i, x] of before.testResults.entries()) {
    const y = after.testResults[i];
    if (y === undefined) continue;
    const px = pointsOf(job, x.testCaseId, x.verdict);
    const py = pointsOf(job, y.testCaseId, y.verdict);
    if (px !== py) scoreDiffs.push(`${x.testCaseId} points ${String(px)} -> ${String(py)} (${x.verdict} ${String(x.runtimeMs)} ms -> ${y.verdict} ${String(y.runtimeMs)} ms)`);
    if (x.verdict === y.verdict) continue;
    const wasOver = x.verdict === "TLE" || (x.runtimeMs ?? 0) > threshold;
    const line = `${x.testCaseId} ${x.verdict} ${String(x.runtimeMs)} ms -> ${y.verdict} ${String(y.runtimeMs)} ms (threshold ${String(threshold)} ms)`;
    if (wasOver) labelChanges.push(line);
    else scoreDiffs.push(`label under the threshold: ${line}`);
  }
  if (before.verdict !== after.verdict && scoreDiffs.length === 0 && labelChanges.length === 0) {
    scoreDiffs.push(`verdict ${before.verdict} -> ${after.verdict}`);
  }
  return { scoreDiffs, labelChanges };
}

async function main(): Promise<void> {
  const a = args(process.argv.slice(2));
  if (!(await isDockerAvailable())) {
    console.error("Docker daemon is not reachable. The A/B is NOT RUN.");
    process.exit(2);
  }
  await sweepJudgeContainers();
  await service.start();
  const all = [
    ...(a.sets.has("g4") ? g4Cases() : []),
    ...(a.sets.has("sandbox") ? sandboxCases() : []),
    ...contentCases(a.sets, a.solDirs),
  ];
  const cases = a.only.length === 0 ? all : all.filter((c) => a.only.some((part) => c.name.includes(part)));

  let failures = 0;
  let noise = 0;
  let tests = 0;
  const allChanges: string[] = [];
  const rows: unknown[] = [];
  let wallBefore = 0;
  let wallAfter = 0;
  for (const [index, c] of cases.entries()) {
    const threshold = thresholdMs(c.job);
    const newFirst = index % 2 === 1;
    const first = await run(c.job, newFirst);
    const second = await run(c.job, !newFirst);
    const before = newFirst ? second : first;
    const after = newFirst ? first : second;
    wallBefore += before.wallMs;
    wallAfter += after.wallMs;
    tests += before.result.testResults.length;
    let cmp = compare(c.job, before.result, after.result, threshold);
    const retries: string[] = [];
    if (cmp.scoreDiffs.length > 0) {
      // Ask again, both sides, twice: is it the rule, or the host's timing?
      let repeated = 0;
      for (let k = 0; k < 2; k += 1) {
        const b = await run(c.job, false);
        const n = await run(c.job, true);
        const again = compare(c.job, b.result, n.result, threshold);
        retries.push(`retry ${String(k + 1)}: old ${b.result.verdict} ${String(b.result.score)}, new ${n.result.verdict} ${String(n.result.score)}${again.scoreDiffs.length > 0 ? ` (${again.scoreDiffs.join("; ")})` : ""}`);
        if (again.scoreDiffs.length > 0) repeated += 1;
      }
      if (repeated === 2) failures += 1;
      else {
        noise += 1;
        cmp = { scoreDiffs: cmp.scoreDiffs.map((d) => `[did not repeat] ${d}`), labelChanges: cmp.labelChanges };
      }
    }
    const tag = cmp.scoreDiffs.length > 0 ? (retries.length > 0 && cmp.scoreDiffs[0]?.startsWith("[did not repeat]") ? "NOISE" : "DIFF") : cmp.labelChanges.length > 0 ? "LABEL" : "same";
    console.log(
      `${tag.padEnd(5)} ${c.name.padEnd(52)} ${before.result.verdict}/${String(before.result.score)} -> ${after.result.verdict}/${String(after.result.score)}` +
        `  old ${String(before.wallMs)} ms  new ${String(after.wallMs)} ms`,
    );
    for (const d of cmp.scoreDiffs) console.log(`        ${d}`);
    for (const d of cmp.labelChanges) console.log(`        label: ${d}`);
    for (const r of retries) console.log(`        ${r}`);
    for (const d of cmp.labelChanges) allChanges.push(`${c.name} ${d}`);
    rows.push({ name: c.name, before: before.result, after: after.result, beforeMs: before.wallMs, afterMs: after.wallMs, ...cmp, retries });
  }
  await service.close();
  await sweepJudgeContainers();
  console.log(`\nLabel changes on tests already over the threshold (${String(allChanges.length)}):`);
  for (const line of allChanges) console.log(`  ${line}`);
  console.log(
    `\nA/B TLE rule: ${String(cases.length)} submissions, ${String(tests)} tests, ` +
      `${String(failures)} score differences that repeated, ${String(noise)} that did not repeat, ` +
      `${String(allChanges.length)} label changes over the threshold. wall old ${String(wallBefore)} ms, new ${String(wallAfter)} ms`,
  );
  if (a.out !== null) writeFileSync(a.out, JSON.stringify(rows, null, 2));
  process.exit(failures === 0 ? 0 : 1);
}

void main();
