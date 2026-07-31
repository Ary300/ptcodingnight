import { DomainError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { AUDIT_ACTIONS, writeAudit, type Db } from "@/lib/contest/audit";
import { assignSetForOne } from "@/lib/contest/set-assignment";
import { invalidateScoringInput } from "@/lib/contest/standings";
import { newTeamCode, normaliseTeamCode } from "@/lib/contest/team-code";

/**
 * Team formation.
 *
 * Until this existed, a participant could only be put on a team by editing the database — which
 * for thirty students is thirty hand-written rows on the night. This is the path that replaces
 * that: a student creates a team and reads its code out, teammates type the code.
 *
 * ## The invariant that matters
 *
 * **Team size is the divisor in every team score**, so membership is a scoring input rather than
 * an administrative convenience (CLAUDE.md). Two things follow, and both are load-bearing:
 *
 *  1. **Size is never stored.** It is `members.length` at scoring time, so somebody joining or
 *     leaving during setup simply changes the divisor. A cached count is a second source of truth
 *     that drifts from the roster it claims to describe.
 *  2. **Every mutation is audited with an actor**, and the admin ones additionally with a reason.
 *     A disputed roster has to be explainable after the fact, and a roster change is a score
 *     change with extra steps.
 *
 * ## Set assignment on join
 *
 * Joining a team asks for a set, and the ask is **idempotent**: a participant who already has one
 * keeps it. That is deliberate even though it costs some balance — re-rolling on every team change
 * would let a student shop for a set by hopping teams, which is the T5 vector wearing a different
 * hat. The seed makes the assignment re-derivable either way.
 */

/** What a competitor is allowed to see about their own team, and about others on the board. */
export interface TeamView {
  readonly teamId: string;
  readonly name: string;
  readonly joinCode: string;
  readonly maxTeamSize: number;
  readonly members: readonly { participantId: string; displayName: string }[];
}

interface ContestForTeams {
  readonly id: string;
  readonly state: string;
  readonly startsAt: Date;
  readonly teamFormationClosesAt: Date | null;
  readonly maxTeamSize: number;
  readonly setSelection: string;
  readonly setAssignmentSeed: string | null;
  readonly problemSets: readonly { id: string }[];
}

async function contestForTeams(contestId: string): Promise<ContestForTeams> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: {
      id: true,
      state: true,
      startsAt: true,
      teamFormationClosesAt: true,
      maxTeamSize: true,
      setSelection: true,
      setAssignmentSeed: true,
      problemSets: { select: { id: true } },
    },
  });
  if (contest === null) throw new NotFoundError("Contest");
  return contest;
}

/**
 * Whether students may still form teams.
 *
 * **Derived from the contest, never stored.** A stored "team formation open" flag is a second
 * source of truth that has to be flipped by hand, and the hand that forgets to flip it is the
 * one running the contest. Formation closes when the contest starts — after that a roster change
 * is an organizer's decision, not a student's, because it moves the divisor under a score that
 * already exists.
 */
export function teamFormationOpen(
  contest: {
    readonly state: string;
    readonly startsAt: Date;
    readonly teamFormationClosesAt?: Date | null;
  },
  now: Date,
): boolean {
  if (contest.state !== "DRAFT" && contest.state !== "SCHEDULED" && contest.state !== "RUNNING") {
    return false;
  }
  // Null means the default rule: formation closes when the contest starts.
  return now < (contest.teamFormationClosesAt ?? contest.startsAt);
}

function assertFormationOpen(contest: ContestForTeams, now: Date): void {
  if (!teamFormationOpen(contest, now)) {
    throw new DomainError(
      "CONTEST_NOT_RUNNING",
      "Team sign-up has closed for this contest. Ask an organizer to change your team.",
    );
  }
}

/**
 * Give a participant a set if they do not have one, balanced within their team.
 *
 * Idempotent by construction: an existing `chosenSetId` is returned untouched. Called on every
 * team join, so a student who joins a team after assignment has run is not left with nothing to
 * solve — which is the "late joiner" case in `assignSetForOne`'s own docstring.
 */
