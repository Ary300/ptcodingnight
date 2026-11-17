import type { ContestState } from "@prisma/client";

import { prisma } from "@/lib/db";

/**
 * What a bare `/api/standings` answers with its 404 when nothing is live. It read "Open the
 * projector with ?contestId=<id> not found", a URL template with the error class's suffix glued on.
 */
export const NOTHING_RUNNING_MESSAGE =
  "No contest is running right now. Open the projector from a contest to show its board.";

const LIVE_STATES: readonly ContestState[] = ["RUNNING", "FROZEN"];

/**
 * The contest on the wall: the one whose window contains NOW, else the most recent live one.
 *
 * Shared by `/api/standings` and `/api/team-standings`, which each carried a copy of this query and
 * both ranked RUNNING above FROZEN. A freeze is a running contest with the public board held still,
 * so ranking by state let a rehearsal left RUNNING beside the real, FROZEN contest take the wall
 * at exactly the moment the room is waiting on the reveal. RUNNING and FROZEN are now equal, and
 * the tie goes to the contest that started most recently. One function means the individual board
 * and the team board can no longer pick different contests.
 *
 * `orderBy: startsAt desc` alone, with no window guard, once picked a contest scheduled for a
 * fortnight away; the window filter comes first for that reason. The practice arena is excluded
 * because its window always contains now; `?contestId=` still pins it.
 *
 * Null when nothing is live. Each route decides what that means on its own screen.
 */
export async function currentWallContestId(now: Date): Promise<string | null> {
  const live = await prisma.contest.findFirst({
    where: {
      state: { in: [...LIVE_STATES] },
      startsAt: { lte: now },
      endsAt: { gt: now },
      isPractice: false,
    },
    orderBy: [{ startsAt: "desc" }, { id: "asc" }],
    select: { id: true },
  });
  if (live !== null) return live.id;

  // Past its end and never ENDED is the normal state of the board during the awards, and blanking
  // the wall at exactly that moment would be worse than showing a contest that is over.
  const recent = await prisma.contest.findFirst({
    where: { state: { in: [...LIVE_STATES] }, isPractice: false },
    orderBy: [{ startsAt: "desc" }, { id: "asc" }],
    select: { id: true },
  });
  return recent?.id ?? null;
}
