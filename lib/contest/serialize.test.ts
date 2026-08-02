import { describe, expect, it } from "vitest";

import { DIFF_SNIPPET_MAX_CHARS } from "@/lib/schemas/judge";
import {
  toPublicTestResult,
  toPublicTestResults,
  toSubmissionView,
  type SubmissionRow,
  type TestResultRow,
} from "@/lib/contest/serialize";

/**
 * The leak tests.
 *
 * These assert the property the whole design rests on: whatever a `TestResult` row happens to
 * contain, a hidden case leaves this layer carrying pass/fail and timing and nothing else.
 */

function testRow(overrides: Partial<TestResultRow> = {}): TestResultRow {
  return { ordinal: 1, isSample: false, verdict: "WA", runtimeMs: 12, diffSnippet: null, ...overrides };
}

function submissionRow(overrides: Partial<SubmissionRow> = {}): SubmissionRow {
  return {
    id: "sub-1",
    contestProblemId: "cp-1",
    language: "PYTHON_312",
    submittedAt: new Date("2026-07-29T19:00:00.000Z"),
    verdict: "WA",
    score: 40,
    runtimeMs: 120,
    ...overrides,
  };
}

describe("toPublicTestResult", () => {
  it("drops a diff on a hidden case even when the row carries one", () => {
    // The row is what a buggy worker, an old build, or a manual UPDATE could leave behind.
    const result = toPublicTestResult(
      testRow({ isSample: false, diffSnippet: "expected: 42\nactual: 41" }),
    );
    expect(result.diffSnippet).toBeNull();
  });

  it("keeps a diff on a sample case, which is published anyway", () => {
    const result = toPublicTestResult(testRow({ isSample: true, diffSnippet: "line 1" }));
    expect(result.diffSnippet).toBe("line 1");
  });

  it("caps an oversized sample diff", () => {
    const long = "x".repeat(500);
    const result = toPublicTestResult(testRow({ isSample: true, diffSnippet: long }));
    expect(result.diffSnippet).toHaveLength(DIFF_SNIPPET_MAX_CHARS);
    expect(result.diffSnippet?.endsWith("…")).toBe(true);
  });

  it("exposes no field that could carry test data", () => {
    const result = toPublicTestResult(testRow({ isSample: true, diffSnippet: "d" }));
    expect(Object.keys(result).toSorted()).toEqual([
      "diffSnippet",
      "isSample",
      "ordinal",
      "runtimeMs",
      "verdict",
    ]);
  });

  it("keeps timing, which is allowed for hidden cases", () => {
    expect(toPublicTestResult(testRow({ runtimeMs: 340 })).runtimeMs).toBe(340);
    expect(toPublicTestResult(testRow({ runtimeMs: null })).runtimeMs).toBeNull();
  });
});

describe("toPublicTestResults", () => {
  it("returns rows in ordinal order regardless of query order", () => {
    const rows = [testRow({ ordinal: 3 }), testRow({ ordinal: 1 }), testRow({ ordinal: 2 })];
    expect(toPublicTestResults(rows).map((r) => r.ordinal)).toEqual([1, 2, 3]);
  });
});

describe("toSubmissionView", () => {
  it("carries no source code — the wire type has nowhere to put it", () => {
    const view = toSubmissionView(submissionRow(), [], null);
    expect(Object.keys(view)).not.toContain("sourceCode");
  });

  it("returns the compiler message only on a CE verdict", () => {
    const ce = toSubmissionView(submissionRow({ verdict: "CE" }), [], "SyntaxError: bad");
    expect(ce.compileError).toBe("SyntaxError: bad");

    const wa = toSubmissionView(submissionRow({ verdict: "WA" }), [], "SyntaxError: bad");
    expect(wa.compileError).toBeNull();
  });

  it("scrubs hidden diffs on the way through", () => {
    const view = toSubmissionView(submissionRow(), [testRow({ diffSnippet: "expected: 42" })], null);
    expect(view.testResults[0]?.diffSnippet).toBeNull();
  });

  it("reports a queued submission as having no verdict yet", () => {
    const view = toSubmissionView(submissionRow({ verdict: null, score: 0 }), [], null);
    expect(view.verdict).toBeNull();
    expect(view.testResults).toEqual([]);
  });

  it("carries a queue position on an unjudged submission", () => {
    const view = toSubmissionView(submissionRow({ verdict: null, score: 0 }), [], null, {
      state: "waiting",
      ahead: 3,
    });
    expect(view.queuePosition).toEqual({ state: "waiting", ahead: 3 });
  });

  it("omits the queue position when the caller has none, rather than sending a zero", () => {
    // Absence means "no claim". A default of {ahead: 0} would tell every student on a broken
    // Redis that they are next.
    const view = toSubmissionView(submissionRow({ verdict: null, score: 0 }), [], null);
    expect("queuePosition" in view).toBe(false);
  });

  it("drops a queue position once a verdict exists, even if the caller passed one", () => {
    // A settled row saying "3 ahead of yours" is two claims in conflict.
    const view = toSubmissionView(submissionRow({ verdict: "AC" }), [], null, {
      state: "waiting",
      ahead: 3,
    });
    expect("queuePosition" in view).toBe(false);
  });
});