async function ensureSetAssigned(
  db: Db,
  contest: ContestForTeams,
  participantId: string,
  teamId: string | null,
): Promise<string | null> {
  const participant = await db.participant.findUnique({
    where: { id: participantId },
    select: { chosenSetId: true },
  });

  if (participant?.chosenSetId != null) return participant.chosenSetId;

  if (
    contest.setSelection !== "RANDOM_ASSIGNED" ||
    contest.setAssignmentSeed === null ||
    contest.problemSets.length === 0
  ) {
    return null;
  }

  const takenInTeam =
    teamId === null
      ? []
      : (
          await db.participant.findMany({
            where: {
              contestId: contest.id,
              teamId,
              id: { not: participantId },
              chosenSetId: { not: null },
            },
            select: { chosenSetId: true },
          })
        ).flatMap((p) => (p.chosenSetId === null ? [] : [p.chosenSetId]));

  const chosenSetId = assignSetForOne({
    seed: contest.setAssignmentSeed,
    setIds: contest.problemSets.map((set) => set.id),
    participantId,
    takenInTeam,
  });

  if (chosenSetId !== null) {
    await db.participant.update({ where: { id: participantId }, data: { chosenSetId } });
  }
  return chosenSetId;
}

/** A code nobody in this contest is using yet. */
async function unusedTeamCode(db: Db, contestId: string): Promise<string> {
  // Bounded rather than `while (true)`: at 30^6 a collision is already unlikely, and a loop that
  // cannot terminate is a worse failure than a refusal somebody can retry.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = newTeamCode();
    const clash = await db.team.findFirst({
      where: { contestId, joinCode: candidate },
      select: { id: true },
    });
    if (clash === null) return candidate;
  }
  throw new DomainError("INTERNAL", "Could not allocate a team code. Try again.");
}

export interface CreateTeamResult {
  readonly team: TeamView;
  readonly chosenSetId: string | null;
}

/**
 * A student creates a team and is placed on it.
 *
 * The creator joins their own team, which is the only behaviour that is not surprising: a screen
 * that makes you create a team and then separately join it is a screen people get wrong.
 */
export async function createTeam(
  contestId: string,
  participantId: string,
  name: string,
  now: Date,
): Promise<CreateTeamResult> {
  const contest = await contestForTeams(contestId);
  assertFormationOpen(contest, now);

  const participant = await prisma.participant.findFirst({
    where: { id: participantId, contestId },
    select: { id: true, displayName: true, teamId: true },
  });
  if (participant === null) throw new ForbiddenError("Join the contest first");

  // One team per participant per contest. Leaving is an explicit action, so that "create" cannot
  // silently abandon the team somebody is already counting on.
  if (participant.teamId !== null) {
    throw new DomainError(
      "CONFLICT",
      "You are already on a team. Leave it first if you want to start a new one.",
    );
  }

  const trimmed = name.trim();
  const existing = await prisma.team.findFirst({
    where: { contestId, name: trimmed },
    select: { id: true },
  });
  if (existing !== null) {
    throw new DomainError("CONFLICT", "A team with that name already exists — pick another");
  }

  const joinCode = await unusedTeamCode(prisma, contestId);

  const team = await prisma.$transaction(async (tx) => {
    const created = await tx.team.create({
      data: {
        contestId,
        name: trimmed,
        joinCode,
        createdByParticipantId: participantId,
      },
      select: { id: true, name: true, joinCode: true },
    });

    await tx.participant.update({
      where: { id: participantId },
      data: { teamId: created.id },
    });

    await writeAudit(
      {
        actor: `participant:${participantId}`,
        action: AUDIT_ACTIONS.teamCreated,
        entity: `Team:${created.id}`,
        after: {
          contestId,
          name: created.name,
          createdBy: participant.displayName,
          firstMember: participantId,
        },
      },
      tx,
    );

    return created;
  });

  const chosenSetId = await ensureSetAssigned(prisma, contest, participantId, team.id);
  invalidateScoringInput(contestId);

  return { team: await teamViewFor(team.id, contest.maxTeamSize), chosenSetId };
}

export interface JoinTeamResult {
  readonly team: TeamView;
  readonly chosenSetId: string | null;
  /** True when the participant was already on this team; the call changed nothing. */
  readonly alreadyMember: boolean;
}

