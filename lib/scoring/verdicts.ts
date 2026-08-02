import type { Verdict } from "@/lib/schemas/judge";

/**
 * What counts as a rejection, and what counts at all.
 *
 * PRD §6.1 charges "5 minutes per rejected submission" without defining rejected, so it is
 * pinned here in one place rather than being re-decided at each call site.
 */

/**
 * A rejection is any judged verdict that is not `AC`.
 *
 * `IE` is excluded, and that exclusion is not a detail. An internal error means the judge
 * failed — we do not actually know whether the submission was correct. Charging a student
 * five minutes for our own infrastructure fault would contradict PRD §7.2, which says `IE`
 * is never surfaced as a student-facing failure. It is requeued once and paged to an admin.
 *
 * `CE` *does* count. A submission that does not compile is a failed attempt like any other,
 * and the student can compile locally before submitting.
 */
export function isRejection(verdict: Verdict): boolean {
  return verdict !== "AC" && verdict !== "IE";
}

/**
 * Whether a submission carries usable information at all.
 *
 * `IE` submissions are dropped entirely — they contribute no score, no penalty, and cannot
 * set a "last score increase" time. Once the job is requeued the retry is the record.
 */
export function isScorable(verdict: Verdict | null): verdict is Verdict {
  return verdict !== null && verdict !== "IE";
}

/** ICPC treats a problem as solved only on a full `AC` (PRD §6.2). */
export function isAccepted(verdict: Verdict): boolean {
  return verdict === "AC";
}
