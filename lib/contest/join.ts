import { DomainError, NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import type { JoinRequest } from "@/lib/schemas/api";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/contest/audit";
import { assertCanJoin } from "@/lib/contest/gate";
import { invalidateScoringInput } from "@/lib/contest/standings";

/**
 * Joining a contest.
 *
 * The join-code path is the fallback that has to work when Google Workspace is not available on
 * the night (docs/PRD.md §4), which in practice means it is the path that will actually be
 * used. A join code plus a display name is therefore the whole credential, and the display name
 * is what a session is bound to.
 *
 * Which is why a taken display name is a conflict and never a "welcome back". Rejoining by
 * typing somebody else's name would hand an attacker their submissions and their score; making
 * them pick a different name costs one retype.
 */

export interface JoinResult {
  readonly participantId: string;
  readonly contestId: string;
  readonly displayName: string;
  readonly divisionId: string | null;
}

export async function joinContest(
  input: JoinRequest,
  expectedContestId: string,
  now: Date,
): Promise<JoinResult> {
  const contest = await prisma.contest.findUnique({
    where: { joinCode: input.joinCode },
    select: {
      id: true,
      state: true,
      divisions: { select: { id: true } },
    },
  });

  // Deliberately the same error a wrong code gives: no enumeration of which codes exist.
  if (contest === null) throw new NotFoundError("Contest");

  // A valid code for a different contest is still the wrong code for this URL. Checked before
  // anything is written, so a mismatch never leaves a stray participant behind.
  if (contest.id !== expectedContestId) throw new NotFoundError("Contest");

  assertCanJoin(contest.state);

  const divisionId = input.divisionId;
  if (divisionId !== null && !contest.divisions.some((d) => d.id === divisionId)) {
    throw new ValidationError("That division is not part of this contest");
  }

  const existing = await prisma.participant.findFirst({
    where: { contestId: contest.id, displayName: input.displayName },
    select: { id: true },
  });
  if (existing !== null) {
    throw new DomainError("CONFLICT", "That display name is taken — pick another");
  }

  const participant = await prisma.participant.create({
    data: {
      contestId: contest.id,
      displayName: input.displayName,
      divisionId,
      joinedAt: now,
    },
    select: { id: true, displayName: true, divisionId: true },
  });

  await writeAudit({
    actor: `participant:${participant.id}`,
    action: AUDIT_ACTIONS.participantJoin,
    entity: `Participant:${participant.id}`,
    after: {
      contestId: contest.id,
      displayName: participant.displayName,
      divisionId: participant.divisionId,
    },
  });

  // The new participant belongs on the board immediately, on zero points.
  invalidateScoringInput(contest.id);

  return {
    participantId: participant.id,
    contestId: contest.id,
    displayName: participant.displayName,
    divisionId: participant.divisionId,
  };
}
