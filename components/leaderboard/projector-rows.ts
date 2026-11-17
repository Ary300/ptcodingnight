/**
 * How tall an open breakdown is on the projector.
 *
 * ## The wall scrolls now, so nothing here rations rows
 *
 * This file used to be a row budget. The wall did not scroll, so every open breakdown was paid
 * for in team rows: open one team and the bottom teams dropped off the board under a footnote
 * reading "Showing top 4 of 9 teams", open three and each breakdown shrank to a "N more players"
 * row. The organizers asked for the opposite in plain words: no cap on teams, every team reachable
 * by scrolling, and opening a team pushes the rows below it down. A team of five in particular
 * must show five players, which the old five-row block could not do (five members plus the pool
 * row is six).
 *
 * What is left is one fact: a breakdown draws every member and the pool row, however many members
 * the largest team has.
 */

/**
 * The smallest block a breakdown is ever given: four members and the pool row. It stays the
 * default for `TeamRosterStrip` so a strip rendered outside the projector keeps its shape.
 */
export const MEMBER_ROWS_FULL_BLOCK = 5;

/**
 * Rows one open breakdown occupies so that NO member is folded into a remainder row: every
 * player of the largest team, plus the pool row.
 *
 * @param playerCounts the roster size of each team on the view
 */
export function rosterBlockRows(playerCounts: readonly number[]): number {
  const largest = playerCounts.reduce((most, count) => Math.max(most, count), 0);
  return Math.max(MEMBER_ROWS_FULL_BLOCK, largest + 1);
}
