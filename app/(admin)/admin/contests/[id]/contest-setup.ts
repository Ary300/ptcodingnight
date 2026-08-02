import { prisma } from "@/lib/db";

/**
 * What a contest still needs before it can run — read once, for the whole contest shell.
 *
 * ## Why this exists at all
 *
 * `setContestState` refuses to publish a contest with no problems in it, with a good sentence
 * explaining why (`lib/contest/contests.ts`). But that sentence only appeared AFTER the organizer
 * pressed Publish, so the first-time flow was: build a contest, guess what to do next, press the
 * one obvious button, and be told no. The facts the API refuses on are cheap to read, so they are
 * read up front and shown as a checklist. Nothing here re-implements the rule — `problemCount`
 * is the same count `setContestState` guards on, so the screen and the refusal cannot disagree.
 *
 * ## Why the numbers are counted, never stored
 *
 * `teamCount` is one careless field away from a stored team SIZE, and team size is the divisor in
 * every team score. Every figure below is derived on read, for the same reason the roster is.
 *
 * ## Why it lives in `app/` rather than `lib/contest/`
 *
 * It is presentation: a checklist for one screen, with no rule of its own. If a second caller ever
 * needs these counts it should move to `lib/contest/contests.ts` beside `listContestsForAdmin`,
 * which is where the contest reads live.
 */

export type ContestState = "DRAFT" | "SCHEDULED" | "RUNNING" | "FROZEN" | "ENDED" | "ARCHIVED";

export interface ContestSetup {
  readonly contestId: string;
  readonly name: string;
  readonly state: ContestState;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly freezeAt: Date | null;
  readonly setSelection: "RANDOM_ASSIGNED" | "PLAYER_CHOOSES" | "ONE_SET_PER_TEAM";
  /** Slots in the line-up. Zero is what `setContestState` refuses to publish. */
  readonly problemCount: number;
  readonly teamCount: number;
  readonly participantCount: number;
  /**
   * Signed in, on no team. Their points are in nobody's pool — a team score is a mean over a
   * roster, so a participant outside every roster scores for no one and is invisible on the board.
   */
  readonly unassignedCount: number;
  /** Players with no Round 1 set. They can open group problems and nothing else. */
  readonly unassignedSetCount: number;
  /** How many divisions this contest has. Zero means division warnings do not apply. */
  readonly divisionCount: number;
  /**
   * Players in no division. Only a warning when the contest HAS divisions: such a player sees
   * only division-null problems, which in a divided contest is usually close to nothing.
   */
  readonly noDivisionCount: number;
}

export async function contestSetup(contestId: string): Promise<ContestSetup | null> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: {
      id: true,
      name: true,
      state: true,
      startsAt: true,
      endsAt: true,
      freezeAt: true,
      setSelection: true,
      _count: {
        select: { contestProblems: true, teams: true, participants: true, divisions: true },
      },
    },
  });
  if (contest === null) return null;

  const [unassigned, unassignedSet, noDivision] = await Promise.all([
    prisma.participant.count({ where: { contestId, teamId: null } }),
    prisma.participant.count({ where: { contestId, chosenSetId: null } }),
    prisma.participant.count({ where: { contestId, divisionId: null } }),
  ]);

  return {
    contestId: contest.id,
    name: contest.name,
    state: contest.state,
    startsAt: contest.startsAt,
    endsAt: contest.endsAt,
    freezeAt: contest.freezeAt,
    setSelection: contest.setSelection,
    problemCount: contest._count.contestProblems,
    teamCount: contest._count.teams,
    participantCount: contest._count.participants,
    unassignedCount: unassigned,
    unassignedSetCount: unassignedSet,
    divisionCount: contest._count.divisions,
    noDivisionCount: noDivision,
  };
}

/**
 * The existing line-up, so the Problems tab opens showing what is already there.
 *
 * `PUT /api/admin/contests/{id}/problems` REPLACES the whole line-up and there is no GET beside
 * it, so `ContestLineup` mounted with an empty basket every time. Opening the tab of a contest
 * that already had six problems showed "Nothing chosen yet", and pressing Save — the only button
 * on the screen — deleted all six. Read on the server and handed down as the initial basket.
 */
export interface LineupSlot {
  readonly problemId: string;
  readonly title: string;
  readonly slotLabel: string;
  readonly basePoints: number;
  readonly round: "INDIVIDUAL" | "GROUP";
  /** Empty for a group problem. The round itself is stored separately and is authoritative. */
  readonly setLabel: string;
  /** Null means every division sees it, which is what `inScope` does with a null row. */
  readonly divisionId: string | null;
}

export async function contestLineup(contestId: string): Promise<readonly LineupSlot[]> {
  const rows = await prisma.contestProblem.findMany({
    where: { contestId },
    // Sorted by a stable key. `slotLabel` alone is not unique in the schema, so `id` breaks the
    // tie — the same rule the standings mapper follows, for the same reason.
    orderBy: [{ slotLabel: "asc" }, { id: "asc" }],
    select: {
      problemId: true,
      slotLabel: true,
      basePoints: true,
      round: true,
      divisionId: true,
      set: { select: { label: true } },
      problem: { select: { title: true } },
    },
  });

  return rows.map((row) => ({
    problemId: row.problemId,
    title: row.problem.title,
    slotLabel: row.slotLabel,
    basePoints: row.basePoints,
    round: row.round,
    setLabel: row.set?.label ?? "",
    divisionId: row.divisionId,
  }));
}