/** A student joins an existing team with its code. */
export async function joinTeamByCode(
  contestId: string,
  participantId: string,
  code: string,
  now: Date,
): Promise<JoinTeamResult> {
  const contest = await contestForTeams(contestId);
  assertFormationOpen(contest, now);

  const participant = await prisma.participant.findFirst({
    where: { id: participantId, contestId },
    select: { id: true, displayName: true, teamId: true },
  });
  if (participant === null) throw new ForbiddenError("Join the contest first");

  const team = await prisma.team.findFirst({
    where: { contestId, joinCode: normaliseTeamCode(code) },
    select: { id: true, name: true, joinCode: true, _count: { select: { members: true } } },
  });
  // Deliberately the same error a well-formed but unknown code gives: no enumeration of which
  // team codes exist in this contest.
  if (team === null) throw new NotFoundError("Team");

  if (participant.teamId === team.id) {
    return {
      team: await teamViewFor(team.id, contest.maxTeamSize),
      chosenSetId: null,
      alreadyMember: true,
    };
  }

  if (participant.teamId !== null) {
    throw new DomainError(
      "CONFLICT",
      "You are already on a team. Leave it first if you want to switch.",
    );
  }

  /**
   * The size guardrail, and it is checked HERE rather than at scoring time.
   *
   * Team size is the divisor, so an oversized team quietly dilutes every member's contribution.
   * Refusing at the door is the only place a student can act on it; refusing later would be a
   * score nobody can explain.
   */
  if (team._count.members >= contest.maxTeamSize) {
    throw new DomainError(
      "CONFLICT",
      `${team.name} already has ${String(contest.maxTeamSize)} members, which is the limit for ` +
        "this contest. Ask an organizer if you think that is wrong.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.participant.update({ where: { id: participantId }, data: { teamId: team.id } });
    await writeAudit(
      {
        actor: `participant:${participantId}`,
        action: AUDIT_ACTIONS.teamJoined,
        entity: `Team:${team.id}`,
        after: {
          contestId,
          teamName: team.name,
          displayName: participant.displayName,
          // The size AFTER the join. Recorded because it is the divisor, so a dispute about a
          // score is a dispute about this number at this instant.
          teamSizeAfter: team._count.members + 1,
        },
      },
      tx,
    );
  });

  const chosenSetId = await ensureSetAssigned(prisma, contest, participantId, team.id);
  invalidateScoringInput(contestId);

  return {
    team: await teamViewFor(team.id, contest.maxTeamSize),
    chosenSetId,
    alreadyMember: false,
  };
}

/** A student leaves their team. The set they were assigned is NOT taken away. */
export async function leaveTeam(
  contestId: string,
  participantId: string,
  now: Date,
): Promise<void> {
  const contest = await contestForTeams(contestId);
  assertFormationOpen(contest, now);

  const participant = await prisma.participant.findFirst({
    where: { id: participantId, contestId },
    select: { id: true, displayName: true, teamId: true, team: { select: { name: true } } },
  });
  if (participant === null) throw new ForbiddenError("Join the contest first");
  if (participant.teamId === null) {
    throw new DomainError("CONFLICT", "You are not on a team");
  }

  const teamId = participant.teamId;

  await prisma.$transaction(async (tx) => {
    await tx.participant.update({ where: { id: participantId }, data: { teamId: null } });
    await writeAudit(
      {
        actor: `participant:${participantId}`,
        action: AUDIT_ACTIONS.teamLeft,
        entity: `Team:${teamId}`,
        after: {
          contestId,
          teamName: participant.team?.name ?? null,
          displayName: participant.displayName,
        },
      },
      tx,
    );
  });

  /**
   * The set is deliberately kept.
   *
   * Taking it back would let a student clear an unwanted assignment by leaving and rejoining —
   * the T5 re-roll, reachable through a different door. The assignment is per PARTICIPANT and
   * survives their roster changing.
   */
  invalidateScoringInput(contestId);
}

/** Everything a competitor may see about one team. */
export async function teamViewFor(teamId: string, maxTeamSize: number): Promise<TeamView> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      joinCode: true,
      members: {
        select: { id: true, displayName: true },
        // Sorted by id, not by join order: the engine's replayability rule applies to anything
        // that leaves this module as an array (CLAUDE.md).
        orderBy: { id: "asc" },
      },
    },
  });
  if (team === null) throw new NotFoundError("Team");

  return {
    teamId: team.id,
    name: team.name,
    joinCode: team.joinCode,
    maxTeamSize,
    members: team.members.map((m) => ({ participantId: m.id, displayName: m.displayName })),
  };
}

/* ------------------------------------------------------------------------ */
/* Organizer actions                                                         */
/* ------------------------------------------------------------------------ */

