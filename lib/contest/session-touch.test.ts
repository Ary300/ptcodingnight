import { beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.fn(() => Promise.resolve({}));
vi.mock("@/lib/db", () => ({ prisma: { session: { update } } }));

const { touchSession } = await import("@/lib/contest/session-store");

describe("touchSession", () => {
  beforeEach(() => update.mockClear());

  it("writes once per session per minute, however often the session is used", () => {
    const start = new Date("2026-11-18T19:00:00-05:00").getTime();
    for (let second = 0; second < 60; second += 1) {
      touchSession("session-a", new Date(start + second * 1_000));
    }
    expect(update).toHaveBeenCalledTimes(1);
    touchSession("session-a", new Date(start + 60_000));
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("does not let one session's write suppress another's", () => {
    const now = new Date("2026-11-18T20:00:00-05:00");
    touchSession("session-b", now);
    touchSession("session-c", now);
    expect(update).toHaveBeenCalledTimes(2);
  });
});
