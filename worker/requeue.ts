import { MAX_JOB_ATTEMPTS } from "@/lib/judge/queue";
import type { Verdict } from "@/lib/schemas/judge";

/**
 * Whether a finished judge hands its job back to the queue instead of recording the result.
 *
 * Only IE, and only before the last attempt: IE is the judge's fault, so it gets its one retry
 * (PRD §7.2), and on the final attempt it is recorded for an admin rather than retried forever.
 * Every student verdict, CE included, is recorded the first time, so a compile bomb's CE is never
 * compiled twice on purpose.
 *
 * `attempt` is 1-based: BullMQ's `attemptsMade + 1`.
 */
export function requeuesAfter(verdict: Verdict, attempt: number): boolean {
  return verdict === "IE" && attempt < MAX_JOB_ATTEMPTS;
}