/**
 * Every one of these takes a `reason` and records it.
 *
 * An organizer moving somebody between teams changes two divisors at once, which changes two
 * scores. "Why is our score different" is a question that gets asked at 9pm, and the only
 * acceptable answer is the audit row rather than somebody's memory.
 */

export async function adminCreateTeam(
  contestId: string,
  actor: string,
  name: string,
): Promise<TeamView> {
  const contest = await contestForTeams(contestId);

  const trimmed = name.trim();
  const existing = await prisma.team.findFirst({
    where: { contestId, name: trimmed },
    select: { id: true },
  });
  if (existing !== null) {
    throw new DomainError("CONFLICT", "A team with that name already exists in this contest");
  }

  const joinCode = await unusedTeamCode(prisma, contestId);

  const team = await prisma.$transaction(async (tx) => {
    const created = await tx.team.create({
      data: { contestId, name: trimmed, joinCode, createdByParticipantId: null },
      select: { id: true },
    });
    await writeAudit(
      {
        actor,
        action: AUDIT_ACTIONS.teamCreated,
        entity: `Team:${created.id}`,
        after: { contestId, name: trimmed, createdBy: "organizer" },
      },
      tx,
    );
    return created;
  });

  invalidateScoringInput(contestId);
  return teamViewFor(team.id, contest.maxTeamSize);
}

export async function adminRenameTeam(
  teamId: string,
  actor: string,
  name: string,
  reason: string,
): Promise<TeamView> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true, contestId: true, contest: { select: { maxTeamSize: true } } },
  });
  if (team === null) throw new NotFoundError("Team");

  const trimmed = name.trim();
  const clash = await prisma.team.findFirst({
    where: { contestId: team.contestId, name: trimmed, id: { not: teamId } },
    select: { id: true },
  });
  if (clash !== null) {
    throw new DomainError("CONFLICT", "Another team in this contest already has that name");
  }

  await prisma.$transaction(async (tx) => {
    await tx.team.update({ where: { id: teamId }, data: { name: trimmed } });
    await writeAudit(
      {
        actor,
        action: AUDIT_ACTIONS.teamRenamed,
        entity: `Team:${teamId}`,
        before: { name: team.name },
        after: { name: trimmed },
        reason,
      },
      tx,
    );
  });

  invalidateScoringInput(team.contestId);
  return teamViewFor(teamId, team.contest.maxTeamSize);
}

/**
 * Move a participant onto a team, or off one entirely with `teamId: null`.
 *
 * **This is the operation most likely to be silently wrong**, because it moves TWO divisors: the
 * team they left shrinks and the team they joined grows, so two team scores change from one
 * click. Both are recorded in the audit row.
 *
 * The organizer is NOT subject to `maxTeamSize`. A roster correction on the night must not be
 * blocked by a setting chosen a week earlier — the limit exists to shape what students do, not
 * to overrule the person running the contest.
 */
export async function adminMoveParticipant(
  participantId: string,
  teamId: string | null,
  actor: string,
  reason: string,
): Promise<void> {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    select: {
      id: true,
      displayName: true,
      contestId: true,
      teamId: true,
      team: { select: { name: true } },
    },
  });
  if (participant === null) throw new NotFoundError("Participant");

  let target: { id: string; name: string } | null = null;
  if (teamId !== null) {
    const found = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true, contestId: true },
    });
    if (found === null) throw new NotFoundError("Team");
    if (found.contestId !== participant.contestId) {
      throw new ValidationError("That team belongs to a different contest");
    }
    target = { id: found.id, name: found.name };
  }

  if (participant.teamId === teamId) {
    throw new DomainError("CONFLICT", "That participant is already on that team");
  }

  // Sizes on BOTH sides, read before the move, so the audit row says what the divisors were.
  const [fromSize, toSize] = await Promise.all([
    participant.teamId === null
      ? Promise.resolve(0)
      : prisma.participant.count({ where: { teamId: participant.teamId } }),
    teamId === null ? Promise.resolve(0) : prisma.participant.count({ where: { teamId } }),
  ]);

  await prisma.$transaction(async (tx) => {
    await tx.participant.update({ where: { id: participantId }, data: { teamId } });
    await writeAudit(
      {
        actor,
        action: AUDIT_ACTIONS.teamMemberMoved,
        entity: `Participant:${participantId}`,
        before: {
          teamId: participant.teamId,
          teamName: participant.team?.name ?? null,
          teamSize: fromSize,
        },
        after: {
          teamId,
          teamName: target?.name ?? null,
          teamSize: teamId === null ? 0 : toSize + 1,
          displayName: participant.displayName,
        },
        reason,
      },
      tx,
    );
  });

  invalidateScoringInput(participant.contestId);
}

