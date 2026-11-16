import { DomainError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { AUDIT_ACTIONS, writeAudit, type Db } from "@/lib/contest/audit";
import { sameAwardSource } from "@/lib/contest/award-source";
import { isPublicBoardFrozen, type ContestGateInput } from "@/lib/contest/gate";
import { formatEventTime } from "@/lib/contest/event-time";
import { lockContestMutations } from "@/lib/contest/locks";
import { invalidateScoringInput } from "@/lib/contest/standings";

/**
 * Hand-typed awards: the paper puzzles and the Kahoot placing.
 *
 * These are the only score inputs with no submission behind them, so each one has to say where
 * its points came from. The organizers' words: "it would be good if we could identify the
 * puzzle/Kahoot like where the actual points came from". The source lives in `label`, which the
 * entry screen composes as the activity plus, optionally, the seat or student it is for:
 * "Sudoku, seat A, Avery Brooks", or just "Kahoot". No new column: a label is already what every
 * breakdown, export and audit row shows.
 *
 * ## Edits and removals are allowed, and every one is audited
 *
 * This file used to forbid both, and asked for a negative entry as the only correction. With five
 * puzzles per team plus a Kahoot placing, a typo then becomes two rows on the breakdown that the
 * room has to add up in its head. So an award can be edited or removed, in one transaction with
 * an `AuditLog` row carrying the before and after, which keeps the record a negative entry kept.
 * While the public board is frozen, an award it already counts cannot change its points or be
 * removed (`changeWouldMoveFrozenBoard`); one entered after the freeze, such as the Kahoot, can.
 *
 * ## A second award with the same source is refused until it is confirmed
 *
 * Two organizers on two laptops typing the same team's sudoku is the likely mistake, and it is
 * invisible in a total. `addSideActivity` refuses an award whose label matches one the team
 * already holds, naming the existing one, unless the caller confirms. The rule is the label
 * compared after trimming, collapsing spaces and folding case (`sameAwardSource`), so "Sudoku,
 * seat A" and "sudoku,  seat a" are the same award and "Sudoku, seat B" is not.
 */

/** Bounded in both directions, so a typo of 8000 for 80 cannot silently decide the contest. */
export const SIDE_ACTIVITY_POINT_LIMIT = 1000;

export { normalizeAwardSource, sameAwardSource } from "@/lib/contest/award-source";

export interface SideActivityRow {
  readonly id: string;
  readonly label: string;
  readonly points: number;
  readonly enteredBy: string;
  readonly enteredAt: string;
}

export interface TeamSideActivities {
  readonly teamId: string;
  readonly teamName: string;
  readonly total: number;
  readonly activities: readonly SideActivityRow[];
}

const ROW_SELECT = {
  id: true,
  label: true,
  points: true,
  enteredBy: true,
  enteredAt: true,
} as const;

function toRow(row: {
  id: string;
  label: string;
  points: number;
  enteredBy: string;
  enteredAt: Date;
}): SideActivityRow {
  return {
    id: row.id,
    label: row.label,
    points: row.points,
    enteredBy: row.enteredBy,
    enteredAt: row.enteredAt.toISOString(),
  };
}

function summarize(team: {
  id: string;
  name: string;
  sideActivities: readonly Parameters<typeof toRow>[0][];
}): TeamSideActivities {
  return {
    teamId: team.id,
    teamName: team.name,
    total: team.sideActivities.reduce((sum, activity) => sum + activity.points, 0),
    activities: team.sideActivities.map(toRow),
  };
}

const ACTIVITY_ORDER = [{ enteredAt: "asc" as const }, { id: "asc" as const }];

/** One team's awards, oldest first. */
export async function teamSideActivities(teamId: string): Promise<TeamSideActivities> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      sideActivities: { select: ROW_SELECT, orderBy: ACTIVITY_ORDER },
    },
  });
  if (team === null) throw new NotFoundError("Team");
  return summarize(team);
}

/**
 * Every team's awards in one contest: the breakdown behind the Puzzle column on the organizer's
 * awards screen. Teams in name order, awards oldest first, so the list never reshuffles.
 */
