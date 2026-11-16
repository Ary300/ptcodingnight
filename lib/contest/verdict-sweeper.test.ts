import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const jobsReadyToReconcile = vi.fn();
const reconcile = vi.fn(() => Promise.resolve());

vi.mock("@/lib/db", () => ({ prisma: { submission: { findMany } } }));
vi.mock("@/lib/contest/queue", () => ({ jobsReadyToReconcile }));
vi.mock("@/lib/contest/submissions", () => ({ reconcile }));

const { sweepVerdicts } = await import("@/lib/contest/verdict-sweeper");

describe("sweepVerdicts", () => {
  beforeEach(() => {
    findMany.mockReset();
    jobsReadyToReconcile.mockReset();
    reconcile.mockClear();
  });

  it("reconciles only the rows whose jobs finished or vanished, oldest first", async () => {
    findMany.mockResolvedValue([{ id: "old-finished" }, { id: "still-running" }, { id: "lost" }]);
    jobsReadyToReconcile.mockResolvedValue(new Set(["lost", "old-finished"]));
    const now = new Date("2026-11-18T20:14:00-05:00");

    const seen = await sweepVerdicts(now);

    expect(seen).toBe(3);
    expect(jobsReadyToReconcile).toHaveBeenCalledWith(["old-finished", "still-running", "lost"]);
    expect(reconcile.mock.calls).toEqual([
      ["old-finished", now],
      ["lost", now],
    ]);
  });

  it("makes no queue call when nothing is unjudged", async () => {
    findMany.mockResolvedValue([]);
    jobsReadyToReconcile.mockResolvedValue(new Set());
    await sweepVerdicts(new Date());
    expect(reconcile).not.toHaveBeenCalled();
  });
});
