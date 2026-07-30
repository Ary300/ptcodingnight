// Standalone tsx entrypoint — load .env before anything reads process.env.
import "dotenv/config";

import { readFileSync } from "node:fs";
import path from "node:path";

import { Queue } from "bullmq";
import IORedis from "ioredis";

import { JUDGE_QUEUE_NAME } from "@/lib/judge/queue";
import { parseServerEnv } from "@/lib/schemas/env";
import { SESSION_COOKIE } from "@/lib/contest/session";
import { issueSession } from "@/lib/contest/session-store";
import { SubmissionViewSchema, apiResponseSchema } from "@/lib/schemas/api";

import {
  closeTestDb,
  liveProblem,
  repoRoot,
  pinParticipantToProblemSet,
  seedE2EContest,
  type SeededContest,
} from "../tests/e2e/helpers/seed";

/**
 * G8 — load.
 *
 * Pass condition (docs/PRD.md §12): 40 concurrent submissions, zero dropped jobs, zero `IE`
 * verdicts, p95 verdict latency under 10 seconds. That number comes from how a Coding Night
 * actually ends — 20 to 40 people all submitting in the last minutes.
 *
 * ## What is measured, exactly
 *
 * Verdict latency is the wall time from **the moment this process sends `POST /api/submissions`**
 * to **the moment a poll first sees a non-null verdict**. That covers the enqueue, the wait in
 * the queue, container creation, the run, and reconciliation — which is what a student actually
 * experiences. It is deliberately not "how long the container ran".
 *
 * The poll interval adds up to `POLL_MS` of quantisation error to every sample, upward. That is
 * reported rather than subtracted out: a measurement that flatters itself is worse than a
 * slightly pessimistic one.
 *
 * p95 is the **nearest-rank 95th percentile of the sorted samples** — not a mean, not an
 * interpolation. A mean would hide exactly the tail this gate exists to catch.
 *
 * ## Preconditions are checked, never assumed
 *
 * A run that quietly submits nothing and reports p95 = 0 would be the worst possible outcome, so
 * every precondition below exits non-zero with a readable reason instead. A gate that could not
 * run has not passed.
 */

// --- the contract ----------------------------------------------------------

const TARGET_CONCURRENT_SUBMISSIONS = 40;
const P95_LATENCY_BUDGET_MS = 10_000;

// --- knobs -----------------------------------------------------------------

const POLL_MS = 250;
/** Hard ceiling on the whole burst. Well past the budget, so a miss is measured, not truncated. */
const OVERALL_DEADLINE_MS = 5 * 60_000;
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const DIVISION_KEY = "intermediate";

// --- reporting -------------------------------------------------------------

interface Sample {
  readonly index: number;
  readonly participant: string;
  readonly submissionId: string | null;
  /** ms from POST send to the first non-null verdict. Null when no verdict ever arrived. */
  readonly latencyMs: number | null;
  /** ms for the POST itself to come back. */
  readonly enqueueMs: number | null;
  readonly verdict: string | null;
  readonly error: string | null;
}

function percentile(sortedAscending: readonly number[], fraction: number): number {
  if (sortedAscending.length === 0) return Number.NaN;
  // Nearest-rank: the smallest sample at or below which `fraction` of the samples fall.
  const rank = Math.ceil(fraction * sortedAscending.length);
  const index = Math.min(sortedAscending.length - 1, Math.max(0, rank - 1));
  return sortedAscending[index] ?? Number.NaN;
}

const BUCKET_EDGES_MS = [1_000, 2_000, 3_000, 5_000, 7_500, 10_000, 15_000, 30_000, 60_000];

function histogram(sortedAscending: readonly number[]): string {
  if (sortedAscending.length === 0) return "  (no samples)";

  const counts = new Array<number>(BUCKET_EDGES_MS.length + 1).fill(0);
  for (const value of sortedAscending) {
    const bucket = BUCKET_EDGES_MS.findIndex((edge) => value < edge);
    const index = bucket === -1 ? BUCKET_EDGES_MS.length : bucket;
    counts[index] = (counts[index] ?? 0) + 1;
  }

  const widest = Math.max(...counts, 1);
  const lines: string[] = [];
  for (let index = 0; index < counts.length; index += 1) {
    const label =
      index === BUCKET_EDGES_MS.length
        ? `>= ${(BUCKET_EDGES_MS[BUCKET_EDGES_MS.length - 1] ?? 0) / 1000}s`
        : `< ${(BUCKET_EDGES_MS[index] ?? 0) / 1000}s`;
    const count = counts[index] ?? 0;
    const bar = "#".repeat(Math.round((count / widest) * 40));
    lines.push(`  ${label.padStart(8)} | ${String(count).padStart(3)} ${bar}`);
  }
  return lines.join("\n");
}

