import { describe, expect, it } from "vitest";

import { deriveTimingsRow } from "@/lib/contest/console";
import type { JudgeTimings } from "@/lib/schemas/judge";

/**
 * Stage attribution: stored epoch marks in, console durations out.
 *
 * The rule under test is "absence is absence": a submission judged before timings existed, a
 * malformed blob written by some other build, or a stage the run never reached must all come
 * out as null — never as a zero that reads like a measurement.
 */

function marks(overrides: Partial<JudgeTimings> = {}): JudgeTimings {
  // A compiled run: enqueued at 10_000, picked up 200ms later, container up 1_100ms after
  // that, compile took 3_000ms, tests another 1_400ms.
  return {
    enqueuedAtMs: 10_000,
    dequeuedAtMs: 10_200,
    containerStartedAtMs: 11_300,
    compileFinishedAtMs: 14_300,
    lastTestFinishedAtMs: 15_700,
    attempt: 1,
    ...overrides,
  };
}

describe("deriveTimingsRow", () => {
  it("derives the four buckets from a compiled run's marks", () => {
    expect(deriveTimingsRow(marks())).toEqual({
      queueMs: 200,
      createMs: 1_100,
      compileMs: 3_000,
      runMs: 1_400,
      attempt: 1,
    });
  });

  it("reports no compile bucket for an interpreted run, and runs from container start", () => {
    expect(deriveTimingsRow(marks({ compileFinishedAtMs: null }))).toEqual({
      queueMs: 200,
      createMs: 1_100,
      compileMs: null,
      runMs: 4_400,
      attempt: 1,
    });
  });

  it("reports no run bucket for a CE that never reached a test", () => {
    const row = deriveTimingsRow(marks({ lastTestFinishedAtMs: null }));
    expect(row?.runMs).toBeNull();
    expect(row?.compileMs).toBe(3_000);
  });

  it("carries the attempt number through, because attempt 2 IS the answer sometimes", () => {
    expect(deriveTimingsRow(marks({ attempt: 2 }))?.attempt).toBe(2);
  });

  it("treats a null column, a legacy row, and a malformed blob all as absence", () => {
    expect(deriveTimingsRow(null)).toBeNull();
    expect(deriveTimingsRow(undefined)).toBeNull();
    expect(deriveTimingsRow({ some: "other shape" })).toBeNull();
    expect(deriveTimingsRow("not even an object")).toBeNull();
  });

  it("clamps clock skew between the queue's clock and the worker's to zero, not negative", () => {
    // The queue marks come from the web process's clock and the container marks from the
    // worker's; a small skew must not render as a negative duration.
    const row = deriveTimingsRow(marks({ containerStartedAtMs: 10_100 }));
    expect(row?.createMs).toBe(0);
  });
});
