import { describe, expect, it } from "vitest";

import {
  assertEditable,
  buildSignature,
  type ProblemUsage,
} from "@/lib/contest/problem-author";

function usage(overrides: Partial<ProblemUsage> = {}): ProblemUsage {
  return { contests: [], lockedBy: [], submissionCount: 0, ...overrides };
}

describe("authored starter signatures", () => {
  it("adds exactly one hidden length field for an array parameter", () => {
    const signature = buildSignature({
      name: "sumValues",
      returns: "int",
      params: [{ name: "values", type: "int[]" }],
    });

    expect(signature.params).toEqual([
      { name: "valuesCount", type: "int", passed: false },
      { name: "values", type: "int[]", length: "valuesCount" },
    ]);
  });
});

describe("authored question history", () => {
  it("allows an unused question to be corrected", () => {
    expect(() => assertEditable("Fresh question", usage())).not.toThrow();
  });

  it("keeps a question immutable after its first submission, even after the contest ends", () => {
    expect(() => assertEditable("Historical question", usage({ submissionCount: 1 }))).toThrow(
      /Create a new question for the corrected version/,
    );
  });

  it("locks a live question before anyone submits", () => {
    const live = {
      contestId: "contest-1",
      contestName: "Coding Night",
      contestState: "RUNNING",
      slotLabel: "A1",
    };
    expect(() =>
      assertEditable("Live question", usage({ contests: [live], lockedBy: [live] })),
    ).toThrow(/live right now/);
  });
});