function fail(message: string): never {
  console.error(`\nG8 FAILED: ${message}`);
  process.exit(1);
}

// --- preconditions ---------------------------------------------------------

async function assertWebServerUp(): Promise<void> {
  try {
    const response = await fetch(`${BASE_URL}/api/submissions`, {
      headers: { accept: "application/json" },
    });
    // 403 is the right answer for an anonymous caller; a parseable body means it is alive.
    await response.json();
  } catch (error: unknown) {
    fail(
      `no web server at ${BASE_URL} (${error instanceof Error ? error.message : String(error)}). ` +
        "Start it with `npm run dev`, or `npm run build && npm start`.",
    );
  }
}

async function assertWorkerListening(queue: Queue): Promise<number> {
  const workers = await queue.getWorkers();
  if (workers.length === 0) {
    fail(
      "no judge worker is consuming the `judge` queue. Start one with `npm run worker` " +
        "(which itself needs a running Docker daemon).",
    );
  }
  return workers.length;
}

// A shared SESSION_SECRET check used to live here: when the cookie WAS the session, a secret
// mismatch between this process and the web server meant 40 x 403, which reads as forty dropped
// jobs rather than as a configuration error.
//
// Sessions are rows now, so there is no shared secret to get wrong — this process INSERTs and the
// web server SELECTs. The equivalent mistake is pointing at a different DATABASE_URL, and
// parseServerEnv already requires that.

// --- the burst -------------------------------------------------------------

/**
 * Mint a real session row per synthetic competitor.
 *
 * Async now that sessions live in Postgres. This is a real cost G8 should carry rather than
 * bypass: the night's 40 students each have a session row and every request they make does the
 * same lookup, so a load test that faked its way past that would be measuring a different
 * system than the one being shipped.
 */
async function cookieFor(
  seeded: SeededContest,
  participantId: string,
  displayName: string,
): Promise<string> {
  const session = await issueSession(
    {
      role: "COMPETITOR",
      method: "JOIN_CODE",
      participantId,
      contestId: seeded.contestId,
      displayName,
    },
    new Date(),
  );
  return `${SESSION_COOKIE}=${session.token}`;
}

const SubmissionEnvelope = apiResponseSchema(SubmissionViewSchema);

