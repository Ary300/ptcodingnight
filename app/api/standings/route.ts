import type { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { NO_STORE, handle, jsonOk } from "@/lib/contest/http";
import { getStandings } from "@/lib/contest/standings";
import { viewerFromRequest } from "@/lib/contest/viewer";

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

/** RUNNING first, then FROZEN, so the board stays up through the freeze before the reveal. */
async function currentContestId(): Promise<string> {
  const contest = await prisma.contest.findFirst({
    where: { state: { in: ["RUNNING", "FROZEN"] } },
    orderBy: { startsAt: "desc" },
    select: { id: true },
  });

  if (contest === null) {
    throw new NotFoundError("No contest is running. Open the projector with ?contestId=<id>");
  }
  return contest.id;
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const requested = new URL(request.url).searchParams.get("contestId");
    const contestId = requested !== null && requested.length > 0 ? requested : await currentContestId();
    const viewer = await viewerFromRequest(request, now);

    return jsonOk(await getStandings(contestId, viewer, now), NO_STORE);
  });
}
