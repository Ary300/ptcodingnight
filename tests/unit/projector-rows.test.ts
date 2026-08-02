import { describe, expect, it } from "vitest";

import {
  MEMBER_ROWS_FULL_BLOCK,
  MEMBER_ROWS_MIN_BLOCK,
  MEMBER_ROWS_PER_TEAM_ROW,
  drawnTeamRows,
  memberBlockBudget,
} from "@/components/leaderboard/projector-rows";

/**
 * The projector's row budget.
 *
 * This exists because the failure it guards against is SILENT. The projector does not scroll and
 * does not grow: a board that decides to draw one row more than fits has that row clipped by an
 * `overflow: hidden` while the footnote underneath goes on claiming it was shown. That has already
 * happened once on this screen (a footnote promising ten rows over a board drawing five), and it is
 * invisible in every test that only asks whether the page rendered.
 *
 * The geometry itself is measured in the browser and pinned in `constants.ts`. What is asserted
 * here is the arithmetic on top of it: how many rows get drawn, which ones, and whether the open
 * team survives being ranked below the cut.
 */

describe("drawnTeamRows", () => {
  it("draws the top of the table when nothing is open", () => {
    expect(drawnTeamRows(9, 7, [])).toEqual({
      indices: [0, 1, 2, 3, 4, 5, 6],
      jumped: false,
    });
  });

  it("never draws more rows than there are teams", () => {
    expect(drawnTeamRows(3, 7, []).indices).toEqual([0, 1, 2]);
  });

  it("draws exactly the cap when a team inside it is open", () => {
    // The caller has already deducted the strip's cost from the cap. The window does not shrink
    // twice for one open row.
    const drawn = drawnTeamRows(9, 5, [0]);
    expect(drawn.indices).toEqual([0, 1, 2, 3, 4]);
    expect(drawn.jumped).toBe(false);
  });

  it("pulls an open team up when it ranks below the cut, and gives up a row to do it", () => {
    // Rank 7 (index 6) with room for five. Four from the top, then the open team: five rows, which
    // is what the cap allows. Appending it instead would be six, and the sixth is the one that
    // gets clipped without saying so.
    const drawn = drawnTeamRows(9, 5, [6]);
    expect(drawn.indices).toEqual([0, 1, 2, 3, 6]);
    expect(drawn.jumped).toBe(true);
  });

  it("never exceeds the cap, for any open row on any size of field", () => {
    for (let total = 0; total <= 12; total += 1) {
      for (let cap = 1; cap <= 9; cap += 1) {
        for (let open = -1; open < total; open += 1) {
          const drawn = drawnTeamRows(total, cap, open === -1 ? [] : [open]);
          expect(drawn.indices.length).toBeLessThanOrEqual(Math.min(cap, total));
          // Ascending, unique, and in range: the rank column has to read as a rank column.
          expect([...drawn.indices].sort((a, b) => a - b)).toEqual([...drawn.indices]);
          expect(new Set(drawn.indices).size).toBe(drawn.indices.length);
          for (const index of drawn.indices) {
            expect(index).toBeGreaterThanOrEqual(0);
            expect(index).toBeLessThan(total);
          }
        }
      }
    }
  });

  it("always draws the open team, whatever it ranks", () => {
    for (let open = 0; open < 9; open += 1) {
      expect(drawnTeamRows(9, 5, [open]).indices).toContain(open);
    }
  });

  it("keeps every open team while filling the remaining slots from the top", () => {
    expect(drawnTeamRows(10, 5, [8, 6])).toEqual({
      indices: [0, 1, 2, 6, 8],
      jumped: true,
    });
  });

  it("deduplicates stale open indices and never substitutes another team", () => {
    expect(drawnTeamRows(5, 3, [4, 4, 12, -1])).toEqual({
      indices: [0, 1, 4],
      jumped: true,
    });
  });

  it("treats an open index that is no longer in the field as closed", () => {
    // The team was deleted between two polls. Pinning some other team's breakdown open on the wall
    // because its neighbour inherited the index would be worse than closing.
    expect(drawnTeamRows(3, 5, [7])).toEqual({ indices: [0, 1, 2], jumped: false });
    expect(drawnTeamRows(0, 5, [0])).toEqual({ indices: [], jumped: false });
  });

  it("still draws the open team when there is room for exactly one row", () => {
    expect(drawnTeamRows(9, 1, [6])).toEqual({ indices: [6], jumped: true });
  });

  it("never hides an explicitly open team even when open rows outnumber the cap", () => {
    expect(drawnTeamRows(9, 1, [2, 6])).toEqual({
      indices: [2, 6],
      jumped: true,
    });
  });
});

