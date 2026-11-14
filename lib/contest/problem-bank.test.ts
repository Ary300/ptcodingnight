import { describe, expect, it } from "vitest";

import {
  KEPT_OUT_OF_SETS_BLOCKER,
  readyBlockersFor,
  type ReadyFacts,
} from "@/lib/contest/problem-bank";

/**
 * `readyBlockers` is the one answer to "may this problem be dealt into a live contest". The set
 * planner's `gatherPool` drops any problem whose list is non-empty, so every sentence here is also
 * an exclusion rule, and a missing one is a problem the planner deals that it should not.
 */

/** A problem with nothing wrong with it. Each test breaks exactly one fact. */
const READY: ReadyFacts = {
  state: "READY",
  hasStatement: true,
  testCaseCount: 12,
  sampleCaseCount: 2,
  keepOutOfSets: false,
};

describe("readyBlockersFor", () => {
  it("returns nothing for a published problem with a statement, tests and samples", () => {
    expect(readyBlockersFor(READY)).toEqual([]);
  });

  it("keeps a manifest-flagged problem out of sets, and says where the flag lives", () => {
    const blockers = readyBlockersFor({ ...READY, keepOutOfSets: true });
    expect(blockers).toEqual([KEPT_OUT_OF_SETS_BLOCKER]);
    expect(KEPT_OUT_OF_SETS_BLOCKER).toBe(
      "Kept out of sets: this problem is about a data type (see its manifest). Place it by hand if you want it.",
    );
  });

  it("names the data-type exclusion alongside any other blocker rather than instead of it", () => {
    const blockers = readyBlockersFor({ ...READY, state: "DRAFT", keepOutOfSets: true });
    expect(blockers).toEqual(["Still a DRAFT", KEPT_OUT_OF_SETS_BLOCKER]);
  });

  it("reports each missing fact as its own sentence", () => {
    expect(readyBlockersFor({ ...READY, state: "DRAFT" })).toEqual(["Still a DRAFT"]);
    expect(readyBlockersFor({ ...READY, state: "ARCHIVED" })).toEqual(["Archived"]);
    expect(readyBlockersFor({ ...READY, hasStatement: false })).toEqual([
      "No original statement written",
    ]);
    expect(readyBlockersFor({ ...READY, testCaseCount: 0, sampleCaseCount: 0 })).toEqual([
      "No test cases",
      "No sample cases, so a student cannot self-check",
    ]);
  });
});
