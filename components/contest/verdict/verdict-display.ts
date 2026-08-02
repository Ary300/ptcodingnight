import type { QueuePosition } from "@/lib/schemas/api";
import type { Verdict } from "@/lib/schemas/judge";

/**
 * How a verdict is worded and coloured for a student.
 *
 * Three rules are baked in here so no surface can get them individually wrong:
 *
 *  1. **`IE` is never shown as a failure** (CLAUDE.md, PRD §7.2). An internal error means we
 *     do not know whether the submission was right, so telling a student their code failed
 *     is simply false — and it is false at the worst possible moment. It reads as the
 *     platform's problem, because it is.
 *  2. **Every verdict has a word, not just a colour.** `--rise` and `--fall` differ in
 *     luminance by a factor of 1.04 (docs/DESIGN.md §3).
 *  3. **These colours are dark-surface only.** Gold, rise and fall all fail AA on `--paper`,
 *     which is why the verdict panel brings its own `--ink` background rather than sitting
 *     on the page.
 */

export type VerdictTone = "pass" | "fail" | "compile" | "internal";

export interface VerdictPresentation {
  /** The short chip. */
  label: string;
  /** A sentence a fifteen-year-old can act on. */
  detail: string;
  tone: VerdictTone;
}

export const VERDICT_DISPLAY: Readonly<Record<Verdict, VerdictPresentation>> = {
  AC: { label: "Accepted", detail: "Every test passed.", tone: "pass" },
  WA: { label: "Wrong answer", detail: "It ran, but the output did not match.", tone: "fail" },
  TLE: { label: "Too slow", detail: "It ran past the time limit. Look for a faster approach.", tone: "fail" },
  MLE: { label: "Out of memory", detail: "It used more memory than the limit allows.", tone: "fail" },
  RE: { label: "Runtime error", detail: "It crashed while running. Check indexes and input parsing.", tone: "fail" },
  CE: { label: "Did not compile", detail: "The compiler output is below.", tone: "compile" },
  IE: {
    label: "Rechecking",
    detail: "Something went wrong on our side, not in your code. It is being run again, and an organizer has been alerted.",
    tone: "internal",
  },
};

/** On `--ink` only. See the measured table in docs/DESIGN.md §2. */
export const TONE_COLOR: Readonly<Record<VerdictTone, string>> = {
  pass: "var(--color-rise)",
  fail: "var(--color-fall)",
  compile: "var(--color-gold)",
  internal: "var(--color-gold)",
};

/** A student's problem status, worded the way PRD §9.1 asks for it. */
export function problemStatusLabel(solved: boolean, bestScore: number | null): string {
  if (solved) return "Solved";
  if (bestScore !== null && bestScore > 0) return `Partial: ${bestScore} pts`;
  if (bestScore !== null) return "Attempted";
  return "Unsolved";
}

/**
 * Where an unjudged submission stands, in words a waiting student can act on.
 *
 * The same honesty rules as `judgingProgressLabel`: the count is a fact the server read from
 * the queue a moment ago, so it is stated plainly, and no time estimate is attached because a
 * queue of 3 can be 15 seconds of Python or 4 minutes of Go compiles. The field this renders
 * is optional on the wire; when the server could not ask the queue, the panel says nothing
 * rather than something invented, and this function is simply not called.
 *
 * "offline" is the one state that is not a position at all: zero live worker heartbeats, so
 * any number here would be a queue position that never moves — the worst possible display,
 * because it looks like working. The student is told the truth and, more importantly, that
 * their work is safe and needs nothing from them.
 */
export function queuePositionLabel(position: QueuePosition): string {
  if (position.state === "offline") {
    return "The judge is offline. An organizer has been told; your submission is saved and will be judged when it returns.";
  }
  if (position.state === "active") return "The judge is working on yours now.";
  if (position.ahead === 0) return "Yours is next in the queue.";
  if (position.ahead === 1) return "1 submission ahead of yours in the queue.";
  return `${position.ahead} submissions ahead of yours in the queue.`;
}

/**
 * What the header says while the judge is still running.
 *
 * Two honesty rules shape the wording:
 *
 *  1. **Counts, never names.** Samples and hidden tests number themselves independently
 *     (`PublicTestResult.ordinal` restarts per kind), so "running test 4" cannot safely claim
 *     to be the row that will appear as "Test case 4". A count of finished results is a fact
 *     we hold; a name for the case still inside the judge is a guess. HackerRank shows the
 *     same thing for the same reason: a position in the queue, not an identity.
 *  2. **Say what is known, not what is hoped.** With no total we report only how many results
 *     are back. With a total we can say which position is executing and how many wait behind
 *     it, and when the count reaches the total but no verdict has landed, the true state is
 *     "aggregating", not "running", so that is what it says.
 *
 * `completedCases` is the number of results already returned; the case executing now is the
 * next one after those.
 */
export function judgingProgressLabel(
  completedCases: number,
  totalCases: number | null,
): string {
  if (totalCases !== null && completedCases >= totalCases) {
    return "All tests have run. Working out the verdict…";
  }
  if (totalCases === null) {
    if (completedCases === 0) return "Judging: running the first test…";
    return `Judging: ${completedCases} ${completedCases === 1 ? "test" : "tests"} finished, running the next…`;
  }
  const running = completedCases + 1;
  const remaining = totalCases - running;
  return `Running test ${running} of ${totalCases}, ${remaining} still to go…`;
}
