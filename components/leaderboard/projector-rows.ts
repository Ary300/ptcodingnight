/**
 * Which team rows the projector draws when zero or more roster sections are open.
 *
 * ## Why this is arithmetic and not a `slice`
 *
 * The projector does not scroll and it does not grow. `TEAM_VISIBLE_ROWS` is what fits, measured;
 * a roster strip opened under a team therefore has to be paid for out of that budget
 * (`TEAM_EXPANDED_ROW_COST`). A `slice(0, cap)` alone gets that half right and then loses the rows
 * the organizer actually asked about: open rank 7, the cap drops, and rank 7 walks off the bottom
 * of the board taking its own breakdown with it.
 *
 * So the window is: every open team, plus as much of the top of the table as still fits. When all
 * open teams are already inside the top of the table nothing else happens. When one is below the
 * cut, it replaces a collapsed row near the bottom and the ranks themselves show the jump:
 * `1 2 3` then `7`. The rank column is the first thing on the row and it is a numeral, so the
 * discontinuity remains legible. `jumped` lets the caller say it in words in the footnote too.
 *
 * Pure, and separate from the component, because the failure it prevents is silent: a board that
 * draws one row too many clips it against an `overflow: hidden` and still prints a footnote saying
 * it showed them all. That has happened here before (ten claimed, five drawn). Arithmetic that can
 * be unit-tested is the only kind that cannot regress quietly.
 */

export interface DrawnRows {
  /** Indices into the ranked list, in draw order. Always ascending. */
  readonly indices: readonly number[];
  /** At least one open team was pulled up from below the cut. */
  readonly jumped: boolean;
}

/**
 * Member rows per team row of height.
 *
 * RE-MEASURED after the breakdown became child cards (each value in its own bordered box with a
 * gap around it — the organizer's third design). The boxes cost real height: a member row went
 * from a third of a team row to about half of one. Measured on this commit with the stage's
 * pinned card metrics (`--member-gap-y: 0.12em`, `.stage .cellBox` at 1.45em):
 * 1280×720 measures 65px/27.6px (ratio 2.36), 1920×1080 measures 93px/41.1px (ratio 2.26, the
 * binding one) — so 2 is the conservative bound on both canvases, and a full 4-row block
 * measures 164.7px against the 186px two team rows buy at 1080. The old value of 3 would let
 * `memberBlockBudget` hand out blocks the wall cannot hold, and the overflow clips the bottom
 * team silently.
 */
export const MEMBER_ROWS_PER_TEAM_ROW = 2;

/** The measured full-size block: `TEAM_EXPANDED_ROW_COST` team rows' worth of member rows. */
export const MEMBER_ROWS_FULL_BLOCK = 4;

/** The remainder row plus the pool row — the smallest block that still reconciles. */
export const MEMBER_ROWS_MIN_BLOCK = 2;

/**
 * How many rows one open team's breakdown may occupy — members, remainder and pool together —
 * given how many breakdowns are open at once.
 *
 * ## Why the block SHRINKS instead of the board scrolling
 *
 * The wall's whole budget is `maxRows` team rows, and a member row measures half a team row
 * (see `MEMBER_ROWS_PER_TEAM_ROW` for the child-card measurements). One open team therefore fits
 * a 4-row block by giving up two team rows (`TEAM_EXPANDED_ROW_COST`), and two open teams still
 * balance: 3 team rows + 8 member rows = 7.
 *
 * Three do not. 3 team rows + 3 four-row blocks is 9 team rows of height on a 7-row wall, and the
 * board's only escape used to be vertical scroll — measured 894px of table against a 794px canvas
 * at 1920×1080, on a screen nobody can scroll. So beyond the break-even point the BLOCKS pay
 * instead of the wall: the leftover height under the drawn team rows is split evenly between the
 * open teams, and `TeamRosterStrip`'s remainder row keeps every shorter block reconciling with the
 * team row above it.
 *
 * The floor is 2, because that is the smallest complete block — the "N more players" row and the
 * pool row — below which the breakdown stops adding up. When even 2-row blocks cannot fit (four
 * or more open teams on this geometry), the board scrolls rather than clipping open content; that
 * case is unreachable by clicking on a 9-team field, because the drawn set converges to the open
 * set at three.
 *
 * @param maxRows        the wall's measured team-row budget (`TEAM_VISIBLE_ROWS`)
 * @param drawnTeamCount how many team rows are actually drawn (from `drawnTeamRows`)
 * @param openCount      how many breakdowns are open
 */
export function memberBlockBudget(
  maxRows: number,
  drawnTeamCount: number,
  openCount: number,
): number {
  if (openCount <= 0) return MEMBER_ROWS_FULL_BLOCK;
  const spareMemberRows = Math.max(0, maxRows - drawnTeamCount) * MEMBER_ROWS_PER_TEAM_ROW;
  const perTeam = Math.floor(spareMemberRows / openCount);
  return Math.min(MEMBER_ROWS_FULL_BLOCK, Math.max(MEMBER_ROWS_MIN_BLOCK, perTeam));
}

/**
 * @param total       how many teams the payload ranks
 * @param cap         how many team rows fit right now, every open roster already deducted
 * @param openIndices indices of all open teams
 */
export function drawnTeamRows(
  total: number,
  cap: number,
  openIndices: readonly number[],
): DrawnRows {
  const validOpen = [...new Set(openIndices)]
    .filter((index) => index >= 0 && index < total)
    .sort((a, b) => a - b);

  /*
   * All open teams remain drawn. The caller normally makes `cap` at least this large; keeping the
   * invariant here as well prevents a stale measurement from making a visibly open control point
   * at a roster that vanished below the cut. In that extreme case the board becomes scrollable.
   */
  const rows = Math.max(0, Math.min(total, Math.max(cap, validOpen.length)));
  const chosen = new Set(validOpen);

  for (let index = 0; index < total && chosen.size < rows; index += 1) {
    chosen.add(index);
  }

  const indices = [...chosen].sort((a, b) => a - b);
  const jumped = indices.some((index, position) => index !== position);
  return { indices, jumped };
}
