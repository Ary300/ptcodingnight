import type { Verdict } from "@/lib/schemas/judge";

/**
 * What counts as a rejection, and what counts at all.
 *
 * PRD §6.1 charges "5 minutes per rejected submission" without defining rejected, so it is
 * pinned here in one place rather than being re-decided at each call site.
 */

/**
 * A rejection is any judged verdict other than `AC`, `CE` and `IE`: that is `WA`, `TLE`, `MLE`
 * and `RE`. A `WA` that earned partial points is still a rejection — the verdict decides, not the
 * score. Whether a rejection actually COSTS anything depends on when it was sent; that is the
 * caller's business (see `scoreClassic` in `lib/scoring/index.ts` and docs/SCORING.md §5.1).
 *
 * `IE` is excluded, and that exclusion is not a detail. An internal error means the judge
 * failed — we do not actually know whether the submission was correct. Charging a student
 * five minutes for our own infrastructure fault would contradict PRD §7.2, which says `IE`
 * is never surfaced as a student-facing failure. It is requeued once and paged to an admin.
 *
 * `CE` is excluded too, by the organizer's decision of 2026-11-17. A program that never compiled
 * never ran against a single test, so it is not a wrong attempt at the problem. It applies to
 * both presets, which is also how ICPC itself treats a compilation error.
 */
export function isRejection(verdict: Verdict): boolean {
  return verdict !== "AC" && verdict !== "CE" && verdict !== "IE";
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
