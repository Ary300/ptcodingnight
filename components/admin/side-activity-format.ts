/**
 * The small pure pieces of the side-activity screen, kept apart so they are testable without a
 * browser and so the entry form and the history table say things the same way.
 */

/** What the night's typed awards are for. "Another puzzle" asks for the puzzle's name. */
export const AWARD_SOURCES = ["Sudoku", "Another puzzle", "Kahoot"] as const;
export type AwardSource = (typeof AWARD_SOURCES)[number];

/**
 * The Kahoot payout, by finishing place. A suggestion the organizer reads before typing; the
 * points field takes whatever they decide, and `lib/scoring/` never learns Kahoot exists.
 */
export const KAHOOT_HINT =
  "Suggested: 60 for first, 40 for second, 20 for third, 10 for every other team that played.";

export function isKahoot(activity: string): boolean {
  return activity.trim().toLowerCase() === "kahoot";
}

/**
 * The label an award is stored under: what it was for, then who on the team it was for when
 * that matters. "Sudoku, seat A, Avery Brooks". This one string is the award's source on every
 * screen, the export and the audit log, and it is what the duplicate warning compares.
 */
export function composeAwardLabel(activity: string, forWhom: string): string {
  const what = activity.trim();
  const who = forWhom.trim();
  return who === "" ? what : `${what}, ${who}`;
}

/** "Seat A, Avery Brooks", or the name alone for a student with no set yet. */
export function seatLabel(setLabel: string | null, displayName: string): string {
  return setLabel === null ? displayName : `seat ${setLabel}, ${displayName}`;
}

/** Signed and whole, everywhere: the sign is the whole meaning of a negative award. */
export function signedPoints(value: number): string {
  return value > 0 ? `+${String(value)}` : String(value);
}

export function pointsWord(value: number): string {
  return Math.abs(value) === 1 ? "point" : "points";
}

/**
 * Who entered an award, as a role and nothing more.
 *
 * `actorLabel()` writes `admin:<sessionId>`, the on-site checker writes `puzzle`. The screen used
 * to print the tail of the session id and, for screen readers, the whole raw value ("Organizer
 * ...qf1638, session admin:cmwj..."). A session id is an internal reference nobody at the desk can
 * act on, so the column says the role and the row's entry time says when. The audit log keeps
 * the full actor.
 */
export function actorRole(enteredBy: string): string {
  const separator = enteredBy.indexOf(":");
  if (separator === -1) return enteredBy === "puzzle" ? "Puzzle checker" : "Organizer";
  return enteredBy.slice(0, separator) === "participant" ? "Competitor" : "Organizer";
}
