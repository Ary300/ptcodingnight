#!/usr/bin/env tsx
/**
 * The judge WORKER's own CPU per submission, during a burst, with a CPU profile of where it went.
 *
 *     BURST_REDIS_URL=redis://:pw@localhost:6379/7 npx tsx scripts/measure-worker-cpu.ts \
 *         --sol-dir DIR [--count 40] [--concurrency 4] [--profile-dir DIR]
 *
 * Runs the real worker (worker/index.ts, under `node --cpu-prof`) against a Redis DATABASE that no
 * other worker reads, enqueues `--count` Java 21 submissions at once (correct solutions from
 * --sol-dir, judged against their problems' real tests), waits for every one, then stops the worker
 * with SIGTERM so it drains and writes its profile. It reports the worker process's CPU time over
 * the burst divided by the submissions, the verdicts, and the profile's top functions by self time.
 *
 * Two numbers. The worker's own process (ps, sampled before and after the burst), and the worker
 * WITH every `docker` client it ran: the worker runs under `/usr/bin/time -p`, whose totals include
 * the children it waited for, and a run with `--count 0` (same start-up, no burst) is subtracted.
 * The containers themselves are the judge's cost, not the worker's, and are in neither.
 */
import "dotenv/config";

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { Queue } from "bullmq";
import IORedis from "ioredis";

import { JUDGE_JOB_OPTIONS, JUDGE_QUEUE_NAME } from "@/lib/judge/queue";
import type { JudgeJob } from "@/lib/schemas/judge";
import { parseProblemManifest } from "@/lib/schemas/seed";

const ROOT = path.resolve(__dirname, "..");
const CONTENT = path.join(ROOT, "content", "problems");

function arg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
}

function jobs(solDir: string, count: number): JudgeJob[] {
  const base: JudgeJob[] = [];
  for (const slug of readdirSync(solDir).sort()) {
    const source = path.join(solDir, slug, "Main.java");
    const manifestFile = path.join(CONTENT, slug, "problem.json");
    if (!existsSync(source) || !existsSync(manifestFile)) continue;
    const manifest = parseProblemManifest(JSON.parse(readFileSync(manifestFile, "utf8")), manifestFile);
    const testDir = path.join(CONTENT, slug, "tests");
    const inputs = readdirSync(testDir).filter((f) => f.endsWith(".in")).sort();
    base.push({
      submissionId: slug,
      language: "JAVA_21",
      sourceCode: readFileSync(source, "utf8"),
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
        isSample: i < manifest.sampleCount,
        points: 10,
        group: null,
      })),
      attempt: 1,
      captureOutput: false,
    });
  }
  if (base.length === 0) throw new Error(`no Java solutions with problems under ${solDir}`);
  return Array.from({ length: count }, (_, i) => {
    const job = base[i % base.length];
    if (job === undefined) throw new Error("unreachable");
    return { ...job, submissionId: `burst-${String(process.pid)}-${String(i)}-${job.submissionId}` };
  });
}

/** CPU seconds a process has used, from ps (user + system). */
function cpuSeconds(pid: number): number {
  const out = execFileSync("ps", ["-o", "time=", "-p", String(pid)], { encoding: "utf8" }).trim();
  const parts = out.split(":").map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
}

function topSelfTime(file: string, limit: number): string[] {
  const profile = JSON.parse(readFileSync(file, "utf8")) as {
    nodes: ProfileNode[];
    samples: number[];
    timeDeltas: number[];
  };
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map<string, number>();
  let total = 0;
  for (const [i, id] of profile.samples.entries()) {
    const node = byId.get(id);
    const delta = profile.timeDeltas[i] ?? 0;
    if (node === undefined) continue;
    const name = node.callFrame.functionName || "(anonymous)";
    if (name === "(idle)") continue;
    const where = node.callFrame.url.replace(/^.*\/(node_modules|worker|lib)\//, "$1/");
    const key = `${name} ${where}:${String(node.callFrame.lineNumber + 1)}`;
    self.set(key, (self.get(key) ?? 0) + delta);
    total += delta;
  }
  return [
    `busy samples ${(total / 1e6).toFixed(2)} s`,
    ...[...self.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, us]) => `${(us / 1e3).toFixed(0).padStart(7)} ms  ${((100 * us) / total).toFixed(1).padStart(5)}%  ${key}`),
  ];
}

