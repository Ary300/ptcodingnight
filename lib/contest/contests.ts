import { prisma } from "@/lib/db";

import type { AdminContestList } from "@/lib/schemas/api";

/**
 * Enumerating contests for an organizer.
 *
 * Nothing here decides which contest is "current" — that concept does not exist in this
 * application, on purpose. This returns the list; the organizer picks. The only opinion it holds
 * is the ORDER, newest first, because the contest an organizer wants is almost always the one
 * about to run.
 */

/**
 * Every contest, with the two counts that let an organizer tell them apart.
 *
 * Counted with `_count` rather than by loading rows: the roster of a real contest is 40–60
 * participants and this is a picker, not the roster screen.
 *
 * Both counts are derived on every read and never stored. `teamCount` in particular is one field
 * away from a stored team SIZE, which is the mistake this codebase is most careful about — team
 * size is the divisor in every team score, so a count that drifts from its rows is a wrong result
 * rather than a stale label.
 */
export async function listContestsForAdmin(): Promise<AdminContestList> {
  const rows = await prisma.contest.findMany({
    orderBy: [{ startsAt: "desc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      state: true,
      startsAt: true,
      endsAt: true,
      _count: { select: { participants: true, teams: true } },
    },
  });

  return {
    contests: rows.map((row) => ({
      contestId: row.id,
      name: row.name,
      state: row.state,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      participantCount: row._count.participants,
      teamCount: row._count.teams,
    })),
  };
}

/**
 * A contest's name, for a screen that has its id and needs to say which contest it is showing.
 *
 * Returns null rather than throwing on a missing contest: the caller is a page rendering a
 * contest id out of a URL somebody may have edited, and a 500 is the wrong answer to "that
 * contest does not exist".
 */
export async function contestNameFor(contestId: string): Promise<string | null> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: { name: true },
  });
  return contest?.name ?? null;
}
