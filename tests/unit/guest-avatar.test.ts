import { describe, expect, it } from "vitest";

import { GRID_SIZE, guestMark } from "@/components/contest/guest-avatar";

const SEEDS = Array.from({ length: 40 }, (_, index) => `cmhparticipant${String(index).padStart(4, "0")}`);

describe("guestMark", () => {
  it("is deterministic: the same id gives the same mark", () => {
    for (const seed of SEEDS) {
      expect(guestMark(seed)).toEqual(guestMark(seed));
    }
  });

  it("is mirror-symmetric left to right on a 5 by 5 grid", () => {
    for (const seed of SEEDS) {
      const { cells } = guestMark(seed);
      expect(cells).toHaveLength(GRID_SIZE);
      for (const row of cells) {
        expect(row).toHaveLength(GRID_SIZE);
        expect(row).toEqual([...row].reverse());
      }
    }
  });

  it("never draws a near-empty mark", () => {
    for (const seed of SEEDS) {
      const filled = guestMark(seed).cells.flat().filter(Boolean).length;
      expect(filled).toBeGreaterThanOrEqual(5);
    }
  });

  it("tells guests apart", () => {
    const distinct = new Set(SEEDS.map((seed) => JSON.stringify(guestMark(seed))));
    // Forty ids, 2^16 possible marks: a collision or two is tolerable, a handful of marks is not.
    expect(distinct.size).toBeGreaterThanOrEqual(38);
  });
});
