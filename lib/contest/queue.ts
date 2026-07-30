import { Queue, type Job } from "bullmq";
import IORedis from "ioredis";

import { JUDGE_JOB_OPTIONS, JUDGE_QUEUE_NAME } from "@/lib/judge/queue";
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
  await judgeQueue().add(JUDGE_QUEUE_NAME, job, { jobId: job.submissionId });
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
  await judgeQueue().add(JUDGE_QUEUE_NAME, job, { jobId, attempts: 1 });

  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const outcome = await jobOutcome(jobId);
      if (outcome.status === "completed") return outcome.result;
      if (outcome.status === "failed") {
        throw new DomainError("INTERNAL", "The judge could not run your samples. Try again.");
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
