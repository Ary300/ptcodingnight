import { Queue, type Job } from "bullmq";
import IORedis from "ioredis";

import { countLiveWorkers } from "@/lib/judge/heartbeat";
import {
  JUDGE_JOB_OPTIONS,
  JUDGE_QUEUE_NAME,
  jobsAheadInOrdinaryLane,
  laneJobOptions,
  sampleRunLane,
} from "@/lib/judge/queue";
import type { QueuePosition } from "@/lib/schemas/api";
import { JudgeResultSchema, type JudgeJob, type JudgeResult } from "@/lib/schemas/judge";
import { DomainError } from "@/lib/errors";
import { parseServerEnv } from "@/lib/schemas/env";

/**
 * The web side of the judge queue.
 *
 * `POST /api/submissions` puts a job here and returns. It does not judge, wait, or touch a
 * container: untrusted code never runs in the web process (docs/PRD.md §7). The worker is the
 * only consumer, and both sides import the queue name from `lib/judge/queue.ts` so a rename
 * cannot split them into two queues that never talk.
 */

let queue: Queue | null = null;

export function judgeQueue(): Queue {
  if (queue !== null) return queue;

  const env = parseServerEnv();
  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  queue = new Queue(JUDGE_QUEUE_NAME, { connection, defaultJobOptions: JUDGE_JOB_OPTIONS });
  return queue;
}

/**
 * Enqueue, using the submission id as the job id.
 *
 * That makes the enqueue idempotent: a double-submitted form or a retried request produces one
 * job, not two, because BullMQ refuses a duplicate id rather than judging the same submission
 * twice and charging the student for both.
 */
export async function enqueueJudgeJob(job: JudgeJob): Promise<void> {
  // The ordinary lane: FIFO among submissions, behind any express sample run. See
  // `lib/judge/queue.ts` for why "ordinary" is the lane WITH a priority.
  await judgeQueue().add(JUDGE_QUEUE_NAME, job, {
    jobId: job.submissionId,
    ...laneJobOptions("ordinary"),
  });
}

/**
 * When the oldest job in the ordinary lane was enqueued, or null if the lane is empty.
 *
 * Read as one ZRANGE and one HGET rather than through `getJobs`, because a job hash carries the
 * student's whole source; hydrating it to read one timestamp would make every sample run pay for it.
 */
async function oldestOrdinaryEnqueuedAtMs(queue: Queue): Promise<number | null> {
  const client = await queue.client;
  const [oldestId] = await client.zrange(queue.toKey("prioritized"), 0, 0);
  if (oldestId === undefined) return null;
  const raw = await client.hget(queue.toKey(oldestId), "timestamp");
  const timestamp = Number(raw);
  return raw === null || !Number.isFinite(timestamp) ? null : timestamp;
}

export async function removeJob(jobId: string): Promise<void> {
  const job = await judgeQueue().getJob(jobId);
  await job?.remove();
}

export type JobOutcome =
  | { readonly status: "missing" }
  | { readonly status: "pending" }
  | { readonly status: "completed"; readonly result: JudgeResult }
  /** Every attempt used up. `IE` is never shown to a student as a failure (PRD §7.2). */
  | { readonly status: "failed"; readonly message: string };

export async function jobOutcome(jobId: string): Promise<JobOutcome> {
  const job = await judgeQueue().getJob(jobId);
  if (job === undefined) return { status: "missing" };
  return outcomeOf(job);
}

/**
 * Which of these jobs are worth a `reconcile` right now, in ONE Redis round trip.
 *
 * `reconcile` costs a database read plus two Redis calls per submission, and a burst leaves fifty
 * or so submissions pending at once. Asking each of them every second is most of what the verdict
 * stream cost the database. A job whose hash has no `finishedOn` is still queued or running and
 * `reconcile` would do nothing with it, so only two kinds come back:
 *
 * - **finished** (`finishedOn` set): completed or out of attempts. `reconcile` reads the outcome,
 *   including the moment where the state says completed and the return value has not landed yet,
 *   which it already treats as "keep waiting".
 * - **gone** (no hash at all): evicted or lost. `reconcile` owns the orphan rule and its grace
 *   period, so it decides.
 *
 * Read with HMGET on the job's own key, the layout `oldestOrdinaryEnqueuedAtMs` already relies on.
 * Any error for a key, or for the whole pipeline, counts that job as ready: the fallback is the
 * call the stream used to make every tick anyway, so a Redis hiccup costs queries, never a verdict.
 */
