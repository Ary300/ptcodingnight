import type { NextResponse } from "next/server";

import { DomainError } from "@/lib/errors";
import { handle, jsonOkRevalidated } from "@/lib/contest/http";
import { getStandings } from "@/lib/contest/standings";
import { boardViewerFromRequest } from "@/lib/contest/viewer";
import { NOTHING_RUNNING_MESSAGE, currentWallContestId } from "@/lib/contest/wall-contest";
import { standingsForViewer } from "@/lib/contest/standings-visibility";

/**
 * `GET /api/standings?contestId=<id>` — the spectator board.
 *
 * The one deliberately un-scoped read route, and the reason is physical: this is what the
 * projector on the wall polls. That screen has no login (PRD §9.3) and nobody types a contest
 * id into it — an organizer opens it and the room expects to see whatever contest is running
 * right now. "The running contest" is the correct semantic for a screen in a room, not hidden
 * state.
 *
 * `?contestId=` still pins a specific contest, which is what the admin awards screen links to
 * when showing a finished board. Every other read is contest-scoped, because those callers
 * already know which contest they are in.
 *
 * Returns exactly what the scoped route returns, through the same service — freeze is applied
 * by computing the board as-of an instant, never by filtering afterwards.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const requested = new URL(request.url).searchParams.get("contestId");
    const contestId =
      requested !== null && requested.length > 0 ? requested : await currentWallContestId(now);
    if (contestId === null) throw new DomainError("NOT_FOUND", NOTHING_RUNNING_MESSAGE);
    const viewer = await boardViewerFromRequest(request, now);

    // Rows withheld from a signed-in student; see `standingsForViewer`.
    return jsonOkRevalidated(
      request,
      standingsForViewer(await getStandings(contestId, viewer, now), viewer),
    );
  });
}
