/**
 * What the web process spends while a room full of students waits on verdicts.
 *
 *   npx tsx scripts/measure-board-load.ts seed
 *   npx tsx scripts/measure-board-load.ts run --base http://localhost:3207 --pid <web pid> \
 *     [--pg-container <name>] [--frozen]
 *
 * `seed` builds one RUNNING contest in the database `.env` points at: 50 participants on 13 teams
 * (twelve of four, one of two), four sets of two problems plus a group problem, about 400 judged
 * submissions with their score revisions, and a Kahoot payout per team. It mints a session per
 * student plus one organizer session and writes the tokens to a file under the system temp
 * directory (or `MEASURE_OUT_DIR`), never to stdout.
 *
 * `--frozen` runs the same load with the public board frozen a minute before the window starts,
 * which is how the end-of-night burst actually arrives.
 *
 * `run` then plays the night's worst two minutes against a server that is already up:
 *
 * - 50 student pages, each holding the contest stream and polling team standings every 5 s;
 * - the projector, polling the anonymous team board every 5 s;
 * - a stand-in judge, in this process, consuming the real BullMQ queue at about 2 jobs/s, while
 *   the harness keeps a burst-sized backlog (57) of pending submissions topped up.
 *
 * The judge stand-in is a BullMQ worker that returns a well-formed `JudgeResult` without running
 * anything. That is deliberate: the web side cannot tell it from the real worker (the worker
 * writes nothing to Postgres; the web process persists every verdict through `reconcile`), and
 * the real judge would spend the very CPU this measures.
 *
 * Reported: the web process's CPU-seconds per minute (from `ps`), the database's when it runs alone
 * in a container named by `--pg-container` (from that container's cgroup `cpu.stat`, so a shared
 * Postgres serving other work cannot be measured this way), database transactions per
 * second for this database (`pg_stat_database`, where each Prisma statement outside a
 * transaction is one), p50/p95 of the standings polls, and p50/p95 from a job completing to its
 * verdict frame reaching the student's stream.
 *
 * ONLY EVER POINT THIS AT A SCRATCH DATABASE AND A SCRATCH REDIS INDEX. `seed` deletes its own
 * contest by join code, and `run` adds and completes jobs on whatever queue `REDIS_URL` names.
 */

import "dotenv/config";

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

import { prisma } from "@/lib/db";
import { issueSession } from "@/lib/contest/session-store";
import { SESSION_COOKIE } from "@/lib/contest/session";
import { JUDGE_QUEUE_NAME, laneJobOptions } from "@/lib/judge/queue";
import { parseServerEnv } from "@/lib/schemas/env";
import type { JudgeResult } from "@/lib/schemas/judge";

const JOIN_CODE = "PERFLOAD";
const OUT_DIR = path.resolve(process.env.MEASURE_OUT_DIR ?? path.join(tmpdir(), "ptcn-measure"));
const TOKENS_FILE = path.join(OUT_DIR, "board-load-sessions.json");

const STUDENTS = 50;
const TEAM_SIZE = 4;
const PROBLEMS = 9;
const SET_LABELS = ["A", "B", "C", "D"] as const;
const JUDGED_SUBMISSIONS = 400;
const BACKLOG = 57;
const JUDGE_INTERVAL_MS = 500;
const POLL_MS = 5_000;
const DURATION_MS = Number(process.env.MEASURE_DURATION_MS ?? 120_000);

interface SessionsFile {
  readonly contestId: string;
  readonly adminToken: string;
  readonly students: readonly { participantId: string; token: string; problemIds: string[] }[];
}

