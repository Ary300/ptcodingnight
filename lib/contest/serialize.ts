import {
  PublicTestResultSchema,
  RunSamplesResponseSchema,
  SubmissionViewSchema,
  type PublicTestResult,
  type RunSamplesResponse,
  type QueuePosition,
  type SubmissionView,
} from "@/lib/schemas/api";
import { DIFF_SNIPPET_MAX_CHARS, type Language, type Verdict } from "@/lib/schemas/judge";

/**
 * The **only** place a `TestResult` becomes something a client can see.
 *
 * Two gates already stand upstream: `lib/judge/diff.ts` refuses to build a snippet for a
 * hidden case, and `PublicTestResultSchema` has no field a leak could live in. This is the
 * third, and the reason it exists is that the first two both assume the row in the database is
 * trustworthy. A row written by an older build, a manual `UPDATE`, or a future bug in the
 * worker is not. So the hidden-case snippet is dropped here again, unconditionally, and the
 * result is parsed against the wire schema before it leaves.
 *
 * If a future change needs richer per-test detail for students, it does not belong in this
 * function — see docs/PRD.md §7.2.
 */

export interface TestResultRow {
  readonly ordinal: number;
  readonly isSample: boolean;
  readonly verdict: Verdict;
  readonly runtimeMs: number | null;
  readonly diffSnippet: string | null;
}

export function toPublicTestResult(row: TestResultRow): PublicTestResult {
  // Hidden case: pass/fail and timing only. Not a truncated expected value, not a length, not
  // an index — each of those is an oracle a student can query until the case falls out.
  const diffSnippet = row.isSample ? capSnippet(row.diffSnippet) : null;

  return PublicTestResultSchema.parse({
    ordinal: row.ordinal,
    isSample: row.isSample,
    verdict: row.verdict,
    runtimeMs: row.runtimeMs === null ? null : Math.max(0, Math.round(row.runtimeMs)),
    diffSnippet,
  });
}

/** What a sample run answers: the rows, or the compiler's output when nothing ran. */
export interface SampleRunResult {
  readonly verdict: Verdict;
  readonly compileError: string | null;
  readonly testResults: readonly {
    readonly testCaseId: string;
    readonly verdict: Verdict;
    readonly runtimeMs: number | null;
    readonly diffSnippet: string | null;
  }[];
}

/**
 * A sample run as the client sees it. A compile failure runs no tests, so it answers with no
 * rows and the compiler's output in full, the same text `SubmissionView.compileError` carries.
 * It used to ride in on a synthetic row with ordinal 0, which the wire schema (ordinals are
 * 1-based) rejected, so every sample run of code that did not compile was a 400.
 */
export function toRunSamplesResponse(
  result: SampleRunResult,
  testCases: readonly { readonly testCaseId: string; readonly ordinal: number; readonly isSample: boolean }[],
): RunSamplesResponse {
  if (result.verdict === "CE") {
    return RunSamplesResponseSchema.parse({ results: [], compileError: result.compileError ?? "" });
  }
  const byId = new Map(testCases.map((t) => [t.testCaseId, t]));
  const results = result.testResults.map((test) => {
    const testCase = byId.get(test.testCaseId);
    return toPublicTestResult({
      ordinal: testCase?.ordinal ?? 1,
      // Unknown case: treat it as hidden. Guessing "sample" here would publish a diff for a
      // case we cannot prove is one.
      isSample: testCase?.isSample ?? false,
      verdict: test.verdict,
      runtimeMs: test.runtimeMs,
      diffSnippet: test.diffSnippet,
    });
  });
  return { results, compileError: null };
}

/** Ordinal order, so the verdict panel does not reshuffle between polls. */
export function toPublicTestResults(rows: readonly TestResultRow[]): PublicTestResult[] {
  return [...rows].sort((a, b) => a.ordinal - b.ordinal).map(toPublicTestResult);
}

function capSnippet(snippet: string | null): string | null {
  if (snippet === null) return null;
  if (snippet.length <= DIFF_SNIPPET_MAX_CHARS) return snippet;
  return `${snippet.slice(0, DIFF_SNIPPET_MAX_CHARS - 1)}…`;
}

export interface SubmissionRow {
  readonly id: string;
  readonly contestProblemId: string;
  readonly language: Language;
  readonly submittedAt: Date;
  readonly verdict: Verdict | null;
  readonly score: number;
  readonly runtimeMs: number | null;
}

/**
 * A submission as its owner (or an organizer) may see it.
 *
 * Note what is absent: `sourceCode`. `SubmissionViewSchema` has no field for it, so no caller
 * of this function can serve one participant's code to another even by accident.
 *
 * @param compileError Compiler stderr, verbatim, and only when the verdict is `CE` — the
 *   compiler is talking about the student's own code, so nothing leaks (PRD §7.2).
 * @param queuePosition Best-effort, from the judge queue, and only meaningful before a verdict.
 *   `undefined` (Redis could not answer, or the caller did not ask) OMITS the field: absence is
 *   "no claim", never "position zero".
 */
export function toSubmissionView(
  submission: SubmissionRow,
  testResults: readonly TestResultRow[],
  compileError: string | null,
  queuePosition?: QueuePosition,
): SubmissionView {
  return SubmissionViewSchema.parse({
    submissionId: submission.id,
    contestProblemId: submission.contestProblemId,
    language: submission.language,
    submittedAt: submission.submittedAt.toISOString(),
    verdict: submission.verdict,
    score: Math.max(0, submission.score),
    runtimeMs: submission.runtimeMs === null ? null : Math.max(0, Math.round(submission.runtimeMs)),
    testResults: toPublicTestResults(testResults),
    compileError: submission.verdict === "CE" ? compileError : null,
    // A settled submission never carries a position: "Accepted" beside "3 ahead of yours"
    // would be two claims in conflict, and the stale one would win a reader's eye.
    ...(submission.verdict === null && queuePosition !== undefined ? { queuePosition } : {}),
  });
}
