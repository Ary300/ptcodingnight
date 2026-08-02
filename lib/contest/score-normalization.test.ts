import { describe, expect, it } from "vitest";

import { normalizeJudgeScore } from "@/lib/contest/score-normalization";

describe("normalizeJudgeScore", () => {
  it("pins a full accepted solution to ContestProblem.basePoints", () => {
    expect(
      normalizeJudgeScore({
        rawScore: 140,
        achievablePoints: 140,
        basePoints: 100,
        accepted: true,
      }),
    ).toBe(100);
  });

  it("scales partial test credit proportionally", () => {
    expect(
      normalizeJudgeScore({
        rawScore: 70,
        achievablePoints: 140,
        basePoints: 100,
        accepted: false,
      }),
    ).toBe(50);
  });

  it("uses exact whole-point round-half-up semantics", () => {
    expect(
      normalizeJudgeScore({
        rawScore: 1,
        achievablePoints: 8,
        basePoints: 100,
        accepted: false,
      }),
    ).toBe(13);
  });

  it("never persists more than the configured problem value", () => {
    expect(
      normalizeJudgeScore({
        rawScore: 180,
        achievablePoints: 140,
        basePoints: 100,
        accepted: false,
      }),
    ).toBe(100);
  });

  it("still awards the configured value to an accepted zero-point suite", () => {
    expect(
      normalizeJudgeScore({
        rawScore: 0,
        achievablePoints: 0,
        basePoints: 125,
        accepted: true,
      }),
    ).toBe(125);
  });

  it("rejects values that cannot be scaled exactly", () => {
    expect(() =>
      normalizeJudgeScore({
        rawScore: -1,
        achievablePoints: 100,
        basePoints: 100,
        accepted: false,
      }),
    ).toThrow(RangeError);
  });
});
