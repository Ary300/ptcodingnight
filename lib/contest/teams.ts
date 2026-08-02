import type { ContestState } from "@prisma/client";

import { DomainError, NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { AUDIT_ACTIONS, writeAudit, type Db } from "@/lib/contest/audit";
import { lockContestMutations } from "@/lib/contest/locks";
import { assertCanMutateStandingsInputs } from "@/lib/contest/gate";
import { assignSetForOne } from "@/lib/contest/set-assignment";
import { uniqueDisplayName } from "@/lib/contest/enrolment";
import { invalidateScoringInput } from "@/lib/contest/standings";
import { newTeamCode } from "@/lib/contest/team-code";

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
 * Joining a team asks for a set. A valid existing assignment stays put, so moving between
 * compatible rosters cannot be used to shop for another set. If the destination already uses that
 * set, the participant moves to an unused one; preserving it would give two teammates the same
 * questions. The seed keeps either answer reproducible.
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
  readonly state: ContestState;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly freezeAt: Date | null;
  readonly teamFormationClosesAt: Date | null;
  readonly maxTeamSize: number;
  readonly setSelection: string;
  readonly setAssignmentSeed: string | null;
  readonly problemSets: readonly { id: string; label: string; divisionId: string | null }[];
  readonly divisions: readonly { id: string; name: string }[];
}

