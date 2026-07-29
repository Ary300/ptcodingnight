import { describe, expect, it } from "vitest";

import { rankDivision, type RankKey } from "@/lib/scoring/rank";

const key = (over: Partial<RankKey> & { participantId: string }): RankKey => ({
  primary: 0,
  penalty: 0,
  lastScoreIncreaseMs: null,
  ...over,
});

describe("rankDivision", () => {
  it("ranks by score descending", () => {
    const ranked = rankDivision([
      key({ participantId: "b", primary: 100 }),
      key({ participantId: "a", primary: 300 }),
      key({ participantId: "c", primary: 200 }),
    ]);

    expect(ranked.map((r) => r.participantId)).toEqual(["a", "c", "b"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("breaks equal scores by lower penalty", () => {
    const ranked = rankDivision([
      key({ participantId: "a", primary: 300, penalty: 15 }),
      key({ participantId: "b", primary: 300, penalty: 5 }),
    ]);

    expect(ranked.map((r) => r.participantId)).toEqual(["b", "a"]);
    expect(ranked.every((r) => r.isTied)).toBe(false);
  });

  it("breaks equal score and penalty by earlier last-score-increase", () => {
    const ranked = rankDivision([
      key({ participantId: "a", primary: 300, lastScoreIncreaseMs: 2000 }),
      key({ participantId: "b", primary: 300, lastScoreIncreaseMs: 1000 }),
    ]);

    expect(ranked.map((r) => r.participantId)).toEqual(["b", "a"]);
  });

  it("sorts a participant who never scored behind one who did, at equal score", () => {
    const ranked = rankDivision([
      key({ participantId: "never", primary: 0, lastScoreIncreaseMs: null }),
      key({ participantId: "scored", primary: 0, lastScoreIncreaseMs: 5000 }),
    ]);

    expect(ranked.map((r) => r.participantId)).toEqual(["scored", "never"]);
  });

  it("gives a genuine tie the same rank and flags both", () => {
    const ranked = rankDivision([
      key({ participantId: "a", primary: 300, penalty: 5, lastScoreIncreaseMs: 1000 }),
      key({ participantId: "b", primary: 300, penalty: 5, lastScoreIncreaseMs: 1000 }),
    ]);

    expect(ranked.map((r) => r.rank)).toEqual([1, 1]);
    expect(ranked.map((r) => r.isTied)).toEqual([true, true]);
  });

  it("uses standard competition ranking — two tied for 2nd puts the next at 4th", () => {
    const ranked = rankDivision([
      key({ participantId: "top", primary: 500 }),
      key({ participantId: "a", primary: 300 }),
      key({ participantId: "b", primary: 300 }),
      key({ participantId: "last", primary: 100 }),
    ]);

    expect(ranked.map((r) => [r.participantId, r.rank])).toEqual([
      ["top", 1],
      ["a", 2],
      ["b", 2],
      ["last", 4],
    ]);
  });

  it("handles a three-way tie", () => {
    const ranked = rankDivision([
      key({ participantId: "a", primary: 300 }),
      key({ participantId: "b", primary: 300 }),
      key({ participantId: "c", primary: 300 }),
      key({ participantId: "d", primary: 100 }),
    ]);

    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 1, 4]);
    expect(ranked.map((r) => r.isTied)).toEqual([true, true, true, false]);
  });

  it("orders tied entries deterministically regardless of input order", () => {
    const forward = rankDivision([
      key({ participantId: "zeta", primary: 300 }),
      key({ participantId: "alpha", primary: 300 }),
    ]);
    const backward = rankDivision([
      key({ participantId: "alpha", primary: 300 }),
      key({ participantId: "zeta", primary: 300 }),
    ]);

    expect(forward.map((r) => r.participantId)).toEqual(["alpha", "zeta"]);
    expect(backward.map((r) => r.participantId)).toEqual(["alpha", "zeta"]);
  });

  it("returns nothing for an empty division", () => {
    expect(rankDivision([])).toEqual([]);
  });
});
