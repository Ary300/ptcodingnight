import { describe, expect, it } from "vitest";

import { jobsAheadInWaitList } from "@/lib/contest/queue";

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