/**
 * Dissolve a team. Its members become teamless rather than being deleted.
 *
 * `Participant.teamId` is `onDelete: SetNull`, so the database would do this anyway — it is done
 * explicitly and inside the same transaction as the audit row so that the members who were
 * affected are named. A cascade leaves no record of who was on it.
 */
export async function adminDissolveTeam(
  teamId: string,
  actor: string,
  reason: string,
): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      contestId: true,
      members: { select: { id: true, displayName: true }, orderBy: { id: "asc" } },
    },
  });
  if (team === null) throw new NotFoundError("Team");

  await prisma.$transaction(async (tx) => {
    await tx.participant.updateMany({ where: { teamId }, data: { teamId: null } });
    await writeAudit(
      {
        actor,
        action: AUDIT_ACTIONS.teamDissolved,
        entity: `Team:${teamId}`,
        before: {
          name: team.name,
          memberCount: team.members.length,
          // Flat string, because an audit row that needs a schema to read is one nobody reads
          // at 9pm during an argument about second place.
          members: team.members.map((m) => m.displayName).join(", "),
        },
        reason,
      },
      tx,
    );
    await tx.team.delete({ where: { id: teamId } });
  });

  invalidateScoringInput(team.contestId);
}

/**
 * Force a participant onto a specific problem set.
 *
 * The escape hatch for a disputed or broken assignment. It deliberately bypasses the seeded
 * derivation, which is exactly why it is audited with a reason: after this runs,
 * `reDeriveAssignment` will report `matchesStored: false` for this contest, and an organizer
 * showing a student "here is why you got set C" needs to know a human overrode it.
 */
export async function adminReassignSet(
  participantId: string,
  setId: string | null,
  actor: string,
  reason: string,
): Promise<void> {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    select: { id: true, displayName: true, contestId: true, chosenSetId: true },
  });
  if (participant === null) throw new NotFoundError("Participant");

  if (setId !== null) {
    const set = await prisma.problemSet.findUnique({
      where: { id: setId },
      select: { id: true, contestId: true },
    });
    if (set === null) throw new NotFoundError("Problem set");
    if (set.contestId !== participant.contestId) {
      throw new ValidationError("That problem set belongs to a different contest");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.participant.update({ where: { id: participantId }, data: { chosenSetId: setId } });
    await writeAudit(
      {
        actor,
        action: AUDIT_ACTIONS.setForceReassigned,
        entity: `Participant:${participantId}`,
        before: { chosenSetId: participant.chosenSetId },
        after: { chosenSetId: setId, displayName: participant.displayName },
        reason,
      },
      tx,
    );
  });

  invalidateScoringInput(participant.contestId);
}

/** The organizer's roster: every team, its members, and everybody on no team at all. */
export async function adminRoster(contestId: string): Promise<{
  readonly maxTeamSize: number;
  readonly formationOpen: boolean;
  readonly teams: readonly (TeamView & { readonly memberCount: number })[];
  readonly unassigned: readonly { participantId: string; displayName: string }[];
}> {
  const contest = await contestForTeams(contestId);

  const [teams, unassigned] = await Promise.all([
    prisma.team.findMany({
      where: { contestId },
      select: {
        id: true,
        name: true,
        joinCode: true,
        members: { select: { id: true, displayName: true }, orderBy: { id: "asc" } },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    prisma.participant.findMany({
      where: { contestId, teamId: null },
      select: { id: true, displayName: true },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
    }),
  ]);

  return {
    maxTeamSize: contest.maxTeamSize,
    formationOpen: teamFormationOpen(contest, new Date()),
    teams: teams.map((team) => ({
      teamId: team.id,
      name: team.name,
      joinCode: team.joinCode,
      maxTeamSize: contest.maxTeamSize,
      memberCount: team.members.length,
      members: team.members.map((m) => ({ participantId: m.id, displayName: m.displayName })),
    })),
    unassigned: unassigned.map((p) => ({ participantId: p.id, displayName: p.displayName })),
  };
}
