/**
 * Which team rows the projector draws, once one of them has been opened.
 *
 * ## Why this is arithmetic and not a `slice`
 *
 * The projector does not scroll and it does not grow. `TEAM_VISIBLE_ROWS` is what fits, measured;
 * a roster strip opened under a team therefore has to be paid for out of that budget
 * (`TEAM_EXPANDED_ROW_COST`). A `slice(0, cap)` alone gets that half right and then loses the one
 * row the organizer actually asked about: open rank 7, the cap drops to 5, and rank 7 walks off the
 * bottom of the board taking its own breakdown with it.
 *
 * So the window is: the top of the table, plus the open team wherever it ranks. When the open team
 * is already inside the top of the table nothing else happens. When it is below the cut, one more
 * row is given up so the open team can be drawn in its place, and the ranks themselves show the
 * jump: `1 2 3 4` then `7`. The rank column is the first thing on the row and it is a numeral, so
 * the discontinuity is legible from the back of a room without a rule, a colour or an ellipsis row
 * costing another line. `jumped` lets the caller say it in words in the footnote as well, because a
 * number that skips is a fact the board should state rather than leave to be noticed.
 *
 * Pure, and separate from the component, because the failure it prevents is silent: a board that
 * draws one row too many clips it against an `overflow: hidden` and still prints a footnote saying
 * it showed them all. That has happened here before (ten claimed, five drawn). Arithmetic that can
 * be unit-tested is the only kind that cannot regress quietly.
 */

export interface DrawnRows {
  /** Indices into the ranked list, in draw order. Always ascending. */
  readonly indices: readonly number[];
  /** The open team was pulled up from below the cut, so the drawn ranks are not contiguous. */
  readonly jumped: boolean;
}

/**
 * @param total    how many teams the payload ranks
 * @param cap      how many rows fit right now, expansion already deducted
 * @param openIndex index of the open team, or null when the board is fully collapsed
 */
export function drawnTeamRows(
  total: number,
  cap: number,
  openIndex: number | null,
): DrawnRows {
  const rows = Math.max(0, Math.min(cap, total));

  // Out of range is treated as closed rather than clamped. A stale id (the team was deleted
  // between polls) must not silently pin some OTHER team's breakdown open on the wall.
  const open =
    openIndex !== null && openIndex >= 0 && openIndex < total ? openIndex : null;

  if (open === null || open < rows) {
    return { indices: range(0, rows), jumped: false };
  }

  // The open team is below the cut. It replaces the last row of the window rather than being
  // appended to it, because appending is exactly the "one row too many" that clips.
  return { indices: [...range(0, Math.max(0, rows - 1)), open], jumped: true };
}

function range(from: number, to: number): readonly number[] {
  const out: number[] = [];
  for (let at = from; at < to; at += 1) out.push(at);
  return out;
}
