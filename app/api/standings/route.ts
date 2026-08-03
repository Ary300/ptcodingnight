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
      // The practice arena is always inside its window - that is what makes it permanent - and
      // a wall that defaulted to it would show the practice board on contest night. Pinning the
      // arena explicitly with ?contestId= still works.
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
    const requested = new URL(request.url).searchParams.get("contestId");
    const contestId = requested !== null && requested.length > 0 ? requested : await currentContestId(now);
    const viewer = await viewerFromRequest(request, now);

    return jsonOk(await getStandings(contestId, viewer, now), NO_STORE);
  });
}
