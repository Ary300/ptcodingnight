import { describe, expect, it } from "vitest";

import { MEMBER_ROWS_FULL_BLOCK, rosterBlockRows } from "@/components/leaderboard/projector-rows";
import { drawnMemberCount } from "@/components/leaderboard/TeamRosterStrip";

/**
 * The projector's breakdown height.
 *
 * The wall scrolls, so no team is ever dropped to make room and no member is ever folded into a
 * "N more players" row. What is pinned here is the second half: whatever the roster sizes, every
 * player of every team gets a row of their own.
 */
describe("rosterBlockRows", () => {
  it("never goes below the default block", () => {
    expect(rosterBlockRows([])).toBe(MEMBER_ROWS_FULL_BLOCK);
    expect(rosterBlockRows([2, 3])).toBe(MEMBER_ROWS_FULL_BLOCK);
  });

  it("gives a team of five all five players and the pool row", () => {
    const rows = rosterBlockRows([2, 4, 5, 3]);
    expect(rows).toBe(6);
    expect(drawnMemberCount(5, rows)).toBe(5);
  });

  it("draws every member of every team for any roster from one to twelve", () => {
    for (let largest = 1; largest <= 12; largest += 1) {
      const counts = Array.from({ length: largest }, (_, index) => index + 1);
      const rows = rosterBlockRows(counts);
      for (const count of counts) {
        expect(drawnMemberCount(count, rows)).toBe(count);
      }
    }
  });
});
