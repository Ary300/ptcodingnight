import { CONTEST_OVER_MESSAGE } from "@/lib/contest/gate";
import type { PublicTestResult } from "@/lib/schemas/api";
import type { Verdict } from "@/lib/schemas/judge";

import { VERDICT_DISPLAY } from "../verdict/verdict-display";

/**
 * The one line the Results drawer shows in its header, open or collapsed.
 *
 * A collapsed drawer still has to answer "did it work?", the way HackerRank's Test Results bar
 * does, so the header carries the outcome in words and a student only opens the drawer for the
 * detail. Pure, so every state is a unit test.
 */

export interface ResultsSummaryInput {
  readonly action: "samples" | "judged" | null;
  readonly error: string | null;
  readonly sampleBusy: boolean;
  readonly sampleResults: readonly PublicTestResult[];
  /** The compiler's output when the last sample run did not compile. Absent means it compiled. */
  readonly sampleCompileError?: string | null;
  readonly submitBusy: boolean;
  readonly judging: boolean;
  readonly verdict: Verdict | null;
  /** The contest window has closed, so a refused press was refused for that reason. */
  readonly windowClosed?: boolean;
}

/** The header when a press was refused because the contest window has closed. */
export const SUBMISSIONS_CLOSED_SUMMARY = "Submissions are closed";

/** `null` before anything has run: the header then reads "Results" and nothing else. */
export function resultsSummary(input: ResultsSummaryInput): string | null {
  if (input.error !== null) {
    // A late press is not the student's code failing, so it does not read "Did not finish".
    if (input.windowClosed === true || input.error === CONTEST_OVER_MESSAGE) {
      return SUBMISSIONS_CLOSED_SUMMARY;
    }
    return "Did not finish";
  }
  if (input.action === "samples") {
    if (input.sampleBusy) return "Running samples";
    if (input.sampleCompileError !== undefined && input.sampleCompileError !== null) {
      return VERDICT_DISPLAY.CE.label;
    }
    const total = input.sampleResults.length;
    if (total === 0) return "No samples ran";
    const passed = input.sampleResults.filter((row) => row.verdict === "AC").length;
    return `${String(passed)} of ${String(total)} samples passed`;
  }
  if (input.action === "judged") {
    if (input.submitBusy) return "Submitting";
    if (input.judging || input.verdict === null) return "Judging";
    return VERDICT_DISPLAY[input.verdict].label;
  }
  return null;
}
