import { describe, expect, it } from "vitest";

import { computeStandings } from "@/lib/scoring";
import {
  canonicalize,
  loadExpectedStandings,
  loadGoldenContest,
  serialize,
} from "@/fixtures/scoring/load";

/**
 * G6 — golden standings replay.
 *
 * Two things must hold (docs/PRD.md §12):
 *   1. The engine reproduces the hand-computed standings byte-for-byte.
 *   2. Replaying the same log twice produces identical output.
 *
 * The second is the one that matters months later, when a student disputes a result and the
 * only honest answer is to re-derive it from the raw submission log and get the same number.
 */

const golden = loadGoldenContest();

function run() {
  return computeStandings(
    golden.config,
    golden.participants,
    golden.submissions,
    golden.hintGrants,
  );
}

describe("G6 golden contest replay", () => {
  it("matches the hand-computed standings byte-for-byte", () => {
    const actual = JSON.stringify(canonicalize(run()), null, 2);
    const expected = JSON.stringify(loadExpectedStandings(), null, 2);

    expect(actual).toBe(expected);
  });

  it("is replay stable — the same log twice yields identical bytes", () => {
    expect(serialize(run())).toBe(serialize(run()));
  });

  it("is order-independent — shuffling the input log changes nothing", () => {
    // Real callers read submissions from Postgres, where row order is not guaranteed
    // without an ORDER BY. If the engine were sensitive to it, standings would drift
    // between two identical recomputations.
    const shuffled = [...golden.submissions].reverse();
    const fromShuffled = computeStandings(
      golden.config,
      [...golden.participants].reverse(),
      shuffled,
      [...golden.hintGrants].reverse(),
    );

    expect(serialize(fromShuffled)).toBe(serialize(run()));
  });

  it("declares an Intermediate winner and an Advanced winner independently", () => {
    const standings = run();
    const winners = standings.filter((s) => s.rank === 1);

    expect(winners.map((w) => `${w.divisionId ?? "none"}:${w.participantId}`)).toEqual([
      "intermediate:int-c",
      "advanced:adv-c",
    ]);
  });
});
