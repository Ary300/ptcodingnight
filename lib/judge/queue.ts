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

/**
 * Two lanes, and which one a job joins.
 *
 * ## The problem
 *
 * "Run samples" is two unscored tests that a student is waiting on with the request held open.
 * It used to join the same FIFO as submissions, so during the end-of-contest rush it sat behind
 * every queued submission and timed out as "The judge is busy" — at exactly the moment students
 * most want to check their code before submitting.
 *
 * ## How BullMQ 5 orders jobs (read from the installed `moveToActive` script, not assumed)
 *
 * A job added WITHOUT a priority goes to the `wait` list; a job WITH one goes to the `prioritized`
 * sorted set, scored `priority * 2^32 + counter`. A worker takes from `wait` first and from
 * `prioritized` only when `wait` is empty; within `prioritized` the lower score wins, so jobs of
 * one priority come out in the order they were added. The EXPRESS lane is therefore "no priority"
 * and the ordinary lane is a priority — the opposite of what the option's name suggests.
 *
 * Submissions carry `SUBMISSION_PRIORITY` and stay FIFO among themselves; sample runs carry none
 * and go first. Job ids are unchanged, so `enqueueJudgeJob`'s idempotency (a re-add of an existing
 * id is dropped) holds in both lanes, and a rejudge still has to `removeJob` first.
 *
 * ## Why submissions cannot starve
 *
 * Express is not unconditional. Sample runs are rate-limited per student, but a whole room
 * pressing Run faster than the judge drains would keep the `wait` list non-empty for good, and the
 * submissions behind it — the ones that score — would never run. So once the oldest queued
 * ordinary job has waited `EXPRESS_LANE_MAX_SUBMISSION_WAIT_MS`, new sample runs join the ordinary
 * lane BEHIND it. A submission can then be overtaken only by what was already in the express lane.
 */
export const SUBMISSION_PRIORITY = 1;

/**
 * How long the oldest submission may wait before sample runs stop overtaking it.
 *
 * Above the 30 s the night's whole rush should drain in, so on a healthy night it never trips and
 * every sample run is express. It exists for the pathological case.
 */
export const EXPRESS_LANE_MAX_SUBMISSION_WAIT_MS = 60_000;

export type JudgeLane = "express" | "ordinary";

/**
 * Which lane a sample run joins. Pure: the caller reads the oldest queued ordinary job's enqueue
 * time (null when none is queued) and the clock.
 */
export function sampleRunLane(input: {
  readonly oldestOrdinaryEnqueuedAtMs: number | null;
  readonly nowMs: number;
}): JudgeLane {
  if (input.oldestOrdinaryEnqueuedAtMs === null) return "express";
  const waitedMs = input.nowMs - input.oldestOrdinaryEnqueuedAtMs;
  return waitedMs >= EXPRESS_LANE_MAX_SUBMISSION_WAIT_MS ? "ordinary" : "express";
}

/** The BullMQ add options for a lane. Express is the ABSENCE of a priority (see above). */
export function laneJobOptions(lane: JudgeLane): { readonly priority?: number } {
  return lane === "express" ? {} : { priority: SUBMISSION_PRIORITY };
}

/**
 * How many jobs a worker takes before a job in the ORDINARY lane: every express job first
 * (`waitLength`), then every ordinary job with a lower score (`ZRANK` in `prioritized`).
 * `null` when the job is not in the set.
 */
export function jobsAheadInOrdinaryLane(waitLength: number, rank: number | null): number | null {
  if (rank === null) return null;
  return waitLength + rank;
}
