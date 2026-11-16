import type { NextResponse } from "next/server";

import { ContestIdParamsSchema, handle, jsonOkRevalidated, readParams } from "@/lib/contest/http";
import { getTeamStandings, reconcileClockFromBoard } from "@/lib/contest/standings";
import { viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `GET /api/contests/{id}/team-standings` — the board Coding Night ranks by.
 *
 * No login required: the projector has none (docs/PRD.md §4). Which is exactly why the response is
 * limited to rank, team name, score, the arithmetic behind it, and each member's own points — a
 * spectator may see a player's total, and must not see anything they submitted.
 *
 * An organizer calling this sees live truth; everyone else sees the frozen board while a freeze is
 * on. That distinction lives in `getTeamStandings`, keyed off the viewer, so no route can leak an
 * unfrozen board by forgetting a parameter.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id } = await readParams(context.params, ContestIdParamsSchema);
    const viewer = await viewerFromRequest(request, now);

    // The projector polls this every five seconds, which makes it a clock the room is watching:
    // when the window says the contest should have started or ended, this poll makes it true.
    await reconcileClockFromBoard(id, now);

    // Never in a SHARED cache, matching the individual board: the response DIFFERS BY VIEWER — an
    // organizer sees through a freeze and nobody else does. `jsonOkRevalidated` is private,
    // revalidated on every request and tagged with a hash of this viewer's bytes, so an unchanged
    // board costs a 304 and nothing else changes.
    return jsonOkRevalidated(request, await getTeamStandings(id, viewer, now));
  });
}