export async function jobsReadyToReconcile(
  jobIds: readonly string[],
): Promise<ReadonlySet<string>> {
  if (jobIds.length === 0) return new Set();
  try {
    const queue = judgeQueue();
    const client = await queue.client;
    // Issued together on one connection, so ioredis writes them back to back and the replies
    // come back in one round trip. `null` stands for a failed read: ready, see above.
    const replies = await Promise.all(
      jobIds.map((jobId) =>
        client
          .hmget(queue.toKey(jobId), "finishedOn", "timestamp")
          .catch((): null => null),
      ),
    );

    const ready = new Set<string>();
    jobIds.forEach((jobId, index) => {
      const reply = replies[index] ?? null;
      if (reply === null) {
        ready.add(jobId);
        return;
      }
      const [finishedOn, timestamp] = reply;
      if (finishedOn !== null || timestamp === null) ready.add(jobId);
    });
    return ready;
  } catch {
    return new Set(jobIds);
  }
}

async function outcomeOf(job: Job): Promise<JobOutcome> {
  const state = await job.getState();

  if (state === "completed") {
    // ABSENT is not the same as MALFORMED, and conflating them cost five correct submissions.
    //
    // BullMQ flips a job to "completed" and stores its return value in two steps, so there is
    // a window where the state says completed and `returnvalue` is still null. Treating that
    // as a contract mismatch reported a judge failure, which `reconcile` persisted as `IE` —
    // and because the verdict write is guarded on `verdict: null`, the real `AC` that arrived
    // moments later was refused. G8 hit this window 5 times in 40 submissions while the worker
    // logged 40 clean ACs.
    //
    // Nothing there yet means keep waiting. Only a value that IS present and does not parse
    // means the worker and the web process genuinely disagree about the contract.
    if (job.returnvalue === null || job.returnvalue === undefined) {
      return { status: "pending" };
    }

    const parsed = JudgeResultSchema.safeParse(job.returnvalue);
    if (!parsed.success) {
      // The worker and the web process disagree about the result contract. Guessing at the
      // difference is how a submission gets the wrong verdict, so treat it as a judge failure.
      return { status: "failed", message: "Judge returned a result this build cannot read" };
    }
    return { status: "completed", result: parsed.data };
  }

  if (state === "failed") {
    return { status: "failed", message: job.failedReason ?? "The judge could not run this" };
  }

  return { status: "pending" };
}

/**
 * How many jobs will be taken before `jobId`, given the raw wait list left to right.
 *
 * BullMQ adds a FIFO job with LPUSH and the worker consumes from the right, so LRANGE reads
 * newest to oldest and everything to the RIGHT of a job runs first. That direction is verified
 * empirically against bullmq 5.x rather than assumed: a probe enqueued first/second/third and
 * LRANGE returned ["third", "second", "first"]. If a BullMQ upgrade ever flips it, the unit
 * test on this function is the tripwire.
 *
 * `null` for a job not in the list: the caller knows more about why than this function does.
 */
export function jobsAheadInWaitList(ids: readonly string[], jobId: string): number | null {
  const index = ids.indexOf(jobId);
  if (index === -1) return null;
  return ids.length - 1 - index;
}

/**
 * The offline override: with zero live worker heartbeats, every position is a lie.
 *
 * A queue position that never moves is the WORST display, because it looks like working —
 * "3 ahead of yours" invites a student to wait politely on a queue nothing is draining. So a
 * positive "no worker is alive" outranks any position, including "active": a job left active
 * by a worker that died mid-judge is exactly the case where "the judge is working on yours"
 * would be the most convincing false thing on the screen.
 *
 * `null` (the count could not be read) claims nothing and lets the ordinary position stand:
 * an unknown must never render as the loudest possible state.
 *
 * Pure and exported for the precedence test; `queuePositionOf` is the only production caller.
 */
export function offlineQueuePosition(workerCount: number | null): QueuePosition | null {
  if (workerCount === 0) return { state: "offline", ahead: 0 };
  return null;
}