async function submitAndWait(
  index: number,
  participant: string,
  cookie: string,
  contestProblemId: string,
  sourceCode: string,
  deadline: number,
): Promise<Sample> {
  const startedAt = Date.now();
  let submissionId: string;
  let enqueueMs: number | null = null;

  try {
    const response = await fetch(`${BASE_URL}/api/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ contestProblemId, language: "PYTHON_312", sourceCode }),
    });
    enqueueMs = Date.now() - startedAt;

    const parsed = SubmissionEnvelope.safeParse(await response.json());
    if (!parsed.success) {
      return {
        index,
        participant,
        submissionId: null,
        latencyMs: null,
        enqueueMs,
        verdict: null,
        error: `POST /api/submissions returned ${response.status} with an unreadable body`,
      };
    }
    if (!parsed.data.success) {
      return {
        index,
        participant,
        submissionId: null,
        latencyMs: null,
        enqueueMs,
        verdict: null,
        error: `POST /api/submissions refused: ${parsed.data.error.code} — ${parsed.data.error.message}`,
      };
    }
    submissionId = parsed.data.data.submissionId;
  } catch (error: unknown) {
    return {
      index,
      participant,
      submissionId: null,
      latencyMs: null,
      enqueueMs,
      verdict: null,
      error: `POST /api/submissions threw: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  while (Date.now() < deadline) {
    await sleep(POLL_MS);

    try {
      const response = await fetch(`${BASE_URL}/api/submissions/${submissionId}`, {
        headers: { accept: "application/json", cookie },
      });
      const parsed = SubmissionEnvelope.safeParse(await response.json());
      if (!parsed.success || !parsed.data.success) continue;

      const view = parsed.data.data;
      if (view.verdict !== null) {
        return {
          index,
          participant,
          submissionId,
          latencyMs: Date.now() - startedAt,
          enqueueMs,
          verdict: view.verdict,
          error: null,
        };
      }
    } catch {
      // One failed poll is not a dropped job. Keep asking until the deadline.
    }
  }

  return {
    index,
    participant,
    submissionId,
    latencyMs: null,
    enqueueMs,
    verdict: null,
    error: `no verdict within ${OVERALL_DEADLINE_MS} ms`,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- main ------------------------------------------------------------------

async function main(): Promise<void> {
  const env = parseServerEnv();

  console.log(`G8 load — ${TARGET_CONCURRENT_SUBMISSIONS} concurrent submissions`);
  console.log(`  web server        : ${BASE_URL}`);
  console.log(`  queue             : ${env.REDIS_URL}`);
  console.log(`  p95 budget        : ${P95_LATENCY_BUDGET_MS} ms`);
  console.log(`  poll interval     : ${POLL_MS} ms (adds up to this much error, upward)`);

  await assertWebServerUp();

  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue(JUDGE_QUEUE_NAME, { connection });

  let exitCode = 0;
  try {
    const workerCount = await assertWorkerListening(queue);
    console.log(`  judge workers     : ${workerCount} (concurrency ${env.JUDGE_CONCURRENCY} each)`);

    const before = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
    console.log(`  queue before      : ${JSON.stringify(before)}`);

    // --- seed -------------------------------------------------------------
    const names = Array.from(
      { length: TARGET_CONCURRENT_SUBMISSIONS },
      (_unused, index) => `Load ${String(index + 1).padStart(2, "0")}`,
    );
    const seeded = await seedE2EContest({
      extraParticipants: names.map((displayName) => ({ displayName, divisionKey: DIVISION_KEY })),
    });
    const problem = liveProblem(seeded);

    // Pin every synthetic competitor onto the set that HOLDS this problem.
    //
    // Sets are randomly assigned, so without this the guard correctly refuses most of the burst and
    // G8 reports "40 of 40 never accepted" — which is a broken measurement, not a latency result. It
    // did exactly that on the first run after sets landed.
    //
    // This is setup, not a shortcut: on the night every student submits to a problem in their own
    // set, so pinning reproduces the real condition rather than bypassing a check. Set visibility is
    // gated by G7 (tests/e2e/team-scoring.api.spec.ts), not by G8.
    await Promise.all(
      names.map((participant) => {
        const participantId = seeded.rivalIds.get(participant);
        if (participantId === undefined) throw new Error(`participant ${participant} was not seeded`);
        return pinParticipantToProblemSet(participantId, problem.contestProblemId);
      }),
    );
    const sourceCode = readFileSync(
      path.join(repoRoot(), "fixtures", "load", "burst-solution.py"),
      "utf8",
    );

    console.log(`  contest           : ${seeded.contestId}`);
    console.log(`  problem           : ${problem.slug} (${problem.contestProblemId})`);
    console.log("");

    // --- sessions, minted BEFORE the clock starts --------------------------
    // Sessions live in Postgres now, so minting 40 of them is 40 INSERTs. On the night those
    // happen minutes earlier as students join, so charging them to verdict latency would
    // measure a burst that never happens. What G8 must carry is the per-request session
    // LOOKUP, and it does — every request below goes through it.
    const cookies = await Promise.all(
      names.map((participant) => {
        const participantId = seeded.rivalIds.get(participant);
        if (participantId === undefined) throw new Error(`participant ${participant} was not seeded`);
        return cookieFor(seeded, participantId, participant);
      }),
    );

    // --- burst ------------------------------------------------------------
    const deadline = Date.now() + OVERALL_DEADLINE_MS;
    const startedAt = Date.now();

    const samples = await Promise.all(
      names.map((participant, index) => {
        const cookie = cookies[index];
        if (cookie === undefined) throw new Error(`no session minted for ${participant}`);
        return submitAndWait(
          index,
          participant,
          cookie,
          problem.contestProblemId,
          sourceCode,
          deadline,
        );
      }),
    );

    const wallMs = Date.now() - startedAt;
    const after = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");

    // --- report -----------------------------------------------------------
    const accepted = samples.filter((sample) => sample.submissionId !== null);
    const rejected = samples.filter((sample) => sample.submissionId === null);
    const withVerdict = samples.filter((sample) => sample.latencyMs !== null);
    const dropped = accepted.length - withVerdict.length;
    const internalErrors = samples.filter((sample) => sample.verdict === "IE");

    const latencies = withVerdict
      .map((sample) => sample.latencyMs ?? 0)
      .toSorted((a, b) => a - b);
    const enqueues = samples
      .map((sample) => sample.enqueueMs)
      .filter((value): value is number => value !== null)
      .toSorted((a, b) => a - b);

    const byVerdict = new Map<string, number>();
    for (const sample of samples) {
      const key = sample.verdict ?? "(none)";
      byVerdict.set(key, (byVerdict.get(key) ?? 0) + 1);
    }

    console.log("verdict latency distribution (POST sent -> verdict observed)");
    console.log(histogram(latencies));
    console.log("");
    console.log(`  samples           : ${latencies.length} of ${TARGET_CONCURRENT_SUBMISSIONS}`);
    if (latencies.length > 0) {
      console.log(`  min               : ${latencies[0]} ms`);
      console.log(`  p50               : ${percentile(latencies, 0.5)} ms`);
      console.log(`  p90               : ${percentile(latencies, 0.9)} ms`);
      console.log(`  p95               : ${percentile(latencies, 0.95)} ms`);
      console.log(`  p99               : ${percentile(latencies, 0.99)} ms`);
      console.log(`  max               : ${latencies[latencies.length - 1]} ms`);
    }
    if (enqueues.length > 0) {
      console.log(`  enqueue p95       : ${percentile(enqueues, 0.95)} ms (POST round trip alone)`);
    }
    console.log(`  burst wall time   : ${wallMs} ms`);
    console.log(`  queue after       : ${JSON.stringify(after)}`);
    console.log(
      `  verdicts          : ${[...byVerdict.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`,
    );
    console.log("");

    for (const sample of rejected) {
      console.log(`  REJECTED   ${sample.participant}: ${sample.error}`);
    }
    for (const sample of samples) {
      if (sample.submissionId !== null && sample.latencyMs === null) {
        console.log(`  NO VERDICT ${sample.participant} (${sample.submissionId}): ${sample.error}`);
      }
    }

    // --- the gate ---------------------------------------------------------
    const failures: string[] = [];

    if (accepted.length !== TARGET_CONCURRENT_SUBMISSIONS) {
      failures.push(
        `${rejected.length} of ${TARGET_CONCURRENT_SUBMISSIONS} submissions were never accepted`,
      );
    }
    if (dropped !== 0) {
      failures.push(`${dropped} accepted submission(s) never produced a verdict — dropped jobs`);
    }
    const failedBefore = before.failed ?? 0;
    const failedAfter = after.failed ?? 0;
    if (failedAfter > failedBefore) {
      failures.push(
        `the queue's failed count rose ${failedBefore} -> ${failedAfter}; a job exhausted its retries`,
      );
    }
    if (internalErrors.length > 0) {
      failures.push(`${internalErrors.length} submission(s) came back IE`);
    }

    const p95 = percentile(latencies, 0.95);
    if (latencies.length === 0) {
      failures.push("no verdict latency was measured at all");
    } else if (p95 >= P95_LATENCY_BUDGET_MS) {
      failures.push(`p95 verdict latency ${p95} ms is not under ${P95_LATENCY_BUDGET_MS} ms`);
    }

    if (failures.length > 0) {
      console.error("G8 FAILED:");
      for (const failure of failures) console.error(`  - ${failure}`);
      exitCode = 1;
    } else {
      console.log(
        `G8 PASSED: ${TARGET_CONCURRENT_SUBMISSIONS} concurrent submissions, 0 dropped, 0 IE, ` +
          `p95 ${p95} ms < ${P95_LATENCY_BUDGET_MS} ms`,
      );
    }
  } finally {
    await queue.close();
    await connection.quit();
    await closeTestDb();
  }

  process.exit(exitCode);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
