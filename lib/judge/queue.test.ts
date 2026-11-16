import { describe, expect, it } from "vitest";

import {
  EXPRESS_LANE_MAX_SUBMISSION_WAIT_MS,
  SUBMISSION_PRIORITY,
  jobsAheadInOrdinaryLane,
  laneJobOptions,
  sampleRunLane,
} from "@/lib/judge/queue";

/**
 * The lane decision is the whole of "run samples jumps the queue without starving submissions",
 * so it is pinned as a pure function. The BullMQ ordering it relies on — no-priority jobs before
 * prioritized ones, FIFO within one priority — is documented in `lib/judge/queue.ts` from the
 * installed `moveToActive` script.
 */
describe("sampleRunLane", () => {
  const now = 1_000_000;

  it("is express when no submission is queued", () => {
    expect(sampleRunLane({ oldestOrdinaryEnqueuedAtMs: null, nowMs: now })).toBe("express");
  });

  it("is express while the oldest submission has waited less than the bound", () => {
    expect(
      sampleRunLane({
        oldestOrdinaryEnqueuedAtMs: now - EXPRESS_LANE_MAX_SUBMISSION_WAIT_MS + 1,
        nowMs: now,
      }),
    ).toBe("express");
  });

  it("joins the ordinary lane once the oldest submission has waited the bound", () => {
    expect(
      sampleRunLane({
        oldestOrdinaryEnqueuedAtMs: now - EXPRESS_LANE_MAX_SUBMISSION_WAIT_MS,
        nowMs: now,
      }),
    ).toBe("ordinary");
  });

  it("treats a clock that reads earlier than the enqueue as no wait at all", () => {
    expect(sampleRunLane({ oldestOrdinaryEnqueuedAtMs: now + 5_000, nowMs: now })).toBe("express");
  });

  it("keeps the bound above the night's 30 s drain target, so a healthy rush never trips it", () => {
    expect(EXPRESS_LANE_MAX_SUBMISSION_WAIT_MS).toBeGreaterThan(30_000);
  });
});

describe("laneJobOptions", () => {
  it("expresses a job by giving it NO priority, which BullMQ takes first", () => {
    expect(laneJobOptions("express")).toEqual({});
    expect("priority" in laneJobOptions("express")).toBe(false);
  });

  it("puts every ordinary job at the same priority, so submissions stay FIFO", () => {
    expect(laneJobOptions("ordinary")).toEqual({ priority: SUBMISSION_PRIORITY });
    expect(SUBMISSION_PRIORITY).toBeGreaterThanOrEqual(1);
  });
});

describe("jobsAheadInOrdinaryLane", () => {
  it("counts every express job ahead of every ordinary one", () => {
    expect(jobsAheadInOrdinaryLane(3, 0)).toBe(3);
  });

  it("adds the jobs ahead within the ordinary lane", () => {
    expect(jobsAheadInOrdinaryLane(2, 4)).toBe(6);
  });

  it("is zero for the head of the ordinary lane with nothing express", () => {
    expect(jobsAheadInOrdinaryLane(0, 0)).toBe(0);
  });

  it("returns null for a job not in the lane, never a guessed number", () => {
    expect(jobsAheadInOrdinaryLane(5, null)).toBeNull();
  });
});
