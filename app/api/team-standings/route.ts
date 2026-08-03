import type { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { NO_STORE, handle, jsonOk } from "@/lib/contest/http";
import { getTeamStandings } from "@/lib/contest/standings";
import { viewerFromRequest } from "@/lib/contest/viewer";

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

/**
 * The contest on the wall: the one whose window contains NOW, then RUNNING before FROZEN.
 *
 * `orderBy: startsAt desc` alone picked the most recently STARTING contest, with no guard that it
 * had started at all. Observed on the projector, opened the way it is opened on the night with no
 * query string: it showed "LIVE", a countdown of 472:45:08 — nineteen days — and "No teams yet",
 * because it had resolved to a contest scheduled for a fortnight away while the real one ran
 * beside it. An organizer then froze the live contest and the wall neither froze nor changed.
 *
 * Two contests can legitimately be RUNNING at once: a rehearsal left open, last year's board never
 * ended, a seeded demo beside the real thing. "Is it on right now" is a fact about the clock, and
 * it is the only question a screen on a wall can be asking.
 */
async function currentContestId(now: Date): Promise<string> {
  const live = await prisma.contest.findFirst({
    where: {
      state: { in: ["RUNNING", "FROZEN"] },
      startsAt: { lte: now },
      endsAt: { gt: now },
      // Same rule as /api/standings: the permanent arena must never win the wall's default.
      isPractice: false,
    },
    // RUNNING before FROZEN on a tie, then the one that started most recently.
    orderBy: [{ state: "asc" }, { startsAt: "desc" }],
    select: { id: true },
  });
  if (live !== null) return live.id;

  /*
    Nothing is inside its window. Fall back to the most recent RUNNING/FROZEN contest anyway,
    rather than refusing — a contest whose end time has passed but which nobody has ENDED is the
    normal state of the board during the awards, and blanking the wall at exactly that moment
    would be worse than showing a contest that is over.
  */
  const recent = await prisma.contest.findFirst({
    where: { state: { in: ["RUNNING", "FROZEN"] }, isPractice: false },
    orderBy: [{ state: "asc" }, { startsAt: "desc" }],
    select: { id: true },
  });
  if (recent === null) {
    throw new NotFoundError("No contest is running. Open the projector with ?contestId=<id>");
  }
  return recent.id;
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const params = new URL(request.url).searchParams;
    const requested = params.get("contest") ?? params.get("contestId");
    const contestId =
      requested !== null && requested.length > 0 ? requested : await currentContestId(now);
    const viewer = await viewerFromRequest(request, now);

    // NO_STORE, matching both siblings: the response DIFFERS BY VIEWER — an organizer sees through
    // a freeze and nobody else does — so a shared cache would eventually serve an admin's unfrozen
    // board to the room.
    return jsonOk(await getTeamStandings(contestId, viewer, now), NO_STORE);
  });
}
