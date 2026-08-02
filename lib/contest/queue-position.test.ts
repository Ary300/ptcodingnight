import { describe, expect, it } from "vitest";

import { jobsAheadInWaitList, offlineQueuePosition } from "@/lib/contest/queue";

/**
 * The direction of the wait list is the whole content of this function, and it is the part a
 * BullMQ upgrade could silently flip. The fixture mirrors what the empirical probe read back
 * from bullmq 5.x after enqueueing first, second, third in that order: LRANGE returns newest
 * to oldest, and the worker consumes from the right. If these expectations start failing
 * after a dependency bump, the list direction changed and `queuePositionOf` is lying to
 * students by exactly the reversed amount.
 */
describe("jobsAheadInWaitList", () => {
  // LRANGE order as measured: index 0 is the NEWEST job.
  const ids = ["third", "second", "first"] as const;

  it("counts zero ahead for the oldest job, which the worker takes next", () => {
    expect(jobsAheadInWaitList(ids, "first")).toBe(0);
  });

  it("counts every older job as ahead of the newest", () => {
    expect(jobsAheadInWaitList(ids, "third")).toBe(2);
  });

  it("counts only the jobs to the consuming side", () => {
    expect(jobsAheadInWaitList(ids, "second")).toBe(1);
  });

  it("returns null for a job not in the list, never a guessed number", () => {
    expect(jobsAheadInWaitList(ids, "absent")).toBeNull();
  });

  it("handles a single-element list", () => {
    expect(jobsAheadInWaitList(["only"], "only")).toBe(0);
  });

  it("handles an empty list", () => {
    expect(jobsAheadInWaitList([], "anything")).toBeNull();
  });
});

/**
 * The offline override's precedence, pinned as a pure decision. The three inputs mean three
 * different things and only ONE of them may flip the student's display: a POSITIVE zero (no
 * live heartbeat) becomes "offline", a positive count lets the ordinary position stand, and
 * `null` (the count could not be read) claims nothing — an unknown must never render as the
 * loudest state, and a Redis hiccup on the heartbeat read must not break the position it
 * decorates, let alone the verdict read underneath.
 */
describe("offlineQueuePosition", () => {
  it("turns a positive zero into the offline state", () => {
    expect(offlineQueuePosition(0)).toEqual({ state: "offline", ahead: 0 });
  });

  it("claims nothing while any worker is alive", () => {
    expect(offlineQueuePosition(1)).toBeNull();
    expect(offlineQueuePosition(3)).toBeNull();
  });

  it("claims nothing when the count could not be read: unknown is not offline", () => {
    expect(offlineQueuePosition(null)).toBeNull();
  });
});
