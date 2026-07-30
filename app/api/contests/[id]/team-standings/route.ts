import type { NextResponse } from "next/server";

import { ContestIdParamsSchema, NO_STORE, handle, jsonOk, readParams } from "@/lib/contest/http";
import { getTeamStandings } from "@/lib/contest/standings";
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

    // NO_STORE, matching the individual board: the response DIFFERS BY VIEWER — an organizer sees
    // through a freeze and nobody else does — so a shared cache would eventually serve an admin's
    // unfrozen board to the room.
    return jsonOk(await getTeamStandings(id, viewer, now), NO_STORE);
  });
}