/**
 * Where a submission's job stands, as the waiting student may be told.
 *
 * Best-effort by contract: every failure path returns `null`, which the read path turns into
 * an OMITTED field. A slow submission must look slow, never broken - and a position read that
 * could throw would break the verdict read it decorates, which is the one read that matters.
 * That contract covers the heartbeat read too: it degrades to "no claim" on its own, inside
 * the same try, so it can never break the verdict read it rides on.
 *
 * The wait list is read as raw ids with LRANGE rather than through `getJobs`, because a judge
 * job's payload carries the student's full source code and test paths; hydrating every queued
 * job to learn one index would make the cheapest read on this screen the heaviest.
 */
export async function queuePositionOf(jobId: string): Promise<QueuePosition | null> {
  try {
    const queue = judgeQueue();

    // Degrades separately from the position read: `null` means "could not ask", and the
    // ordinary position (or silence) stands. Only a POSITIVE zero flips the display.
    const workerCount = await countLiveWorkers(await queue.client).catch(() => null);
    const offline = offlineQueuePosition(workerCount);
    if (offline !== null) return offline;

    const job = await queue.getJob(jobId);
    if (job === undefined) return null;

    const state = await job.getState();
    if (state === "active") return { state: "active", ahead: 0 };

    const client = await queue.client;

    // A submission waits in the ORDINARY lane (`prioritized`): ahead of it are every express job
    // and every ordinary job enqueued before it.
    if (state === "prioritized") {
      // Ids only, in score order — the same reasoning as the LRANGE below. BullMQ's client
      // interface has no ZRANK, and a night's queue is tens of ids.
      const [waitLength, ordinaryIds] = await Promise.all([
        client.llen(queue.toKey("wait")),
        client.zrange(queue.toKey("prioritized"), 0, -1),
      ]);
      const rank = ordinaryIds.indexOf(jobId);
      const aheadInLane = jobsAheadInOrdinaryLane(waitLength, rank === -1 ? null : rank);
      // Gone from the set between the two reads means a worker took it: progress, not absence.
      if (aheadInLane === null) return { state: "active", ahead: 0 };
      return { state: "waiting", ahead: aheadInLane };
    }

    // Delayed (the one IE retry, on its 2s backoff) and every terminal state: no claim. A
    // "position" for a job that is not plainly waiting would be a guess wearing a number.
    if (state !== "waiting") return null;

    const ids = await client.lrange(queue.toKey("wait"), 0, -1);
    const ahead = jobsAheadInWaitList(ids, jobId);
    // Gone from the list between the two reads means a worker took it: progress, not absence.
    if (ahead === null) return { state: "active", ahead: 0 };
    return { state: "waiting", ahead };
  } catch {
    return null;
  }
}

/** Poll interval while waiting on a "run samples" job. Short: the student is watching. */
const SAMPLE_POLL_MS = 200;

/**
 * Run a job to completion and return its result. Used only by "run samples", which is
 * synchronous from the student's point of view and persists nothing.
 *
 * The job is removed afterwards either way, so a night of sample runs does not accumulate in
 * Redis alongside the submissions that matter.
 */
export async function runJobAndWait(job: JudgeJob, timeoutMs: number): Promise<JudgeResult> {
  const jobId = job.submissionId;
  const queue = judgeQueue();
  // Express unless the oldest submission has waited too long — see `sampleRunLane`. A failed read
  // of the lane's head falls back to express: the bound it enforces is a backstop for a
  // pathological flood, and a Redis hiccup is not one.
  const lane = sampleRunLane({
    oldestOrdinaryEnqueuedAtMs: await oldestOrdinaryEnqueuedAtMs(queue).catch(() => null),
    nowMs: Date.now(),
  });
  await queue.add(JUDGE_QUEUE_NAME, job, { jobId, attempts: 1, ...laneJobOptions(lane) });

  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const outcome = await jobOutcome(jobId);
      if (outcome.status === "completed") return outcome.result;
      if (outcome.status === "failed") {
        throw new DomainError("INTERNAL", "The judge could not run your examples. Try again.");
      }
      if (outcome.status === "missing") {
        throw new DomainError("INTERNAL", "The judge lost that run. Try again.");
      }
      await sleep(SAMPLE_POLL_MS);
    }
    throw new DomainError("INTERNAL", "The judge is busy right now. Try again in a moment.");
  } finally {
    await removeJob(jobId).catch(() => {
      // Cleanup only. A sample job left behind is swept by `removeOnComplete`, and failing the
      // student's request because tidying failed would be the wrong trade.
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