async function contestForTeams(contestId: string, db: Db = prisma): Promise<ContestForTeams> {
  const contest = await db.contest.findUnique({
    where: { id: contestId },
    select: {
      id: true,
      state: true,
      startsAt: true,
      endsAt: true,
      freezeAt: true,
      teamFormationClosesAt: true,
      maxTeamSize: true,
      setSelection: true,
      setAssignmentSeed: true,
      problemSets: {
        select: { id: true, label: true, divisionId: true },
        orderBy: { label: "asc" },
      },
      // `sortOrder` first because it is the board's order; name breaks ties because it is unique
      // per contest, so the list can never reshuffle between two reads.
      divisions: {
        select: { id: true, name: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
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

/**
 * Give a participant a set that no teammate holds.
 *
 * An existing assignment stays put when it is valid. If an organizer moves the participant onto a
 * team already using that set, the participant is deterministically moved to a free one. The move
 * is refused when none exists; silently keeping a duplicate would break the question-set format.
 */
async function ensureSetAssigned(
  db: Db,
  contest: ContestForTeams,
  participantId: string,
  teamId: string | null,
): Promise<string | null> {
  const participant = await db.participant.findUnique({
    where: { id: participantId },
    select: { chosenSetId: true, divisionId: true },
  });

  // A member may only hold a set of their own division, and a member with no division only a
  // division-null set. For a contest with no divisions every set is division-null, so this
  // filter is the identity there and the behaviour is exactly what it was before divisions.
  const candidateSets = contest.problemSets.filter(
    (set) => set.divisionId === (participant?.divisionId ?? null),
  );

  // The two alternate formats intentionally do not impose per-teammate uniqueness here:
  // PLAYER_CHOOSES permits independent choices, and ONE_SET_PER_TEAM requires teammates to share.
  // Automatic, distinct assignment is the contract of RANDOM_ASSIGNED only.
  if (contest.setSelection !== "RANDOM_ASSIGNED") {
    return participant?.chosenSetId ?? null;
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

  const validSetIds = new Set(candidateSets.map((set) => set.id));
  if (
    participant?.chosenSetId != null &&
    validSetIds.has(participant.chosenSetId) &&
    !takenInTeam.includes(participant.chosenSetId)
  ) {
    return participant.chosenSetId;
  }

  if (
    participant?.chosenSetId != null &&
    contest.state !== "DRAFT" &&
    contest.state !== "SCHEDULED"
  ) {
    throw new DomainError(
      "CONFLICT",
      "That move would change this student's problem set after the contest started. " +
        "Choose a different destination or make an explicit audited set correction first.",
    );
  }

  if (
    contest.setAssignmentSeed === null ||
    candidateSets.length === 0
  ) {
    if (participant?.chosenSetId != null && takenInTeam.includes(participant.chosenSetId)) {
      throw new DomainError(
        "VALIDATION",
        "That move would give two teammates the same set. Assign more sets before moving them.",
      );
    }
    return participant?.chosenSetId ?? null;
  }

  const chosenSetId = assignSetForOne({
    seed: contest.setAssignmentSeed,
    setIds: candidateSets.map((set) => set.id),
    participantId,
    takenInTeam,
  });

  if (chosenSetId !== null) {
    await db.participant.update({ where: { id: participantId }, data: { chosenSetId } });
  } else {
    throw new DomainError(
      "VALIDATION",
      "That team already uses every available set. Build another set before adding a teammate.",
    );
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

export interface JoinTeamResult {
  readonly team: TeamView;
  readonly chosenSetId: string | null;
  /** True when the participant was already on this team; the call changed nothing. */
  readonly alreadyMember: boolean;
}

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
  const trimmed = name.trim();
  const result = await prisma.$transaction(async (tx) => {
    await lockContestMutations(tx, contestId);
    const contest = await contestForTeams(contestId, tx);
    assertCanMutateStandingsInputs(contest, new Date());

    const existing = await tx.team.findFirst({
      where: { contestId, name: trimmed },
      select: { id: true },
    });
    if (existing !== null) {
      throw new DomainError("CONFLICT", "A team with that name already exists in this contest");
    }

    const joinCode = await unusedTeamCode(tx, contestId);
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
    return { teamId: created.id, maxTeamSize: contest.maxTeamSize };
  });

  invalidateScoringInput(contestId);
  return teamViewFor(result.teamId, result.maxTeamSize);
}

export async function adminRenameTeam(
  teamId: string,
  actor: string,
  name: string,
  reason: string,
): Promise<TeamView> {
  const owner = await prisma.team.findUnique({
    where: { id: teamId },
    select: { contestId: true },
  });
  if (owner === null) throw new NotFoundError("Team");

  const trimmed = name.trim();
  const result = await prisma.$transaction(async (tx) => {
    await lockContestMutations(tx, owner.contestId);
    const contest = await contestForTeams(owner.contestId, tx);
    assertCanMutateStandingsInputs(contest, new Date());

    const team = await tx.team.findUnique({
      where: { id: teamId },
      select: { name: true, contestId: true },
    });
    if (team === null) throw new NotFoundError("Team");
    if (team.contestId !== owner.contestId) {
      throw new DomainError("CONFLICT", "The team changed contests while it was being edited");
    }

    const clash = await tx.team.findFirst({
      where: { contestId: team.contestId, name: trimmed, id: { not: teamId } },
      select: { id: true },
    });
    if (clash !== null) {
      throw new DomainError("CONFLICT", "Another team in this contest already has that name");
    }

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
    return { contestId: team.contestId, maxTeamSize: contest.maxTeamSize };
  });

  invalidateScoringInput(result.contestId);
  return teamViewFor(teamId, result.maxTeamSize);
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
  /**
   * Change the player's division in the same organizer action. `undefined` leaves it alone;
   * `null` clears it. Applied BEFORE the set dealing below, because `ensureSetAssigned` matches
   * sets to players strictly by division - dealt after, the player would receive a set of the
   * division they just left.
   */
  divisionId?: string | null,
): Promise<void> {
  // Contest id is immutable and tells us which advisory lock to take. Every mutable fact is read
  // again after that lock, inside the transaction.
  const owner = await prisma.participant.findUnique({
    where: { id: participantId },
    select: { contestId: true },
  });
  if (owner === null) throw new NotFoundError("Participant");

  await prisma.$transaction(async (tx) => {
    await lockContestMutations(tx, owner.contestId);

    const participant = await tx.participant.findUnique({
      where: { id: participantId },
      select: {
        id: true,
        displayName: true,
        contestId: true,
        teamId: true,
        chosenSetId: true,
        divisionId: true,
        division: { select: { name: true } },
        team: { select: { name: true } },
      },
    });
    if (participant === null) throw new NotFoundError("Participant");

    const divisionChanges =
      divisionId !== undefined && divisionId !== participant.divisionId;

    let target: { id: string; name: string } | null = null;
    if (teamId !== null) {
      const found = await tx.team.findUnique({
        where: { id: teamId },
        select: { id: true, name: true, contestId: true },
      });
      if (found === null) throw new NotFoundError("Team");
      if (found.contestId !== participant.contestId) {
        throw new ValidationError("That team belongs to a different contest");
      }
      target = { id: found.id, name: found.name };
    }

    // Same team AND same division is a no-op worth refusing; same team with a NEW division is
    // the one-form flow working as intended (the organizer re-submitted the row to change the
    // division alone), so only the true no-op is an error.
    if (participant.teamId === teamId && !divisionChanges) {
      throw new DomainError("CONFLICT", "That participant is already on that team");
    }

    const contest = await contestForTeams(participant.contestId, tx);
    assertCanMutateStandingsInputs(contest, new Date());

    if (divisionChanges) {
      let targetDivision: { id: string; name: string } | null = null;
      if (divisionId != null) {
        const found = await tx.division.findUnique({
          where: { id: divisionId },
          select: { id: true, name: true, contestId: true },
        });
        if (found === null) throw new NotFoundError("Division");
        if (found.contestId !== participant.contestId) {
          throw new ValidationError("That division belongs to a different contest");
        }
        targetDivision = { id: found.id, name: found.name };
      }
      await tx.participant.update({
        where: { id: participantId },
        data: { divisionId: divisionId ?? null },
      });
      // Its own audit row, the same one the standalone division action writes: a reader asking
      // "why is this student suddenly Advanced" should find the answer under the same action
      // name however the change was made.
      await writeAudit(
        {
          actor,
          action: AUDIT_ACTIONS.participantDivisionSet,
          entity: `Participant:${participantId}`,
          before: {
            divisionId: participant.divisionId,
            divisionName: participant.division?.name ?? null,
          },
          after: {
            divisionId: divisionId ?? null,
            divisionName: targetDivision?.name ?? null,
            displayName: participant.displayName,
          },
          reason,
        },
        tx,
      );
    }

    const fromSize =
      participant.teamId === null
        ? 0
        : await tx.participant.count({ where: { teamId: participant.teamId } });
    const toSize = teamId === null ? 0 : await tx.participant.count({ where: { teamId } });

    const teamChanges = participant.teamId !== teamId;
    if (teamChanges) {
      await tx.participant.update({ where: { id: participantId }, data: { teamId } });
    }

    /*
      Moving somebody ONTO a team assigns their problem set, if they do not have one.

      Students used to acquire a set by joining a team with a code, and `ensureSetAssigned` hung
      off that path. Team membership is now decided only here, so this is the only place left that
      can assign one — and without this line an organizer-assigned student has no set at all: no
      column on the board, and in a real contest (allowReadingUnassignedSets off) nothing visible
      but the group problems. The removal of the student path would have taken set assignment with
      it, silently.

      `ensureSetAssigned` keeps the existing set when the destination does not already use it. If
      it does, the player receives a deterministic unused set. This preserves the anti-shopping
      property without allowing two teammates to land on identical questions.
    */
    const chosenSetId =
      teamId === null
        ? participant.chosenSetId
        : await ensureSetAssigned(tx, contest, participantId, teamId);

    if (teamChanges)
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
          chosenSetId,
          displayName: participant.displayName,
        },
        reason,
      },
      tx,
    );
  });

  invalidateScoringInput(owner.contestId);
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
  const owner = await prisma.team.findUnique({
    where: { id: teamId },
    select: { contestId: true },
  });
  if (owner === null) throw new NotFoundError("Team");

  await prisma.$transaction(async (tx) => {
    await lockContestMutations(tx, owner.contestId);
    const contest = await contestForTeams(owner.contestId, tx);
    assertCanMutateStandingsInputs(contest, new Date());

    const team = await tx.team.findUnique({
      where: { id: teamId },
      select: {
        name: true,
        contestId: true,
        members: { select: { displayName: true }, orderBy: { id: "asc" } },
      },
    });
    if (team === null) throw new NotFoundError("Team");
    if (team.contestId !== owner.contestId) {
      throw new DomainError("CONFLICT", "The team changed contests while it was being edited");
    }

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

  invalidateScoringInput(owner.contestId);
}

/**
 * Put a participant in a division, or in none with `divisionId: null`.
 *
 * The same discipline as `adminMoveParticipant`, because it is the same kind of change: division
 * decides which problems this player may open (`inScope` filters reads by it) and which board
 * ranks them, so "why is this student suddenly Advanced" needs an audit-row answer exactly the
 * way "why did our score change" does.
 *
 * **Deliberately does not touch `chosenSetId`.** When sets are division-scoped, a player who
 * changes division may be holding a set of the wrong division afterwards — but silently swapping
 * their set here would be a second, unrequested mutation hiding inside this one. Re-planning or
 * reassigning sets is its own explicit, audited action, and the roster screen is where an
 * organizer can see both facts side by side.
 */
export async function adminSetParticipantDivision(
  participantId: string,
  divisionId: string | null,
  actor: string,
  reason: string,
): Promise<void> {
  // Contest id is immutable and names the advisory lock. Every mutable fact is read again after
  // that lock, inside the transaction — the same shape as the team move above.
  const owner = await prisma.participant.findUnique({
    where: { id: participantId },
    select: { contestId: true },
  });
  if (owner === null) throw new NotFoundError("Participant");

  await prisma.$transaction(async (tx) => {
    await lockContestMutations(tx, owner.contestId);

    const participant = await tx.participant.findUnique({
      where: { id: participantId },
      select: {
        id: true,
        displayName: true,
        contestId: true,
        divisionId: true,
        division: { select: { name: true } },
      },
    });
    if (participant === null) throw new NotFoundError("Participant");

    let target: { id: string; name: string } | null = null;
    if (divisionId !== null) {
      const found = await tx.division.findUnique({
        where: { id: divisionId },
        select: { id: true, name: true, contestId: true },
      });
      if (found === null) throw new NotFoundError("Division");
      if (found.contestId !== participant.contestId) {
        throw new ValidationError("That division belongs to a different contest");
      }
      target = { id: found.id, name: found.name };
    }

    if (participant.divisionId === divisionId) {
      throw new DomainError("CONFLICT", "That participant is already in that division");
    }

    const contest = await contestForTeams(participant.contestId, tx);
    assertCanMutateStandingsInputs(contest, new Date());

    await tx.participant.update({ where: { id: participantId }, data: { divisionId } });

    await writeAudit(
      {
        actor,
        action: AUDIT_ACTIONS.participantDivisionSet,
        entity: `Participant:${participantId}`,
        before: {
          divisionId: participant.divisionId,
          divisionName: participant.division?.name ?? null,
        },
        after: {
          divisionId,
          divisionName: target?.name ?? null,
          displayName: participant.displayName,
        },
        reason,
      },
      tx,
    );
  });

  // Division is a scoring input: the per-division boards partition players by it, so the cached
  // standings for this contest are stale the moment the row changes — same as a team move.
  invalidateScoringInput(owner.contestId);
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
  const owner = await prisma.participant.findUnique({
    where: { id: participantId },
    select: { contestId: true },
  });
  if (owner === null) throw new NotFoundError("Participant");

  await prisma.$transaction(async (tx) => {
    await lockContestMutations(tx, owner.contestId);

    const participant = await tx.participant.findUnique({
      where: { id: participantId },
      select: {
        id: true,
        displayName: true,
        contestId: true,
        teamId: true,
        chosenSetId: true,
        contest: { select: { setSelection: true } },
      },
    });
    if (participant === null) throw new NotFoundError("Participant");

    const contest = await contestForTeams(participant.contestId, tx);
    assertCanMutateStandingsInputs(contest, new Date());

    if (setId !== null) {
      const set = await tx.problemSet.findUnique({
        where: { id: setId },
        select: { id: true, contestId: true },
      });
      if (set === null) throw new NotFoundError("Problem set");
      if (set.contestId !== participant.contestId) {
        throw new ValidationError("That problem set belongs to a different contest");
      }
      if (
        participant.teamId !== null &&
        participant.contest.setSelection === "RANDOM_ASSIGNED"
      ) {
        const duplicate = await tx.participant.findFirst({
          where: {
            teamId: participant.teamId,
            id: { not: participant.id },
            chosenSetId: setId,
          },
          select: { displayName: true },
        });
        if (duplicate !== null) {
          throw new ValidationError(
            `${duplicate.displayName} already has that set. Teammates need different sets.`,
          );
        }
      }
    }

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

  invalidateScoringInput(owner.contestId);
}

/* ------------------------------------------------------------------------ */
/* Building a roster before anyone has signed in                             */
/* ------------------------------------------------------------------------ */

/**
 * ## The defect this section exists to fix
 *
 * A `Participant` row belongs to exactly ONE contest, and until now the only thing that created
 * one was `ensureEnrolled` at sign-in. `adminRoster` lists participants of the contest it was
 * given, so a contest created this morning contained nobody and could contain nobody — the
 * organizer's words were "I could not add any of the people who participated in the Demo to
 * Test2 ... I could only add people if they signed up or signed in AFTER the contest had
 * started."
 *
 * That is backwards. Adding people, assigning problems and forming teams all happen BEFORE the
 * gun; starting the contest is the last thing an organizer does, not the first. So an organizer
 * can now put any known account on any contest's roster, and the `Participant` row is created by
 * that action rather than by the student happening to sign in at the right moment.
 *
 * ## One account per person, one participant per contest
 *
 * `User` is the person and `Participant` is their entry in one contest. Adding somebody never
 * touches `User`, so nothing here can merge or duplicate an account. The `(contestId, userId)`
 * check below is what keeps the second half of that rule: adding the same person twice returns
 * the row they already have instead of minting a rival participant that competes against them for
 * their own submissions.
 */

/** A known account that is NOT yet on this contest's roster. */
export interface AddableUser {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly gradYear: number | null;
  readonly role: string;
  /**
   * Contests this account has competed in before, newest first.
   *
   * Two students really do share a name — `uniqueDisplayName` exists because of it — so a picker
   * that shows only names asks an organizer to guess. Email, graduation year and "was in the Demo"
   * are what actually tell two Alex Chens apart.
   */
  readonly pastContests: readonly string[];
}

/** Nobody is picking a student out of a list of five hundred; they type a name. */
const ADDABLE_DEFAULT_LIMIT = 20;
export const ADDABLE_MAX_LIMIT = 50;

/**
 * Accounts an organizer could add to this contest: every known user with no `Participant` row here.
 *
 * **Organizers are included, and that is deliberate.** Automatic enrolment skips them — signing an
 * organizer in must not put them in a team's divisor by accident — but this is not automatic. An
 * organizer who also wants to compete is a decision a human is making on purpose, and the role is
 * returned beside the name so the screen can say which kind of account it is.
 *
 * Disabled accounts are excluded: a disabled account cannot sign in, so putting one on a roster
 * creates a participant who can never submit and still occupies a place in the divisor.
 */
export async function adminAddableUsers(
  contestId: string,
  query: string,
  limit: number = ADDABLE_DEFAULT_LIMIT,
): Promise<AddableUser[]> {
  // Proves the contest exists before reporting a list of people who are "not in it".
  await contestForTeams(contestId);

  const trimmed = query.trim();
  const take = Math.min(Math.max(limit, 1), ADDABLE_MAX_LIMIT);

  const users = await prisma.user.findMany({
    where: {
      disabledAt: null,
      participants: { none: { contestId } },
      ...(trimmed === ""
        ? {}
        : {
            OR: [
              { displayName: { contains: trimmed, mode: "insensitive" as const } },
              { email: { contains: trimmed, mode: "insensitive" as const } },
            ],
          }),
    },
    select: { id: true, displayName: true, email: true, gradYear: true, role: true },
    // Two keys, because `displayName` is not unique across accounts and Postgres returns rows in
    // whatever order it likes otherwise. A picker whose order changes between keystrokes moves the
    // row under the organizer's cursor.
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    take,
  });

  if (users.length === 0) return [];

  // Only for the page being shown. "Which contests has this person been in" is a join nobody wants
  // to run across every account in the school.
  const history = await prisma.participant.findMany({
    where: { userId: { in: users.map((user) => user.id) } },
    select: { userId: true, contest: { select: { name: true, startsAt: true } } },
    orderBy: { contest: { startsAt: "desc" } },
  });

  const byUser = new Map<string, string[]>();
  for (const row of history) {
    if (row.userId === null) continue;
    const names = byUser.get(row.userId) ?? [];
    names.push(row.contest.name);
    byUser.set(row.userId, names);
  }

  return users.map((user) => ({
    userId: user.id,
    displayName: user.displayName,
    email: user.email,
    gradYear: user.gradYear,
    role: user.role,
    pastContests: byUser.get(user.id) ?? [],
  }));
}

export interface AddParticipantResult {
  readonly participantId: string;
  readonly displayName: string;
  /** False when this account was already on the roster; the call changed nothing. */
  readonly created: boolean;
}

/**
 * Put a known account on this contest's roster, creating the `Participant`.
 *
 * Building a roster while the contest is DRAFT or SCHEDULED is the normal case — it is the entire
 * point — and a late arrival on the night remains addable while it is RUNNING. A frozen board is
 * the exception: participant identity is not versioned like score events, so adding a row then
 * would rewrite the public payload at its old cutoff. Finished contests are refused as well.
 *
 * Idempotent on `(contestId, userId)`: adding the same person twice hands back the row they
 * already have. The database also enforces the pair uniquely; the explicit check gives a
 * double-click the useful idempotent response instead of exposing a constraint error. `userId`
 * remains nullable because join-by-code participants predate accounts.
 */
export async function adminAddParticipant(
  contestId: string,
  userId: string,
  actor: string,
): Promise<AddParticipantResult> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: { id: true, state: true },
  });
  if (contest === null) throw new NotFoundError("Contest");
  if (contest.state === "ENDED" || contest.state === "ARCHIVED") {
    throw new DomainError(
      "CONTEST_NOT_RUNNING",
      "This contest is over, so nobody else can be added to it.",
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true, disabledAt: true },
  });
  if (user === null) throw new NotFoundError("User");
  if (user.disabledAt !== null) {
    throw new ValidationError("That account is disabled and cannot compete.");
  }

  const existing = await prisma.participant.findFirst({
    where: { contestId, userId },
    select: { id: true, displayName: true },
  });
  if (existing !== null) {
    return { participantId: existing.id, displayName: existing.displayName, created: false };
  }

  const displayName = await uniqueDisplayName(contestId, user.displayName);

  const result = await prisma.$transaction(async (tx) => {
    await lockContestMutations(tx, contestId);
    const lockedContest = await contestForTeams(contestId, tx);
    assertCanMutateStandingsInputs(lockedContest, new Date());

    // Recheck after the contest lock. Two double-clicked requests can both pass the optimistic
    // read above, but only the first may create the one participant allowed for this account.
    const concurrentExisting = await tx.participant.findFirst({
      where: { contestId, userId },
      select: { id: true, displayName: true },
    });
    if (concurrentExisting !== null) {
      return {
        participantId: concurrentExisting.id,
        displayName: concurrentExisting.displayName,
        created: false,
      };
    }

    const participant = await tx.participant.create({
      data: {
        contestId,
        userId,
        displayName,
        // No team, exactly as at sign-in. A participant on no team is in nobody's divisor, so
        // adding somebody early cannot move a score — which is what makes this safe to do in bulk
        // before the contest starts.
        teamId: null,
      },
      select: { id: true, displayName: true },
    });
    await writeAudit(
      {
        actor,
        action: AUDIT_ACTIONS.participantAdded,
        entity: `Participant:${participant.id}`,
        after: { contestId, userId, displayName: participant.displayName },
      },
      tx,
    );
    return {
      participantId: participant.id,
      displayName: participant.displayName,
      created: true,
    };
  });

  invalidateScoringInput(contestId);
  return result;
}

/** What removing a participant would destroy. Read before the delete so the audit row can say it. */
export interface ParticipantRemovalImpact {
  readonly participantId: string;
  readonly displayName: string;
  readonly contestId: string;
  readonly teamId: string | null;
  readonly submissionCount: number;
}

/**
 * Take somebody off a contest entirely.
 *
 * ## Why submissions have to be confirmed separately
 *
 * `Submission.participantId` is `onDelete: Cascade`, so deleting a participant deletes their
 * judged submissions with them — and standings are re-derived from the submission log, so that is
 * not a tidy-up, it is rewriting history for every team they were on. An organizer removing a
 * student who signed up twice by mistake and an organizer removing a student who has been
 * competing for an hour are doing two very different things, and the button is the same button.
 *
 * So: a participant with no submissions is removed outright, and one with submissions is refused
 * until the caller passes `deleteSubmissions`. The message names the count, because "you are about
 * to delete 14 judged submissions" is the only thing that makes the second case visible.
 *
 * The non-destructive alternative is `adminMoveParticipant(id, null)`, which takes them out of
 * every divisor and leaves the log intact. The refusal message says so.
 */
export async function adminRemoveParticipant(
  contestId: string,
  participantId: string,
  actor: string,
  reason: string,
  deleteSubmissions: boolean,
): Promise<ParticipantRemovalImpact> {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    select: {
      id: true,
      displayName: true,
      contestId: true,
      teamId: true,
      userId: true,
      team: { select: { name: true } },
      _count: { select: { submissions: true } },
    },
  });
  if (participant === null) throw new NotFoundError("Participant");

  /*
    THE CONTEST COMES FROM THE PATH AND THE PARTICIPANT FROM THE BODY, so nothing about the URL
    constrains the id. Checked here rather than at the route edge because it has to happen BEFORE
    the delete: an organizer on Test2's screen must not be able to delete a participant of the
    Demo and receive Test2's roster back looking entirely correct.
  */
  if (participant.contestId !== contestId) {
    throw new ValidationError("That participant belongs to a different contest");
  }

  const submissionCount = participant._count.submissions;
  if (submissionCount > 0 && !deleteSubmissions) {
    throw new DomainError(
      "CONFLICT",
      `${participant.displayName} has ${String(submissionCount)} judged submission` +
        `${submissionCount === 1 ? "" : "s"}. Removing them from the contest deletes those too. ` +
        "Confirm that, or take them off their team instead, which keeps the record and removes " +
        "them from every score.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await lockContestMutations(tx, contestId);
    const contest = await contestForTeams(contestId, tx);
    assertCanMutateStandingsInputs(contest, new Date());

    await writeAudit(
      {
        actor,
        action: AUDIT_ACTIONS.participantRemoved,
        entity: `Participant:${participantId}`,
        before: {
          contestId: participant.contestId,
          displayName: participant.displayName,
          userId: participant.userId,
          teamId: participant.teamId,
          teamName: participant.team?.name ?? null,
          // The row is about to cascade away. This number is the only thing that will remain to
          // say there was work here.
          submissionsDeleted: submissionCount,
        },
        reason,
      },
      tx,
    );
    // The audit row is written FIRST and inside the same transaction: `AuditLog` has no foreign
    // key to `Participant`, but writing it after the delete would leave a window where a failure
    // loses the only record of what went.
    await tx.participant.delete({ where: { id: participantId } });
  });

  invalidateScoringInput(participant.contestId);

  return {
    participantId,
    displayName: participant.displayName,
    contestId: participant.contestId,
    teamId: participant.teamId,
    submissionCount,
  };
}

/* ------------------------------------------------------------------------ */
/* The roster itself                                                         */
/* ------------------------------------------------------------------------ */

/**
 * One person on the roster, as an ORGANIZER sees them.
 *
 * Strictly more than `TeamMember`, which is the student-facing shape and stays a name and an id.
 * The three extra fields all exist to answer a question the organizer's screen has to answer:
 *
 *  - `email` tells two students with the same name apart, which is the whole reason
 *    `uniqueDisplayName` had to invent a suffix in the first place.
 *  - `userId` says whether this participant is backed by an account at all. A null one is a
 *    legacy join-by-code row, and it cannot be re-added after removal because there is no account
 *    to add.
 *  - `submissionCount` is what removal destroys, so the screen can say so before it happens
 *    rather than after.
 */
export interface RosterMember {
  readonly participantId: string;
  readonly displayName: string;
  readonly userId: string | null;
  readonly email: string | null;
  readonly submissionCount: number;
  readonly chosenSetId: string | null;
  readonly chosenSetLabel: string | null;
  /**
   * Which division this player competes in, or null for none. Not cosmetic: a player with no
   * division sees only division-null problems, so the roster is where an organizer notices the
   * student who will open the contest and find almost nothing in it.
   */
  readonly divisionId: string | null;
  readonly divisionName: string | null;
}

/** The organizer's roster: every team, its members, and everybody on no team at all. */
export async function adminRoster(contestId: string): Promise<{
  readonly maxTeamSize: number;
  readonly formationOpen: boolean;
  readonly setSelection: "RANDOM_ASSIGNED" | "PLAYER_CHOOSES" | "ONE_SET_PER_TEAM";
  readonly problemSets: readonly { readonly setId: string; readonly label: string }[];
  readonly divisions: readonly { readonly divisionId: string; readonly name: string }[];
  readonly teams: readonly (Omit<TeamView, "members"> & {
    readonly memberCount: number;
    readonly members: readonly RosterMember[];
  })[];
  readonly unassigned: readonly RosterMember[];
}> {
  const contest = await contestForTeams(contestId);

  const memberSelect = {
    id: true,
    displayName: true,
    userId: true,
    user: { select: { email: true } },
    chosenSetId: true,
    chosenSet: { select: { label: true } },
    divisionId: true,
    division: { select: { name: true } },
    _count: { select: { submissions: true } },
  } as const;

  type MemberRow = {
    id: string;
    displayName: string;
    userId: string | null;
    user: { email: string | null } | null;
    _count: { submissions: number };
    chosenSetId: string | null;
    chosenSet: { label: string } | null;
    divisionId: string | null;
    division: { name: string } | null;
  };

  const toMember = (row: MemberRow): RosterMember => ({
    participantId: row.id,
    displayName: row.displayName,
    userId: row.userId,
    email: row.user?.email ?? null,
    submissionCount: row._count.submissions,
    chosenSetId: row.chosenSetId,
    chosenSetLabel: row.chosenSet?.label ?? null,
    divisionId: row.divisionId,
    divisionName: row.division?.name ?? null,
  });

  const [teams, unassigned] = await Promise.all([
    prisma.team.findMany({
      where: { contestId },
      select: {
        id: true,
        name: true,
        joinCode: true,
        members: { select: memberSelect, orderBy: { id: "asc" } },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    prisma.participant.findMany({
      where: { contestId, teamId: null },
      select: memberSelect,
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
    }),
  ]);

  return {
    maxTeamSize: contest.maxTeamSize,
    formationOpen: teamFormationOpen(contest, new Date()),
    setSelection: contest.setSelection as
      | "RANDOM_ASSIGNED"
      | "PLAYER_CHOOSES"
      | "ONE_SET_PER_TEAM",
    problemSets: contest.problemSets.map((set) => ({ setId: set.id, label: set.label })),
    divisions: contest.divisions.map((division) => ({
      divisionId: division.id,
      name: division.name,
    })),
    teams: teams.map((team) => ({
      teamId: team.id,
      name: team.name,
      joinCode: team.joinCode,
      maxTeamSize: contest.maxTeamSize,
      memberCount: team.members.length,
      members: team.members.map(toMember),
    })),
    unassigned: unassigned.map(toMember),
  };
}
