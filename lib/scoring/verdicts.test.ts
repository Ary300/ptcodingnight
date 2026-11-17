import { describe, expect, it } from "vitest";

import type { Verdict } from "@/lib/schemas/judge";
import { isAccepted, isRejection, isScorable } from "@/lib/scoring/verdicts";

const ALL: Verdict[] = ["AC", "WA", "TLE", "MLE", "RE", "CE", "IE"];

describe("isRejection", () => {
  it("counts WA, TLE, MLE and RE, and nothing else", () => {
    expect(ALL.filter(isRejection)).toEqual(["WA", "TLE", "MLE", "RE"]);
  });

  it("never counts an internal error against a student", () => {
    // PRD §7.2: IE is never surfaced as a student-facing failure. Charging five penalty
    // minutes for our own judge falling over would do exactly that.
    expect(isRejection("IE")).toBe(false);
  });

  it("never counts a compile error — organizer decision, 2026-11-17", () => {
    // A program that never compiled never ran a test. It is not a wrong attempt.
    expect(isRejection("CE")).toBe(false);
  });

  it("does not count an accepted submission", () => {
    expect(isRejection("AC")).toBe(false);
  });
});

describe("isScorable", () => {
  it("drops only IE", () => {
    expect(ALL.filter((v) => !isScorable(v))).toEqual(["IE"]);
  });
});

describe("isAccepted", () => {
  it("is true only for AC", () => {
    expect(ALL.filter(isAccepted)).toEqual(["AC"]);
  });
});
