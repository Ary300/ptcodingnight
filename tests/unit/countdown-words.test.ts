import { describe, expect, it } from "vitest";

import { announce, announceStart } from "@/components/contest/Countdown";
import { humanDuration } from "@/components/contest/lobby/phase";

/**
 * The contest clock read "1 hours 9 minutes remaining". Every countdown that says the time in
 * words goes through `humanDuration`, which these pin at the singular and plural edges. (The
 * projector's countdown and the lobby's digits print only `HH:MM:SS`, so they have no words to
 * get wrong.)
 */

const MINUTE = 60_000;

describe("contest countdown in words", () => {
  it("uses the singular for one hour and one minute", () => {
    expect(announce(69 * MINUTE)).toBe("1 hour 9 minutes remaining.");
    expect(announce(61 * MINUTE)).toBe("1 hour 1 minute remaining.");
    expect(announce(60 * MINUTE)).toBe("1 hour remaining.");
    expect(announce(MINUTE)).toBe("1 minute remaining.");
  });

  it("uses the plural everywhere else", () => {
    expect(announce(125 * MINUTE)).toBe("2 hours 5 minutes remaining.");
    expect(announce(45 * MINUTE)).toBe("45 minutes remaining.");
  });

  it("never prints a unit with a zero or a wrong plural", () => {
    for (let minutes = 1; minutes <= 300; minutes += 1) {
      const words = announce(minutes * MINUTE);
      expect(words).not.toMatch(/\b1 hours\b|\b1 minutes\b|\b0 (hours|minutes)\b/);
    }
  });

  it("says the contest is over at zero", () => {
    expect(announce(0)).toBe("Contest over.");
  });

  it("counts to the start the same way", () => {
    expect(announceStart(69 * MINUTE)).toBe("The contest starts in 1 hour 9 minutes.");
    expect(announceStart(121 * MINUTE)).toBe("The contest starts in 2 hours 1 minute.");
    expect(announceStart(30 * 1000)).toBe("The contest starts in under a minute.");
  });

  it("humanDuration pluralises on its own", () => {
    expect(humanDuration(61 * MINUTE)).toBe("1 hour 1 minute");
  });
});
