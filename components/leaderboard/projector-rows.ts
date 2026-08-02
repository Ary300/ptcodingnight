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