export async function contestSideActivities(
  contestId: string,
): Promise<readonly TeamSideActivities[]> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: {
      teams: {
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          sideActivities: { select: ROW_SELECT, orderBy: ACTIVITY_ORDER },
        },
      },
    },
  });
  if (contest === null) throw new NotFoundError("Contest");
  return contest.teams.map(summarize);
}

export interface SideActivityInput {
  readonly label: string;
  readonly points: number;
}

/**
 * Record one award. Refused with CONFLICT when the team already holds an award with the same
 * source, unless `confirmDuplicate` says the organizer has seen that and means it.
 */
export async function addSideActivity(
  teamId: string,
  input: SideActivityInput & { readonly confirmDuplicate?: boolean },
  actor: string,
): Promise<{ readonly row: SideActivityRow; readonly teamId: string }> {
  const owner = await prisma.team.findUnique({ where: { id: teamId }, select: { contestId: true } });
  if (owner === null) throw new NotFoundError("Team");

  // One transaction: an award without its audit row is exactly the state this feature exists to
  // prevent, since the audit row is the only evidence the award ever happened.
  const row = await prisma.$transaction(async (tx) => {
    await lockContestMutations(tx, owner.contestId);
    const team = await tx.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        name: true,
        sideActivities: { select: ROW_SELECT, orderBy: ACTIVITY_ORDER },
      },
    });
    if (team === null) throw new NotFoundError("Team");

    // Checked under the contest lock, so two laptops entering the same award at the same moment
    // cannot both pass it.
    const existing = team.sideActivities.find((activity) =>
      sameAwardSource(activity.label, input.label),
    );
    if (existing !== undefined && input.confirmDuplicate !== true) {
      throw new DomainError(
        "CONFLICT",
        `${team.name} already has ${existing.label} for ${signed(existing.points)}, entered at ` +
          `${formatEventTime(existing.enteredAt)}. Edit that award instead, or record this one ` +
          "as well if the team really earned it twice.",
      );
    }

    const created = await tx.teamSideActivity.create({
      data: {
        teamId: team.id,
        label: input.label,
        points: input.points,
        enteredBy: actor,
        enteredAt: new Date(),
      },
      select: ROW_SELECT,
    });

    await writeAudit(
      {
        actor,
        action: AUDIT_ACTIONS.sideActivity,
        entity: `team:${team.id}`,
        after: {
          sideActivityId: created.id,
          label: created.label,
          points: created.points,
          team: team.name,
          ...(existing === undefined ? {} : { confirmedDuplicateOf: existing.id }),
        },
      },
      tx,
    );
    return created;
  });

  // The board is stale the instant this lands, and side activity points are part of the team
  // score, so the cached scoring input has to go.
  invalidateScoringInput(owner.contestId);
  return { row: toRow(row), teamId };
}

/**
 * A frozen public board is computed from the awards entered up to the freeze. Changing or removing
 * one of THOSE would move the board the room is watching, which is the one thing the freeze
 * promises will not happen. Awards entered after the freeze (the Kahoot, a late puzzle) are not on
 * it, so they stay free to fix. Pure, so the rule is testable on its own.
 */
export function changeWouldMoveFrozenBoard(
  contest: ContestGateInput,
  enteredAt: Date,
  now: Date,
): boolean {
  return (
    isPublicBoardFrozen(contest, now) &&
    contest.freezeAt !== null &&
    enteredAt.getTime() <= contest.freezeAt.getTime()
  );
}

const FROZEN_BOARD_REFUSAL =
  "This award is on the frozen public board, so changing it now would move the board. " +
  "Change it after Unfreeze and reveal, or enter a separate award with negative points now.";

async function assertBoardStaysStill(db: Db, contestId: string, enteredAt: Date): Promise<void> {
  const contest = await db.contest.findUnique({
    where: { id: contestId },
    select: { state: true, startsAt: true, endsAt: true, freezeAt: true },
  });
  if (contest !== null && changeWouldMoveFrozenBoard(contest, enteredAt, new Date())) {
    throw new DomainError("CONFLICT", FROZEN_BOARD_REFUSAL);
  }
}