async function main(): Promise<void> {
  const redisUrl = process.env.BURST_REDIS_URL;
  if (redisUrl === undefined || !/\/\d+$/.test(redisUrl) || /\/0$/.test(redisUrl)) {
    throw new Error("BURST_REDIS_URL must name a Redis database other than 0, so no live worker takes the jobs");
  }
  const count = Number(arg("--count", "40"));
  const concurrency = arg("--concurrency", "4");
  const profileDir = path.resolve(arg("--profile-dir", path.join(ROOT, ".judge-tmp", "cpu-prof")));
  mkdirSync(profileDir, { recursive: true });
  const work = count === 0 ? [] : jobs(arg("--sol-dir", ""), count);

  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(JUDGE_QUEUE_NAME, { connection });
  await queue.obliterate({ force: true });

  const worker = spawn(
    "/usr/bin/time",
    ["-p", process.execPath, "--cpu-prof", `--cpu-prof-dir=${profileDir}`, "--import", "tsx", "worker/index.ts"],
    {
      cwd: ROOT,
      env: { ...process.env, REDIS_URL: redisUrl, JUDGE_CONCURRENCY: concurrency, JUDGE_WORKER_ID: `burst-${String(process.pid)}` },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let log = "";
  let errLog = "";
  worker.stdout.on("data", (chunk: Buffer) => (log += chunk.toString()));
  worker.stderr.on("data", (chunk: Buffer) => (errLog += chunk.toString()));
  const exited = new Promise<void>((resolve) => worker.on("exit", () => resolve()));
  const timePid = worker.pid;
  if (timePid === undefined) throw new Error("worker did not start");
  let pid = 0;
  while (pid === 0) {
    const out = execFileSync("pgrep", ["-P", String(timePid)], { encoding: "utf8" }).trim();
    pid = Number(out.split("\n")[0] ?? "0");
    if (pid === 0) await new Promise((r) => setTimeout(r, 100));
  }

  while (!log.includes('"event":"judge.started"')) await new Promise((r) => setTimeout(r, 200));
  // Let start-up work (pool fill, javac warm-up) finish before the clock starts.
  await new Promise((r) => setTimeout(r, Number(arg("--settle-ms", "60000"))));

  const cpuBefore = cpuSeconds(pid);
  const started = Date.now();
  if (work.length > 0) {
    await queue.addBulk(work.map((job) => ({ name: "judge", data: job, opts: { ...JUDGE_JOB_OPTIONS, jobId: job.submissionId } })));
  }
  for (;;) {
    const counts = await queue.getJobCounts("completed", "failed");
    if ((counts.completed ?? 0) + (counts.failed ?? 0) >= count) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const drainMs = Date.now() - started;
  const cpuAfter = cpuSeconds(pid);
  const done = await queue.getJobs(["completed"], 0, count);
  const verdicts = new Map<string, number>();
  for (const job of done) {
    const verdict = (job.returnvalue as { verdict?: string } | undefined)?.verdict ?? "?";
    verdicts.set(verdict, (verdicts.get(verdict) ?? 0) + 1);
  }

  // To the worker itself: /usr/bin/time would die of it and leave the worker running.
  process.kill(pid, "SIGTERM");
  await exited;
  await queue.obliterate({ force: true });
  await queue.close();
  await connection.quit();

  console.log(`burst: ${String(count)} Java 21 submissions, concurrency ${concurrency}, drained in ${String(drainMs)} ms`);
  console.log(`verdicts: ${[...verdicts.entries()].map(([v, n]) => `${v} ${String(n)}`).join(", ")}`);
  const user = /^user\s+([\d.]+)/m.exec(errLog)?.[1];
  const sys = /^sys\s+([\d.]+)/m.exec(errLog)?.[1];
  console.log(
    `worker process CPU over the burst: ${(cpuAfter - cpuBefore).toFixed(2)} s` +
      (count > 0 ? ` = ${((cpuAfter - cpuBefore) / count).toFixed(3)} CPU-s per submission` : ""),
  );
  console.log(
    `worker lifetime CPU with its docker clients (time -p): user ${user ?? "?"} s, sys ${sys ?? "?"} s, ` +
      `total ${(Number(user) + Number(sys)).toFixed(2)} s — subtract a --count 0 run for the burst's share`,
  );
  const profiles = readdirSync(profileDir).filter((f) => f.endsWith(".cpuprofile")).sort();
  const latest = profiles.at(-1);
  if (latest !== undefined) {
    console.log(`profile ${path.join(profileDir, latest)} (whole worker lifetime, start-up included):`);
    for (const line of topSelfTime(path.join(profileDir, latest), 30)) console.log(`  ${line}`);
  }
  process.exit(0);
}

void main();
