import { describe, expect, it } from "vitest";

import { DomainError } from "@/lib/errors";
import {
  MAX_GROUP_UNLOCK_MINUTES,
  assertGroupUnlockInsideWindow,
  assertGroupUnlockMinutes,
  freezeAtFromMinutes,
  groupUnlockAtFromMinutes,
  minutesAfterStartOf,
  minutesBeforeEndOf,
} from "@/lib/contest/admin";

/**
 * The pure halves of the two clocks an organizer sets before the night: the freeze, counted back
 * from the end, and the group unlock, counted forward from the start. The writes behind them need a
 * database and are covered by G7; the arithmetic and the refusals are unit tests here.
 */

const STARTS = new Date("2026-11-13T19:00:00.000Z");
const ENDS = new Date("2026-11-13T21:00:00.000Z");

describe("groupUnlockAtFromMinutes", () => {
  it("adds the minutes to the start", () => {
    expect(groupUnlockAtFromMinutes(STARTS, 30)).toEqual(new Date("2026-11-13T19:30:00.000Z"));
  });

  it("mirrors freezeAtFromMinutes: the two clocks count from opposite ends of the window", () => {
    expect(groupUnlockAtFromMinutes(STARTS, 30).getTime() - STARTS.getTime()).toBe(
      ENDS.getTime() - freezeAtFromMinutes(ENDS, 30).getTime(),
    );
  });
});

describe("minutesAfterStartOf", () => {
  it("reads the minutes back from the instant", () => {
    expect(minutesAfterStartOf(STARTS, new Date("2026-11-13T19:30:00.000Z"))).toBe(30);
  });

  it("is null when nothing is scheduled", () => {
    expect(minutesAfterStartOf(STARTS, null)).toBeNull();
  });

  it("rounds to the nearest minute so a typed 30 reads back as 30 beside a window with seconds", () => {
    const seconds = new Date(STARTS.getTime() + 30 * 60_000 + 20_000);
    expect(minutesAfterStartOf(STARTS, seconds)).toBe(30);
    // The same rounding the freeze side applies, so the two facts on the Window panel agree.
    expect(minutesBeforeEndOf(ENDS, new Date(ENDS.getTime() - 30 * 60_000 - 20_000))).toBe(30);
  });

  it("round-trips groupUnlockAtFromMinutes", () => {
    for (const minutes of [1, 15, 30, 45, 119]) {
      expect(minutesAfterStartOf(STARTS, groupUnlockAtFromMinutes(STARTS, minutes))).toBe(minutes);
    }
  });
});

describe("assertGroupUnlockMinutes", () => {
  it("accepts the whole range from one minute to the ceiling", () => {
    expect(() => assertGroupUnlockMinutes(1)).not.toThrow();
    expect(() => assertGroupUnlockMinutes(30)).not.toThrow();
    expect(() => assertGroupUnlockMinutes(MAX_GROUP_UNLOCK_MINUTES)).not.toThrow();
  });

  it.each([0, -30, 2.5, Number.NaN])("refuses %s as not a whole positive minute count", (bad) => {
    expect(() => assertGroupUnlockMinutes(bad)).toThrow(DomainError);
    expect(() => assertGroupUnlockMinutes(bad)).toThrow(/whole number of minutes/i);
  });

  it("refuses one past the ceiling and names the ceiling", () => {
    expect(() => assertGroupUnlockMinutes(MAX_GROUP_UNLOCK_MINUTES + 1)).toThrow(
      new RegExp(String(MAX_GROUP_UNLOCK_MINUTES)),
    );
  });
});

describe("assertGroupUnlockInsideWindow", () => {
  it("allows an opening strictly inside the window", () => {
    expect(() => assertGroupUnlockInsideWindow(STARTS, ENDS, 30)).not.toThrow();
    expect(() => assertGroupUnlockInsideWindow(STARTS, ENDS, 119)).not.toThrow();
  });

  it("refuses an opening AT the end: a question that opens as the contest closes never opens", () => {
    expect(() => assertGroupUnlockInsideWindow(STARTS, ENDS, 120)).toThrow(DomainError);
  });

  it("refuses an opening past the end, and the sentence names the fix", () => {
    expect(() => assertGroupUnlockInsideWindow(STARTS, ENDS, 150)).toThrow(
      /after the contest ends.*fewer minutes, or a longer contest/i,
    );
  });

  it("is a VALIDATION refusal, so the route answers 400 and the organizer can change the number", () => {
    try {
      assertGroupUnlockInsideWindow(STARTS, ENDS, 150);
      expect.unreachable("an opening past the end must be refused");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("VALIDATION");
    }
  });
});