async function ownedActivity(teamId: string, activityId: string) {
  const activity = await prisma.teamSideActivity.findUnique({
    where: { id: activityId },
    select: { teamId: true, team: { select: { contestId: true } } },
  });
  // An id from another team is the same answer as an unknown id: the URL names both.
  if (activity === null || activity.teamId !== teamId) throw new NotFoundError("Award");
  return { contestId: activity.team.contestId };
}

/** Change an award's source or points. The audit row keeps what it said before. */
export async function editSideActivity(
  teamId: string,
  activityId: string,
  input: Partial<SideActivityInput>,
  actor: string,
): Promise<SideActivityRow> {
  const { contestId } = await ownedActivity(teamId, activityId);

  const row = await prisma.$transaction(async (tx) => {
    await lockContestMutations(tx, contestId);
    const before = await tx.teamSideActivity.findUnique({
      where: { id: activityId },
      select: { ...ROW_SELECT, teamId: true, team: { select: { name: true } } },
    });
    if (before === null || before.teamId !== teamId) throw new NotFoundError("Award");
    // A puzzle's award is found again by its label when it is removed, which is what un-solves the
    // puzzle so the team can earn it again. A renamed one would leave the solve behind for good.
    if (
      before.enteredBy === "puzzle" &&
      input.label !== undefined &&
      input.label !== before.label
    ) {
      throw new DomainError(
        "CONFLICT",
        "An award from a solved puzzle keeps its name. Change its points, or remove it and the puzzle opens again for that team.",
      );
    }
    // Renaming never moves a total, so only a change of points is held back by the freeze.
    if (input.points !== undefined && input.points !== before.points) {
      await assertBoardStaysStill(tx, contestId, before.enteredAt);
    }

    const updated = await tx.teamSideActivity.update({
      where: { id: activityId },
      data: {
        ...(input.label === undefined ? {} : { label: input.label }),
        ...(input.points === undefined ? {} : { points: input.points }),
      },
      select: ROW_SELECT,
    });

    await writeAudit(
      {
        actor,
        action: AUDIT_ACTIONS.sideActivityEdited,
        entity: `team:${teamId}`,
        before: { sideActivityId: before.id, label: before.label, points: before.points },
        after: {
          sideActivityId: updated.id,
          label: updated.label,
          points: updated.points,
          team: before.team.name,
        },
      },
      tx,
    );
    return updated;
  });

  invalidateScoringInput(contestId);
  return toRow(row);
}

/**
 * Remove an award. The audit row keeps the whole of it, so the record of what was entered and
 * by whom survives the removal.
 *
 * An award the on-site puzzle checker made ("Puzzle: <title>", entered by "puzzle") is paired
 * with a solve row, and the solve is what stops a team being paid twice. Removing the award alone
 * would leave the team marked as having solved it with nothing paid and no way to earn it again,
 * so the matching solve goes too and the team can answer again.
 */
export async function removeSideActivity(
  teamId: string,
  activityId: string,
  actor: string,
): Promise<void> {
  const { contestId } = await ownedActivity(teamId, activityId);

  await prisma.$transaction(async (tx) => {
    await lockContestMutations(tx, contestId);
    const before = await tx.teamSideActivity.findUnique({
      where: { id: activityId },
      select: { ...ROW_SELECT, teamId: true, team: { select: { name: true } } },
    });
    if (before === null || before.teamId !== teamId) throw new NotFoundError("Award");
    await assertBoardStaysStill(tx, contestId, before.enteredAt);

    await tx.teamSideActivity.delete({ where: { id: activityId } });

    if (before.enteredBy === "puzzle" && before.label.startsWith("Puzzle: ")) {
      const title = before.label.slice("Puzzle: ".length);
      await tx.puzzleSolve.deleteMany({ where: { teamId, puzzle: { title } } });
    }

    await writeAudit(
      {
        actor,
        action: AUDIT_ACTIONS.sideActivityRemoved,
        entity: `team:${teamId}`,
        before: {
          sideActivityId: before.id,
          label: before.label,
          points: before.points,
          enteredBy: before.enteredBy,
          enteredAt: before.enteredAt.toISOString(),
          team: before.team.name,
        },
      },
      tx,
    );
  });

  invalidateScoringInput(contestId);
}

function signed(points: number): string {
  return points > 0 ? `+${String(points)}` : String(points);
}
