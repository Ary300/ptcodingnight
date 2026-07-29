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
    detail: "Something went wrong on our side, not in your code. It is being run again — an organizer has been alerted.",
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
  if (bestScore !== null && bestScore > 0) return `Partial — ${bestScore} pts`;
  if (bestScore !== null) return "Attempted";
  return "Unsolved";
}