/** A deterministic generator, so before and after are measured against the same rows. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

async function seed(): Promise<void> {
  const random = rng(20261115);
  const now = new Date();
  const startsAt = new Date(now.getTime() - 40 * 60_000);

  await prisma.contest.deleteMany({ where: { joinCode: JOIN_CODE } });

  const problems = [];
  for (let i = 1; i <= PROBLEMS; i += 1) {
    const slug = `perf-load-${i}`;
    const problem = await prisma.problem.upsert({
      where: { slug },
      create: { slug, title: `Load problem ${i}`, state: "PUBLISHED", type: "ALGORITHM" },
      update: {},
      select: { id: true },
    });
    await prisma.testCase.upsert({
      where: { problemId_ordinal: { problemId: problem.id, ordinal: 1 } },
      create: {
        problemId: problem.id,
        ordinal: 1,
        inputPath: `${slug}/1.in`,
        expectedOutputPath: `${slug}/1.out`,
        points: 100,
      },
      update: {},
    });
    problems.push(problem);
  }

  const contest = await prisma.contest.create({
    data: {
      name: "Board load measurement",
      joinCode: JOIN_CODE,
      state: "RUNNING",
      startsAt,
      endsAt: new Date(now.getTime() + 3 * 60 * 60_000),
    },
    select: { id: true },
  });

  // Four sets of two individual problems each, plus one group problem: the night's shape.
  const sets = [];
  for (const label of SET_LABELS) {
    sets.push(
      await prisma.problemSet.create({
        data: { contestId: contest.id, label },
        select: { id: true },
      }),
    );
  }
  const contestProblems: { id: string; setId: string | null }[] = [];
  for (const [index, problem] of problems.entries()) {
    const group = index === PROBLEMS - 1;
    const setId = group ? null : (sets[Math.floor(index / 2)]?.id ?? null);
    contestProblems.push(
      await prisma.contestProblem.create({
        data: {
          contestId: contest.id,
          problemId: problem.id,
          slotLabel: group ? "G" : `${SET_LABELS[Math.floor(index / 2)]}${(index % 2) + 1}`,
          basePoints: group ? 300 : 100 + 100 * (index % 2),
          round: group ? "GROUP" : "INDIVIDUAL",
          setId,
        },
        select: { id: true, setId: true },
      }),
    );
  }
  const problemIdsForSet = (setId: string | undefined): string[] =>
    contestProblems.filter((cp) => cp.setId === null || cp.setId === setId).map((cp) => cp.id);

  const teamCount = Math.ceil(STUDENTS / TEAM_SIZE);
  const teams = [];
  for (let t = 0; t < teamCount; t += 1) {
    teams.push(
      await prisma.team.create({
        data: { contestId: contest.id, name: `Team ${t + 1}`, joinCode: `PL${t}` },
        select: { id: true },
      }),
    );
  }

  const participants = [];
  for (let s = 0; s < STUDENTS; s += 1) {
    participants.push(
      await prisma.participant.create({
        data: {
          contestId: contest.id,
          displayName: `Student ${String(s + 1).padStart(2, "0")}`,
          teamId: teams[Math.floor(s / TEAM_SIZE)]?.id ?? null,
          chosenSetId: sets[s % TEAM_SIZE]?.id ?? null,
          joinedAt: startsAt,
        },
        select: { id: true, chosenSetId: true },
      }),
    );
  }

  for (let n = 0; n < JUDGED_SUBMISSIONS; n += 1) {
    const participant = participants[Math.floor(random() * participants.length)];
    if (participant === undefined) continue;
    const mine = problemIdsForSet(participant.chosenSetId ?? undefined);
    const contestProblemId = mine[Math.floor(random() * mine.length)];
    if (contestProblemId === undefined) continue;
    const submittedAt = new Date(startsAt.getTime() + Math.floor(random() * 39 * 60_000));
    const effectiveAt = new Date(submittedAt.getTime() + 5_000);
    const accepted = random() < 0.4;
    await prisma.submission.create({
      data: {
        participantId: participant.id,
        contestProblemId,
        language: "JAVA_21",
        sourceCode: "class Main {}",
        submittedAt,
        verdict: accepted ? "AC" : "WA",
        score: accepted ? 100 : 0,
        judgedAt: effectiveAt,
        effectiveAt,
        scoreRevisions: {
          create: { verdict: accepted ? "AC" : "WA", score: accepted ? 100 : 0, effectiveAt },
        },
      },
    });
  }

  const payout = [60, 40, 20, 10];
  for (const [index, team] of teams.entries()) {
    await prisma.teamSideActivity.create({
      data: {
        teamId: team.id,
        label: "Kahoot",
        points: payout[index % payout.length] ?? 0,
        enteredBy: "measure-board-load",
      },
    });
  }

  const admin = await issueSession(
    { role: "ADMIN", method: "ADMIN_PASSCODE", displayName: "Load organizer" },
    now,
  );
  const students = [];
  for (const [index, participant] of participants.entries()) {
    const issued = await issueSession(
      {
        role: "COMPETITOR",
        method: "JOIN_CODE",
        displayName: `Student ${String(index + 1).padStart(2, "0")}`,
        participantId: participant.id,
        contestId: contest.id,
      },
      now,
    );
    students.push({
      participantId: participant.id,
      token: issued.token,
      problemIds: problemIdsForSet(participant.chosenSetId ?? undefined),
    });
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const file: SessionsFile = { contestId: contest.id, adminToken: admin.token, students };
  writeFileSync(TOKENS_FILE, JSON.stringify(file), { mode: 0o600 });
  console.log(`seeded contest ${contest.id}: ${STUDENTS} students, ${teams.length} teams`);
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? Number.NaN;
}

/** Cumulative CPU seconds of one process, from `ps` (`[[dd-]hh:]mm:ss.cc`). */
function cpuSecondsOf(pid: number): number {
  const raw = execFileSync("ps", ["-o", "time=", "-p", String(pid)], { encoding: "utf8" }).trim();
  const [daysPart, clock] = raw.includes("-") ? raw.split("-") : ["0", raw];
  const parts = (clock ?? "").split(":").map(Number);
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + part;
  return Number(daysPart) * 86_400 + seconds;
}

