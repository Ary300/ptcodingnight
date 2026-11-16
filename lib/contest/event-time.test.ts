import { describe, expect, it } from "vitest";

import {
  eventWallClockToInstant,
  formatEventTime,
  instantToEventWallClock,
} from "@/lib/contest/event-time";

/**
 * Times an organizer types are Indianapolis times, whatever zone the laptop or the server is in.
 * The suite runs in whatever TZ the machine has, which is the point: none of these may depend on it.
 */

describe("eventWallClockToInstant", () => {
  it("reads 7:00 PM on contest night as Eastern Standard Time", () => {
    expect(eventWallClockToInstant("2026-11-18T19:00")?.toISOString()).toBe(
      "2026-11-19T00:00:00.000Z",
    );
  });

  it("reads a summer evening as Eastern Daylight Time", () => {
    expect(eventWallClockToInstant("2026-08-01T19:00")?.toISOString()).toBe(
      "2026-08-01T23:00:00.000Z",
    );
  });

  it("is right on both sides of the November change", () => {
    // 1 November 2026: clocks fall back at 2:00 AM. 1:30 AM is ambiguous; noon is not.
    expect(eventWallClockToInstant("2026-11-01T12:00")?.toISOString()).toBe(
      "2026-11-01T17:00:00.000Z",
    );
    expect(eventWallClockToInstant("2026-10-31T12:00")?.toISOString()).toBe(
      "2026-10-31T16:00:00.000Z",
    );
  });

  it("refuses text that is not a date and a time", () => {
    expect(eventWallClockToInstant("7:00 PM")).toBeNull();
    expect(eventWallClockToInstant("")).toBeNull();
  });

  it("round-trips through the field's own format and prints back as typed", () => {
    const instant = eventWallClockToInstant("2026-11-18T20:15");
    expect(instant).not.toBeNull();
    expect(instantToEventWallClock(instant!)).toBe("2026-11-18T20:15");
    expect(formatEventTime(instant!)).toBe("8:15 PM");
  });
});
