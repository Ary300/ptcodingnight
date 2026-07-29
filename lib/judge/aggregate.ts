import {
  VERDICT_PRECEDENCE,
  type JudgeResult,
  type JudgeTestCase,
  type JudgeTestResult,
  type Verdict,
} from "@/lib/schemas/judge";

/**
 * Turning per-test outcomes into one submission verdict (docs/PRD.md §7.2).
 */

/** Lower index is worse. `IE` outranks everything; `AC` is last. */
function severity(verdict: Verdict): number {
  const index = VERDICT_PRECEDENCE.indexOf(verdict);
  return index === -1 ? 0 : index;
}

/**
 * The submission's verdict is the worst verdict any test produced. `AC` only when every
 * test passed.
 *
 * A submission with no tests is `IE`, not `AC`: zero tests means the problem is
 * misconfigured, and reporting that as a pass would hand out points for nothing.
 */
export function aggregateVerdict(results: readonly JudgeTestResult[]): Verdict {
  if (results.length === 0) return "IE";

  let worst: Verdict = "AC";
  for (const result of results) {
    if (severity(result.verdict) < severity(worst)) worst = result.verdict;
  }
  return worst;
}

/** Points are earned per passing test case, which is what makes partial credit possible. */
export function aggregateScore(
  results: readonly JudgeTestResult[],
  testCases: readonly JudgeTestCase[],
): number {
  const pointsById = new Map(testCases.map((t) => [t.testCaseId, t.points]));

  return results
    .filter((r) => r.verdict === "AC")
    .reduce((sum, r) => sum + (pointsById.get(r.testCaseId) ?? 0), 0);
}

/** Max across tests, not sum — "how slow was the worst case", not "total CPU burned". */
function maxOf(results: readonly JudgeTestResult[], key: "runtimeMs" | "memoryKb"): number | null {
  const values = results.map((r) => r[key]).filter((v): v is number => v !== null);
  return values.length === 0 ? null : Math.max(...values);
}

export interface AggregateInput {
  readonly submissionId: string;
  readonly results: readonly JudgeTestResult[];
  readonly testCases: readonly JudgeTestCase[];
  /** Compiler stderr when compilation failed. Its presence forces a `CE`. */
  readonly compileError?: string | null;
  readonly judgeLogRef?: string | null;
}

export function aggregate(input: AggregateInput): JudgeResult {
  const { submissionId, results, testCases } = input;
  const compileError = input.compileError ?? null;

  // A compile failure short-circuits everything: no test ever ran, so there is nothing to
  // aggregate and no points to award.
  if (compileError !== null) {
    return {
      submissionId,
      verdict: "CE",
      score: 0,
      runtimeMs: null,
      memoryKb: null,
      testResults: [],
      compileError,
      judgeLogRef: input.judgeLogRef ?? null,
    };
  }

  const verdict = aggregateVerdict(results);

  return {
    submissionId,
    verdict,
    // An IE means we do not know whether the code was correct, so we do not bank points for
    // it. The job is requeued once; the retry decides.
    score: verdict === "IE" ? 0 : aggregateScore(results, testCases),
    runtimeMs: maxOf(results, "runtimeMs"),
    memoryKb: maxOf(results, "memoryKb"),
    testResults: [...results],
    compileError: null,
    judgeLogRef: input.judgeLogRef ?? null,
  };
}
