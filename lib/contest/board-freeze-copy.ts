import { formatEventTime } from "@/lib/contest/event-time";

/**
 * The words every screen uses for the state of the board: /standings, /team, the lobby's team
 * card, and the projector.
 *
 * One module, because a student in another room and the wall in the main room must never disagree
 * about whether the board is frozen, and the easiest way for them to disagree is for each screen
 * to write its own sentence. No em dashes and no middle dots, by the organizer's request.
 */

/** "Board frozen at 8:00 PM", in Indiana time. */
export function boardFrozenTitle(frozenAt: string | Date): string {
  const at = frozenAt instanceof Date ? frozenAt : new Date(frozenAt);
  if (Number.isNaN(at.getTime())) return "Board frozen";
  return `Board frozen at ${formatEventTime(at)}`;
}

export const BOARD_FROZEN_EXPLANATION =
  "Rankings stopped updating so the final result is a surprise. Points scored after this are still counted and appear when the organizers reveal the final standings.";

export const SUBMISSIONS_CLOSED_LINE = "Submissions are closed.";

export const FINAL_STANDINGS_TITLE = "Final standings";

/**
 * Whether the window has closed, by the server's clock.
 *
 * End moves `endsAt` to the moment it was pressed (`planEndNow`), so a contest ended early reads
 * as closed here too. The practice arena has no end that means anything.
 */
export function submissionsClosedAt(
  board: { readonly endsAt: string; readonly isPractice: boolean },
  nowMs: number,
): boolean {
  if (board.isPractice) return false;
  const endsMs = Date.parse(board.endsAt);
  return !Number.isNaN(endsMs) && nowMs >= endsMs;
}
