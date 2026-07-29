/**
 * Queue contract shared by the enqueuer (the submissions API) and the consumer (the judge
 * worker). Both sides import these names so a rename cannot silently split them into two
 * queues that never talk.
 */

export const JUDGE_QUEUE_NAME = "judge";

/**
 * `IE` is retried exactly once and then paged to an admin (docs/PRD.md §7.2), so BullMQ is
 * allowed two attempts total. Beyond that a retry loop would hide a systemic fault behind
 * an ever-growing queue.
 */
export const MAX_JOB_ATTEMPTS = 2;

export const JUDGE_JOB_OPTIONS = {
  attempts: MAX_JOB_ATTEMPTS,
  backoff: { type: "fixed" as const, delay: 2_000 },
  // Keep recent history for the admin live console; drop the rest so Redis does not grow
  // without bound over a contest night.
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 500 },
} as const;

/** The queue never loses a job (PRD §7.3): a worker crash mid-judge must retry, not drop. */
export const STALLED_JOB_GRACE_MS = 120_000;
