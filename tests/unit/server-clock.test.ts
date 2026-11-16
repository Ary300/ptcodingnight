import { afterEach, describe, expect, it, vi } from "vitest";

import { noteServerDate, resetServerClock, serverNow } from "@/components/leaderboard/server-clock";

/** A countdown counts against the server that decides the cutoff, not the laptop it runs on. */

afterEach(() => {
  resetServerClock();
  vi.useRealTimers();
});

describe("serverNow", () => {
  it("corrects a laptop whose clock is two minutes slow", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T01:12:00.000Z"));
    // The server says 8:14:00 PM Eastern while the laptop thinks 8:12:00.
    noteServerDate("Thu, 19 Nov 2026 01:14:00 GMT");
    expect(serverNow() - Date.now()).toBe(120_500);
  });

  it("ignores the header's own one-second rounding", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T01:14:00.900Z"));
    noteServerDate("Thu, 19 Nov 2026 01:14:00 GMT");
    expect(serverNow()).toBe(Date.now());
  });

  it("keeps the last good reading when a response has no usable header", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T01:12:00.000Z"));
    noteServerDate("Thu, 19 Nov 2026 01:14:00 GMT");
    noteServerDate(null);
    noteServerDate("not a date");
    expect(serverNow() - Date.now()).toBe(120_500);
  });
});
