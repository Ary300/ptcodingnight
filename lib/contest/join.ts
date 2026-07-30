import { DomainError, NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import type { JoinRequest } from "@/lib/schemas/api";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/contest/audit";
import { assertCanJoin } from "@/lib/contest/gate";
import { assignSetForOne } from "@/lib/contest/set-assignment";
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

/**
 * Whether a failed join looks like someone guessing a code.
 *
 * `joinContest` answers a wrong code and a code for another contest with the same `NOT_FOUND`,
 * deliberately, so that neither enumerates which codes exist. Everything else it can throw —
 * a taken display name, a browser that already joined, a contest not open, an unknown division —
 * is something a student hits honestly.
 *
 * The distinction matters because the wrong-code budget is one shared bucket for the whole room.
 * Charging every failure to it meant twenty ordinary conflicts could stop forty students from
 * joining at all.
 */
export function isWrongJoinCode(error: unknown): boolean {
  return error instanceof DomainError && error.code === "NOT_FOUND";
}

export interface JoinResult {
  readonly participantId: string;
  readonly contestId: string;
  readonly displayName: string;
  readonly divisionId: string | null;
  /** The Round 1 set this player was assigned, if assignment has already run. */
  readonly chosenSetId: string | null;
  readonly chosenSetLabel: string | null;
  /**
   * True when this participant is on no team yet.
   *
   * Not an error — rosters are an organizer's job and a student can arrive before one exists — but
   * the UI has to say so, because a participant with no team contributes to no team score and team
   * size is the divisor in every team score.
   */
  readonly needsTeam: boolean;
  /**
   * True when this call resolved an existing participant rather than creating one.
   *
   * Surfaced so the UI can say "welcome back" instead of "welcome", and so a test can assert the
   * difference between the two paths without inspecting the database.
   */
  readonly rejoined: boolean;
}

export async function joinContest(
  input: JoinRequest,
  /**
   * Null for `POST /api/join`, where the join code IS the lookup key and the caller cannot
   * know a contest id yet. A contest id is still checked when one is supplied, so the
   * contest-scoped route stays strictly narrower rather than becoming a second, looser path
   * to the same write.
   */
  expectedContestId: string | null,
  now: Date,
  /**
   * The verified join claim this browser presented, if any (`lib/contest/join-claim.ts`).
   *
   * This is what makes joining **idempotent**. Without it every call created a participant, and
   * under `RANDOM_ASSIGNED` every new participant drew a new set — so re-joining was a way to
   * sample the other sets before the round, which is precisely the property assigned-and-never-
   * previewed sets exist to prevent (PRD §6.2).
   *
   * Already signature-verified by the caller; a forged or absent claim arrives here as null.
   */
  claim: { readonly participantId: string; readonly contestId: string } | null = null,
): Promise<JoinResult> {
  const contest = await prisma.contest.findUnique({
    where: { joinCode: input.joinCode },
    select: {
      id: true,
      state: true,
      setSelection: true,
      setAssignmentSeed: true,
      divisions: { select: { id: true } },
      problemSets: { select: { id: true, label: true } },
    },
  });

  // Deliberately the same error a wrong code gives: no enumeration of which codes exist.
  if (contest === null) throw new NotFoundError("Contest");

  // A valid code for a different contest is still the wrong code for this URL. Checked before
  // anything is written, so a mismatch never leaves a stray participant behind.
  if (expectedContestId !== null && contest.id !== expectedContestId) {
    throw new NotFoundError("Contest");
  }

  assertCanJoin(contest.state);

  const divisionId = input.divisionId;
  if (divisionId !== null && !contest.divisions.some((d) => d.id === divisionId)) {
    throw new ValidationError("That division is not part of this contest");
  }

  /**
   * The idempotent path.
   *
   * Taken before anything is created, and it writes nothing but an audit row: the participant's
   * `chosenSetId` is returned exactly as stored and is never recomputed. That is the whole fix —
   * re-joining cannot re-roll a set it does not touch.
   */
  const held = await heldParticipant(claim, contest.id);
  if (held !== null) {
    if (held.displayName !== input.displayName) {
      /**
       * A different name from a browser that has already joined is the sampling attempt. Refused
       * by name so the shared-classroom-laptop case is actionable rather than mysterious: the
       * previous student signs out AND clears the claim through the sign-out route, and the next
       * one joins normally.
       */
      await writeAudit({
        actor: `participant:${held.id}`,
        action: AUDIT_ACTIONS.participantRejoinRefused,
        entity: `Participant:${held.id}`,
        after: {
          contestId: contest.id,
          heldDisplayName: held.displayName,
          attemptedDisplayName: input.displayName,
          chosenSetId: held.chosenSetId,
        },
        reason: "browser already holds a participant in this contest",
      });

      throw new DomainError(
        "CONFLICT",
        `This browser already joined as “${held.displayName}”. Sign out first if someone else ` +
          "needs to use it.",
      );
    }

    await writeAudit({
      actor: `participant:${held.id}`,
      action: AUDIT_ACTIONS.participantRejoin,
      entity: `Participant:${held.id}`,
      after: {
        contestId: contest.id,
        displayName: held.displayName,
        // Recorded on every rejoin precisely so that a set which DID change is visible in the
        // trail rather than deniable. It must never change; this is how that is checked.
        chosenSetId: held.chosenSetId,
      },
    });

    return {
      participantId: held.id,
      contestId: contest.id,
      displayName: held.displayName,
      divisionId: held.divisionId,
      chosenSetId: held.chosenSetId,
      chosenSetLabel:
        contest.problemSets.find((set) => set.id === held.chosenSetId)?.label ?? null,
      needsTeam: held.teamId === null,
      rejoined: true,
    };
  }

  const existing = await prisma.participant.findFirst({
    where: { contestId: contest.id, displayName: input.displayName },
    select: { id: true },
  });
  if (existing !== null) {
    /**
     * No claim, and the name is taken. The name alone is not proof of identity — the join code is
     * public and read off the board — so handing over the existing participant here would let
     * anyone take anyone's submissions and score by typing their name.
     *
     * The student who genuinely lost their cookie needs an organizer. The message says so rather
     * than leaving them retyping the same name.
     */
    throw new DomainError(
      "CONFLICT",
      "That display name is taken — pick another. If it is yours and you were signed out, ask " +
        "an organizer to look you up.",
    );
  }

  const participant = await prisma.participant.create({
    data: {
      contestId: contest.id,
      displayName: input.displayName,
      divisionId,
      joinedAt: now,
    },
    select: { id: true, displayName: true, divisionId: true, teamId: true },
  });

  // Assign a set if the contest has already been assigned.
  //
  // A LATE JOINER is assigned individually rather than by re-deriving the whole assignment.
  // Re-deriving would change the roster `assignSets` sees, produce a different answer for
  // everybody, and move students who are already twenty minutes into a problem. A slightly less
  // even distribution is a much smaller cost than that.
  let chosenSetId: string | null = null;
  if (
    contest.setSelection === "RANDOM_ASSIGNED" &&
    contest.setAssignmentSeed !== null &&
    contest.problemSets.length > 0
  ) {
    // Only teammates matter for balance: the property worth preserving is that teammates hold
    // different sets, because teammates on identical problems can simply share answers.
    const takenInTeam =
      participant.teamId === null
        ? []
        : (
            await prisma.participant.findMany({
              where: {
                contestId: contest.id,
                teamId: participant.teamId,
                id: { not: participant.id },
                chosenSetId: { not: null },
              },
              select: { chosenSetId: true },
            })
          ).flatMap((p) => (p.chosenSetId === null ? [] : [p.chosenSetId]));

    chosenSetId = assignSetForOne({
      seed: contest.setAssignmentSeed,
      setIds: contest.problemSets.map((set) => set.id),
      participantId: participant.id,
      takenInTeam,
    });

    if (chosenSetId !== null) {
      await prisma.participant.update({
        where: { id: participant.id },
        data: { chosenSetId },
      });
    }
  }

  await writeAudit({
    actor: `participant:${participant.id}`,
    action: AUDIT_ACTIONS.participantJoin,
    entity: `Participant:${participant.id}`,
    after: {
      contestId: contest.id,
      displayName: participant.displayName,
      divisionId: participant.divisionId,
      // The set goes in the audit row for the same reason the seed does: a late joiner's set is NOT
      // reproducible from the contest seed and the final roster alone, so this row is the only
      // record of how they got it (PRD §6.2).
      chosenSetId,
      lateJoiner: chosenSetId !== null,
    },
  });

  // The new participant belongs on the board immediately, on zero points.
  invalidateScoringInput(contest.id);

  return {
    participantId: participant.id,
    contestId: contest.id,
    displayName: participant.displayName,
    divisionId: participant.divisionId,
    chosenSetId,
    chosenSetLabel:
      contest.problemSets.find((set) => set.id === chosenSetId)?.label ?? null,
    needsTeam: participant.teamId === null,
    rejoined: false,
  };
}

/**
 * The participant this browser's claim points at, or null.
 *
 * Null covers every way a claim can fail to resolve — absent, for another contest, or pointing at
 * a participant an organizer has since removed — because the caller treats all of them the same
 * way: as a browser that has not joined. A claim for a deleted participant in particular must not
 * be an error; a student whose row was cleaned up should be able to join again.
 */
async function heldParticipant(
  claim: { readonly participantId: string; readonly contestId: string } | null,
  contestId: string,
): Promise<{
  readonly id: string;
  readonly displayName: string;
  readonly divisionId: string | null;
  readonly chosenSetId: string | null;
  readonly teamId: string | null;
} | null> {
  if (claim === null || claim.contestId !== contestId) return null;

  return prisma.participant.findFirst({
    where: { id: claim.participantId, contestId },
    select: {
      id: true,
      displayName: true,
      divisionId: true,
      chosenSetId: true,
      teamId: true,
    },
  });
}