/** Cumulative CPU seconds of a whole container, from its cgroup v2 `cpu.stat`. */
function containerCpuSeconds(container: string | undefined): number {
  if (container === undefined) return Number.NaN;
  const stat = execFileSync("docker", ["exec", container, "cat", "/sys/fs/cgroup/cpu.stat"], {
    encoding: "utf8",
  });
  const usec = /^usage_usec (\d+)$/m.exec(stat)?.[1];
  return usec === undefined ? Number.NaN : Number(usec) / 1_000_000;
}

async function transactionCount(): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT (xact_commit + xact_rollback)::bigint AS n
    FROM pg_stat_database WHERE datname = current_database()`;
  return Number(rows[0]?.n ?? 0);
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function addPending(
  queue: Queue,
  participantId: string,
  contestProblemId: string,
): Promise<string> {
  const row = await prisma.submission.create({
    data: { participantId, contestProblemId, language: "JAVA_21", sourceCode: "class Main {}" },
    select: { id: true },
  });
  await queue.add(
    JUDGE_QUEUE_NAME,
    { submissionId: row.id },
    { jobId: row.id, attempts: 1, removeOnComplete: { count: 2_000 }, ...laneJobOptions("ordinary") },
  );
  return row.id;
}

interface StreamStats {
  verdictArrivals: Map<string, number>;
  standingsFrames: number;
}

/** Hold one stream open and record when each verdict frame arrives. */
async function holdStream(
  url: string,
  cookie: string,
  stats: StreamStats,
  signal: AbortSignal,
): Promise<void> {
  try {
    const response = await fetch(url, { headers: { cookie }, signal });
    if (response.body === null) return;
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = /^event: (.+)$/m.exec(frame)?.[1];
        const data = /^data: (.+)$/m.exec(frame)?.[1];
        if (event === "verdict" && data !== undefined) {
          const parsed = JSON.parse(data) as { submissionId: string };
          if (!stats.verdictArrivals.has(parsed.submissionId)) {
            stats.verdictArrivals.set(parsed.submissionId, Date.now());
          }
        } else if (event === "standings") {
          stats.standingsFrames += 1;
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
  } catch {
    // Aborted at the end of the run, or dropped; a dropped stream is visible as missing verdicts.
  }
}

interface PollCounts {
  count: number;
  notModified: number;
}

/**
 * One page's poll, behaving like the browser's `cache: "no-cache"` fetch: it remembers the last
 * ETag and sends it back, so a server that tags its boards can answer 304.
 */
async function pollLoop(
  url: string,
  cookie: string | null,
  latencies: number[],
  failures: PollCounts,
  signal: AbortSignal,
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, Math.random() * POLL_MS));
  let etag: string | null = null;
  while (!signal.aborted) {
    const started = performance.now();
    try {
      const headers: Record<string, string> = {};
      if (cookie !== null) headers.cookie = cookie;
      if (etag !== null) headers["if-none-match"] = etag;
      const response = await fetch(url, { headers, signal });
      await response.arrayBuffer();
      if (response.status === 304) failures.notModified += 1;
      if (response.ok || response.status === 304) {
        latencies.push(performance.now() - started);
        etag = response.headers.get("etag") ?? etag;
      } else failures.count += 1;
    } catch {
      if (!signal.aborted) failures.count += 1;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

async function run(): Promise<void> {
  const base = argument("base") ?? "http://localhost:3207";
  const pid = Number(argument("pid"));
  if (!Number.isInteger(pid) || pid <= 0) throw new Error("--pid <web server pid> is required");

  const sessions = JSON.parse(readFileSync(TOKENS_FILE, "utf8")) as SessionsFile;
  const env = parseServerEnv();
  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue(JUDGE_QUEUE_NAME, { connection });

  // Clear what a previous run left pending, so every run starts from the same backlog.
  await prisma.submission.deleteMany({
    where: { verdict: null, participant: { contestId: sessions.contestId } },
  });
  await queue.obliterate({ force: true });

  // `--frozen` plays the end of the night: the public board has been frozen since a minute ago
  // (a scheduled freeze, state still RUNNING) while the burst lands. Without it, no freeze.
  const frozen = process.argv.includes("--frozen");
  await prisma.contest.update({
    where: { id: sessions.contestId },
    data: { state: "RUNNING", freezeAt: frozen ? new Date(Date.now() - 60_000) : null },
  });

  const random = rng(7);
  const pick = <T,>(items: readonly T[]): T => {
    const item = items[Math.floor(random() * items.length)];
    if (item === undefined) throw new Error("empty pick");
    return item;
  };
  const addOne = async (): Promise<void> => {
    const student = pick(sessions.students);
    await addPending(queue, student.participantId, pick(student.problemIds));
  };
  for (let i = 0; i < BACKLOG; i += 1) await addOne();

  const completedAt = new Map<string, number>();
  const verdictRandom = rng(11);
  const worker = new Worker(
    JUDGE_QUEUE_NAME,
    async (job): Promise<JudgeResult> => {
      await new Promise((resolve) => setTimeout(resolve, JUDGE_INTERVAL_MS));
      const accepted = verdictRandom() < 0.5;
      const submissionId = String((job.data as { submissionId: string }).submissionId);
      return {
        submissionId,
        verdict: accepted ? "AC" : "WA",
        score: accepted ? 100 : 0,
        runtimeMs: 12,
        memoryKb: 1_024,
        testResults: [],
        compileError: null,
        judgeLogRef: null,
      };
    },
    { connection: new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null }), concurrency: 1 },
  );
  worker.on("completed", (job) => completedAt.set(String(job.id), Date.now()));

  const controller = new AbortController();
  const stats: StreamStats = { verdictArrivals: new Map(), standingsFrames: 0 };
  const studentLatencies: number[] = [];
  const projectorLatencies: number[] = [];
  const failures: PollCounts = { count: 0, notModified: 0 };
  const tasks: Promise<void>[] = [];

  for (const student of sessions.students) {
    const cookie = `${SESSION_COOKIE}=${student.token}`;
    tasks.push(
      holdStream(`${base}/api/contests/${sessions.contestId}/stream`, cookie, stats, controller.signal),
      pollLoop(
        `${base}/api/contests/${sessions.contestId}/team-standings`,
        cookie,
        studentLatencies,
        failures,
        controller.signal,
      ),
    );
  }
  tasks.push(
    pollLoop(
      `${base}/api/team-standings?contest=${sessions.contestId}`,
      null,
      projectorLatencies,
      failures,
      controller.signal,
    ),
  );

  // Keep the backlog burst-sized: one new submission per completed one.
  const topUp = setInterval(() => void addOne().catch(() => undefined), JUDGE_INTERVAL_MS);

  // Let every page open and settle before the window starts.
  await new Promise((resolve) => setTimeout(resolve, 10_000));
  const pgContainer = argument("pg-container");
  const cpuBefore = cpuSecondsOf(pid);
  const pgBefore = containerCpuSeconds(pgContainer);
  const xactBefore = await transactionCount();
  const windowStart = Date.now();
  studentLatencies.length = 0;
  projectorLatencies.length = 0;

  await new Promise((resolve) => setTimeout(resolve, DURATION_MS));

  const elapsedS = (Date.now() - windowStart) / 1_000;
  const cpuAfter = cpuSecondsOf(pid);
  const pgAfter = containerCpuSeconds(pgContainer);
  const xactAfter = await transactionCount();

  clearInterval(topUp);
  controller.abort();
  await worker.close();
  await Promise.allSettled(tasks);

  const verdictLatencies: number[] = [];
  let missed = 0;
  for (const [submissionId, finished] of completedAt) {
    if (finished < windowStart || finished > windowStart + DURATION_MS - 5_000) continue;
    const arrived = stats.verdictArrivals.get(submissionId);
    if (arrived === undefined) missed += 1;
    else verdictLatencies.push(arrived - finished);
  }
  const allPolls = [...studentLatencies, ...projectorLatencies];

  const report = {
    frozen,
    windowSeconds: Number(elapsedS.toFixed(1)),
    webCpuSecondsPerMinute: Number((((cpuAfter - cpuBefore) / elapsedS) * 60).toFixed(2)),
    webCpuPercentOfOneCore: Number((((cpuAfter - cpuBefore) / elapsedS) * 100).toFixed(1)),
    postgresCpuSecondsPerMinute: Number((((pgAfter - pgBefore) / elapsedS) * 60).toFixed(2)),
    webPlusPostgresCpuSecondsPerMinute: Number(
      (((cpuAfter - cpuBefore + (pgAfter - pgBefore)) / elapsedS) * 60).toFixed(2),
    ),
    dbTransactionsPerSecond: Number(((xactAfter - xactBefore) / elapsedS).toFixed(1)),
    standingsPolls: allPolls.length,
    pollFailures: failures.count,
    pollsNotModified: failures.notModified,
    standingsP50Ms: Number(percentile(allPolls, 50).toFixed(1)),
    standingsP95Ms: Number(percentile(allPolls, 95).toFixed(1)),
    projectorP50Ms: Number(percentile(projectorLatencies, 50).toFixed(1)),
    projectorP95Ms: Number(percentile(projectorLatencies, 95).toFixed(1)),
    verdictsJudged: verdictLatencies.length + missed,
    verdictsNeverStreamed: missed,
    verdictLatencyP50Ms: Number(percentile(verdictLatencies, 50).toFixed(0)),
    verdictLatencyP95Ms: Number(percentile(verdictLatencies, 95).toFixed(0)),
    streamStandingsFrames: stats.standingsFrames,
  };
  console.log(JSON.stringify(report, null, 2));

  await queue.close();
  await connection.quit();
}

const command = process.argv[2];
const main = command === "seed" ? seed : command === "run" ? run : null;
if (main === null) {
  console.error("usage: measure-board-load.ts seed | run --base <url> --pid <pid> [--pg-container <name>]");
  process.exit(2);
}
main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
