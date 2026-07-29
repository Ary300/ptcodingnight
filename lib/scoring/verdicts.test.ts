import { describe, expect, it } from "vitest";

import type { Verdict } from "@/lib/schemas/judge";
import { isAccepted, isRejection, isScorable } from "@/lib/scoring/verdicts";

const ALL: Verdict[] = ["AC", "WA", "TLE", "MLE", "RE", "CE", "IE"];

describe("isRejection", () => {
  it("counts every failing verdict except IE", () => {
    expect(ALL.filter(isRejection)).toEqual(["WA", "TLE", "MLE", "RE", "CE"]);
  });

  it("never counts an internal error against a student", () => {
    // PRD §7.2: IE is never surfaced as a student-facing failure. Charging five penalty
    // minutes for our own judge falling over would do exactly that.
    expect(isRejection("IE")).toBe(false);
  });

  it("counts a compile error — the student can compile locally first", () => {
    expect(isRejection("CE")).toBe(true);
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
