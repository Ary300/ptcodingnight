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
}

/** `null` before anything has run: the header then reads "Results" and nothing else. */
export function resultsSummary(input: ResultsSummaryInput): string | null {
  if (input.error !== null) return "Did not finish";
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