describe("memberBlockBudget", () => {
  /**
   * The wall geometry these tests are written against: TEAM_VISIBLE_ROWS = 7 team rows, and a
   * member row is HALF a team row (re-measured when the breakdown became child cards; it was a
   * third when the rows were bare text). The failure guarded is the one this file exists for,
   * one level down: blocks handed out against a stale ratio overflow the canvas, and the
   * overflow does not announce itself — the board scrolls on a screen nobody can scroll.
   */
  const WALL = 7;

  it("gives a lone open team the full measured block", () => {
    // 1 open on a 9-team field: cap 5 drawn, (7-5)*2 = 4 spare member rows for one team.
    expect(memberBlockBudget(WALL, 5, 1)).toBe(MEMBER_ROWS_FULL_BLOCK);
  });

  it("still affords full blocks at two open, which is where the two-row cost balances", () => {
    // 2 open: cap 3 drawn, (7-3)*2 = 8 spare, 4 each.
    expect(memberBlockBudget(WALL, 3, 2)).toBe(MEMBER_ROWS_FULL_BLOCK);
  });

  it("shrinks every block at three open instead of letting the wall scroll", () => {
    // 3 open: only the open teams are drawn, (7-3)*2 = 8 spare, floor(8/3) = 2 each, which is the
    // remainder-plus-pool floor. Full blocks would be 12 member rows = 6 team rows of breakdown
    // under 3 team rows of teams: 9 rows on a 7-row wall.
    expect(memberBlockBudget(WALL, 3, 3)).toBe(MEMBER_ROWS_MIN_BLOCK);
  });

  it("never shrinks a block below the remainder-plus-pool floor", () => {
    // Pathological: more open teams than the leftover can hold at any size. The floor keeps the
    // block a block; the screen's scroll fallback owns whatever the floor cannot absorb.
    expect(memberBlockBudget(WALL, 6, 6)).toBe(MEMBER_ROWS_MIN_BLOCK);
    expect(memberBlockBudget(WALL, 7, 4)).toBe(MEMBER_ROWS_MIN_BLOCK);
  });

  it("never exceeds the measured full block however much room is spare", () => {
    expect(memberBlockBudget(WALL, 1, 1)).toBe(MEMBER_ROWS_FULL_BLOCK);
    expect(memberBlockBudget(20, 1, 1)).toBe(MEMBER_ROWS_FULL_BLOCK);
  });

  it("answers the full block when nothing is open, so a stale caller cannot divide by zero", () => {
    expect(memberBlockBudget(WALL, 7, 0)).toBe(MEMBER_ROWS_FULL_BLOCK);
  });

  it("keeps the whole drawn board within the wall budget wherever the floor is not binding", () => {
    // The invariant the arithmetic exists for, sweep-checked in team-row units: drawn team rows
    // plus every open block's share must fit inside the wall whenever blocks are above the floor.
    for (let drawn = 1; drawn <= WALL; drawn += 1) {
      for (let open = 1; open <= drawn; open += 1) {
        const block = memberBlockBudget(WALL, drawn, open);
        if (block === MEMBER_ROWS_MIN_BLOCK) continue; // the floor may legitimately overflow
        const totalTeamRowUnits = drawn + (open * block) / MEMBER_ROWS_PER_TEAM_ROW;
        expect(totalTeamRowUnits).toBeLessThanOrEqual(WALL);
      }
    }
  });
});
