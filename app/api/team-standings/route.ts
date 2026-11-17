import type { NextResponse } from "next/server";

import { NO_STORE, handle, jsonOk, jsonOkRevalidated } from "@/lib/contest/http";
import { getTeamStandings } from "@/lib/contest/standings";
import { boardViewerFromRequest } from "@/lib/contest/viewer";
import { currentWallContestId } from "@/lib/contest/wall-contest";

/**
 * `GET /api/team-standings?contest=<id>` — the spectator TEAM board.
 *
 * The un-scoped twin of `/api/contests/{id}/team-standings`, and it exists for the same physical
 * reason `/api/standings` does: this is what the screen on the wall polls. That screen has no
 * login (PRD §9.3) and nobody types a contest id into it — an organizer opens `/projector` and
 * the room expects whichever contest is running right now.
 *
 * Its absence was not a missing convenience, it was a dark projector. Teams are the DEFAULT board
 * (PRD §6.1), the individual board had an un-scoped route and the team board did not, so a bare
 * `/projector` had nothing to fetch and painted an instruction to go and edit the URL — on the one
 * screen in the building nobody is standing at.
 *
 * Both spellings of the parameter are accepted. `/api/standings` takes `?contestId=` while
 * `/projector` takes `?contest=`, and a mismatch between a page's query string and its API's is
 * the invisible kind: the wrong spelling is not rejected, it is IGNORED, and the caller silently
 * gets the running contest instead of the one they asked for.
 *
 * Everything else — what may appear, and how the freeze applies — is `getTeamStandings`, shared
 * with the scoped route. No route decides on its own who may see through a freeze.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const params = new URL(request.url).searchParams;
    const requested = params.get("contest") ?? params.get("contestId");
    const contestId =
      requested !== null && requested.length > 0 ? requested : await currentWallContestId(now);

    /*
      Nothing running is a STATE of the wall, not an error: `data: null`, with a 200.

      It was a 404 whose message was a URL template, and the projector printed it verbatim: "Open
      the projector with ?contestId=<id> not found", with a 404 in the console of the one machine
      everybody can see. The wall says what is true in its own words instead, and keeps polling,
      so it picks the contest up the moment one opens.
    */
    if (contestId === null) return jsonOk(null, NO_STORE);

    const viewer = await boardViewerFromRequest(request, now);

    // Never in a SHARED cache, matching both siblings: the response DIFFERS BY VIEWER — an organizer
    // sees through a freeze and nobody else does. See `jsonOkRevalidated`.
    return jsonOkRevalidated(request, await getTeamStandings(contestId, viewer, now));
  });
}
