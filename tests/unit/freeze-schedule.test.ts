import { describe, expect, it } from "vitest";

import {
  MAX_FREEZE_MINUTES,
  freezeAtFromMinutes,
  minutesBeforeEndOf,
} from "@/lib/contest/admin";

/**
 * The freeze clock's arithmetic: "stop the board thirty minutes before the end".
 *
 * One subtraction, and it decides when a room stops seeing the standings. Worth pinning because the
 * two directions have to agree — the organizer types minutes, the database stores an instant, and
 * the screen reads the minutes back out of the instant. If those disagree the control lies about
 * what it saved.
 */

describe("freezeAtFromMinutes", () => {
  const endsAt = new Date("2026-09-12T21:00:00.000Z");

  it("subtracts the minutes from the end of the contest", () => {
    expect(freezeAtFromMinutes(endsAt, 30).toISOString()).toBe("2026-09-12T20:30:00.000Z");
    expect(freezeAtFromMinutes(endsAt, 45).toISOString()).toBe("2026-09-12T20:15:00.000Z");
    expect(freezeAtFromMinutes(endsAt, 60).toISOString()).toBe("2026-09-12T20:00:00.000Z");
  });

  it("does not mutate the end time it was given", () => {
    // The caller holds `endsAt` from a Prisma row and writes it back elsewhere in the same request.
    const before = endsAt.getTime();
    freezeAtFromMinutes(endsAt, 30);
    expect(endsAt.getTime()).toBe(before);
  });

  it("crosses an hour, a day and a month boundary without special-casing any of them", () => {
    const midnight = new Date("2026-10-01T00:10:00.000Z");
    expect(freezeAtFromMinutes(midnight, 30).toISOString()).toBe("2026-09-30T23:40:00.000Z");
  });
});

describe("minutesBeforeEndOf", () => {
  const endsAt = new Date("2026-09-12T21:00:00.000Z");

  it("reads back exactly what was typed in", () => {
    for (const minutes of [1, 15, 30, 45, 60, MAX_FREEZE_MINUTES]) {
      expect(minutesBeforeEndOf(endsAt, freezeAtFromMinutes(endsAt, minutes))).toBe(minutes);
    }
  });

  it("is null when there is no freeze, so the screen can say so", () => {
    expect(minutesBeforeEndOf(endsAt, null)).toBeNull();
  });

  it("rounds a window that carries seconds to the minute the organizer typed", () => {
    /*
      A contest created at 21:00:37 stores that second, so `endsAt - 30min` is not a clean multiple
      of 60000 away from anything. Without the rounding, a control that saved "30" would read back
      "29" and the organizer would reasonably conclude it had not saved.
    */
    const ragged = new Date("2026-09-12T21:00:37.400Z");
    expect(minutesBeforeEndOf(ragged, freezeAtFromMinutes(ragged, 30))).toBe(30);
  });

  it("reports a freeze after the end as a negative, rather than pretending it is zero", () => {
    // Not reachable through the route, which refuses it. Silence here would hide a bad row.
    const after = new Date(endsAt.getTime() + 10 * 60_000);
    expect(minutesBeforeEndOf(endsAt, after)).toBe(-10);
  });
});
