import { randomBytes } from "node:crypto";

import { DomainError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/contest/audit";
import { assignSets } from "@/lib/contest/set-assignment";
import { invalidateScoringInput } from "@/lib/contest/standings";
import { actorLabel, type AdminViewer } from "@/lib/contest/viewer";

/**
 * Running and re-deriving problem-set assignment.
 *
 * The pure algorithm is `lib/contest/set-assignment.ts`. This is the I/O half: it mints and stores
 * the seed, writes `Participant.chosenSetId`, and records an audit row.
 *
 * ## Why the seed is stored rather than the shuffle
 *
 * **A disputed assignment has to be explainable rather than argued about** (PRD §6.2). Storing the
 * seed means an organizer can re-derive the whole assignment in front of a student and show it was
 * fixed before anybody knew who was on which team. Storing only the result would leave nothing to
 * check — the student would have to take the platform's word for it, which is exactly the position
 * the spreadsheet put everyone in.
 *
 * `reassign` exists because a roster changes: someone arrives late, someone swaps teams. It takes a
 * new seed by default and audits the change, so a re-run is visible rather than silent.
 */

export interface AssignmentSummary {
  readonly contestId: string;
  readonly seed: string;
  readonly assigned: number;
  /** Set label to the number of players on it. Lets an organizer eyeball the balance. */
  readonly distribution: Readonly<Record<string, number>>;
  /** True when this ran against a contest that had already been assigned. */
  readonly reassigned: boolean;
}

function newSeed(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Assign every participant a Round 1 set.
 *
 * Refuses to re-run silently: a second call without `reassign` is an error, because re-rolling an
 * assignment mid-contest would move students off problems they had already started.
 */
export async function runSetAssignment(
  contestId: string,
  admin: AdminViewer,
  now: Date,
  options: { readonly reassign?: boolean; readonly seed?: string } = {},
): Promise<AssignmentSummary> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: {
      id: true,
      setSelection: true,
      setAssignmentSeed: true,
      problemSets: { select: { id: true, label: true } },
      participants: { select: { id: true, teamId: true, chosenSetId: true } },
    },
  });

  if (contest === null) throw new NotFoundError("Contest");

  if (contest.setSelection !== "RANDOM_ASSIGNED") {
    throw new DomainError(
      "VALIDATION",
      `This contest is configured as ${contest.setSelection}, so sets are not assigned by the platform`,
    );
  }

  if (contest.problemSets.length === 0) {
    throw new DomainError(
      "VALIDATION",
      "Create the problem sets (A, B, C, D) before assigning them",
    );
  }

  const alreadyAssigned = contest.setAssignmentSeed !== null;
  if (alreadyAssigned && options.reassign !== true) {
    throw new DomainError(
      "CONFLICT",
      "This contest has already been assigned. Re-assigning moves students off problems they may " +
        "have started, so it has to be asked for explicitly.",
    );
  }

  const seed = options.seed ?? newSeed();
  const setIds = contest.problemSets.map((s) => s.id);

  const assignments = assignSets({
    seed,
    setIds,
    participants: contest.participants.map((p) => ({ participantId: p.id, teamId: p.teamId })),
  });

  const labelOf = new Map(contest.problemSets.map((s) => [s.id, s.label]));
  const distribution: Record<string, number> = {};
  for (const set of contest.problemSets) distribution[set.label] = 0;
  for (const a of assignments) {
    const label = labelOf.get(a.setId);
    if (label !== undefined) distribution[label] = (distribution[label] ?? 0) + 1;
  }

  // One transaction: an assignment half-written would leave some students with problems and others
  // staring at an empty list, which is worse than a failed request.
  await prisma.$transaction(async (tx) => {
    for (const assignment of assignments) {
      await tx.participant.update({
        where: { id: assignment.participantId },
        data: { chosenSetId: assignment.setId },
      });
    }

    await tx.contest.update({
      where: { id: contestId },
      data: { setAssignmentSeed: seed },
    });

    // The seed goes in the audit row as well as on the contest. The contest row holds the CURRENT
    // seed; a re-assignment overwrites it, and without this the previous assignment would become
    // unexplainable — which is the whole property this feature exists to provide.
    await writeAudit(
      {
        actor: actorLabel(admin),
        action: alreadyAssigned
          ? AUDIT_ACTIONS.setReassignment
          : AUDIT_ACTIONS.setAssignment,
        entity: `contest:${contestId}`,
        before: alreadyAssigned ? { seed: contest.setAssignmentSeed } : null,
        after: {
          seed,
          assigned: assignments.length,
          sets: setIds.length,
          at: now.toISOString(),
        },
        reason: alreadyAssigned ? "roster changed after the first assignment" : null,
      },
      tx,
    );
  });

  invalidateScoringInput(contestId);

  return {
    contestId,
    seed,
    assigned: assignments.length,
    distribution,
    reassigned: alreadyAssigned,
  };
}

export interface AssignmentAudit {
  readonly contestId: string;
  readonly seed: string;
  /** Recomputed from the stored seed and the current roster. */
  readonly derived: readonly { participantId: string; displayName: string; setLabel: string }[];
  /**
   * True when re-deriving from the seed reproduces exactly what is stored.
   *
   * False means the roster changed since assignment ran, or a `chosenSetId` was edited by hand.
   * Either way an organizer needs to know before showing this to a student as proof.
   */
  readonly matchesStored: boolean;
}

/**
 * Re-derive the assignment from the stored seed and compare it to what is stored.
 *
 * This is the thing an organizer shows a student who disputes their set. It is deliberately a READ:
 * it recomputes and compares, and never writes, so demonstrating fairness cannot itself change
 * anybody's problems.
 */
export async function reDeriveAssignment(contestId: string): Promise<AssignmentAudit> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: {
      setAssignmentSeed: true,
      problemSets: { select: { id: true, label: true } },
      participants: {
        select: { id: true, displayName: true, teamId: true, chosenSetId: true },
      },
    },
  });

  if (contest === null) throw new NotFoundError("Contest");
  if (contest.setAssignmentSeed === null) {
    throw new DomainError("VALIDATION", "This contest has not been assigned yet");
  }

  const seed = contest.setAssignmentSeed;
  const labelOf = new Map(contest.problemSets.map((s) => [s.id, s.label]));
  const nameOf = new Map(contest.participants.map((p) => [p.id, p.displayName]));
  const storedSetOf = new Map(contest.participants.map((p) => [p.id, p.chosenSetId]));

  const assignments = assignSets({
    seed,
    setIds: contest.problemSets.map((s) => s.id),
    participants: contest.participants.map((p) => ({ participantId: p.id, teamId: p.teamId })),
  });

  const matchesStored = assignments.every(
    (a) => storedSetOf.get(a.participantId) === a.setId,
  );

  return {
    contestId,
    seed,
    derived: assignments.map((a) => ({
      participantId: a.participantId,
      displayName: nameOf.get(a.participantId) ?? "(unknown)",
      setLabel: labelOf.get(a.setId) ?? "(unknown)",
    })),
    matchesStored,
  };
}
