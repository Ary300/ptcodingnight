import type { StandingsResponse } from "@/lib/schemas/api";

import type { Viewer } from "./viewer";

/**
 * The individual board, as a given viewer may read it.
 *
 * The organizers decided (2026-11-17) that a student sees individual scores only inside their own
 * team. The individual board ranks every student in the contest, so a signed-in competitor gets
 * it with no rows: the shape is kept, because the competitor header still reads `startsAt` and
 * `endsAt` off this response for its countdown, and nothing a student needs is in the rows.
 *
 * An organizer and an anonymous caller are unchanged. The projector's individual tab
 * (`/projector?mode=individual`) runs on an organizer's laptop and sends no cookie, and the
 * awards screen reads it as an organizer.
 *
 * Returns a new object; the input is the memoised board shared by every caller in the same
 * second, so it must never be edited in place.
 */
export function standingsForViewer(board: StandingsResponse, viewer: Viewer): StandingsResponse {
  if (viewer.kind !== "competitor") return board;
  return {
    ...board,
    divisions: board.divisions.map((division) => ({ ...division, rows: [] })),
  };
}
