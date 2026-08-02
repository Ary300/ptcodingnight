import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/db";

/**
 * The audit trail.
 *
 * Every score change is written here so a disputed result can be explained (docs/PRD.md §6.3).
 * That means both kinds: the ordinary ones the judge produces, and the manual overrides an
 * organizer makes — which additionally require a reason (PRD §9.2).
 *
 * Values are flat scalars on purpose. An audit row that needs a schema to read is one nobody
 * reads at 9pm during an argument about second place.
 */

export type AuditValue = Record<string, string | number | boolean | null>;

/** Works inside or outside a transaction, so an audit row can share the write it describes. */
export type Db = PrismaClient | Prisma.TransactionClient;

export const AUDIT_ACTIONS = {
  judgeVerdict: "submission.judged",
  judgeInternalError: "submission.internal_error",
  verdictOverride: "submission.override",
  /// An organizer sent a submission back through the judge. Carries the verdict it HAD, because
  /// after the rejudge there is nothing left in the row to say what was replaced — and "the IE
  /// that was there before" is the whole justification for having pressed the button.
  submissionRejudge: "submission.rejudge",
  /// A contest was created through the organizer console. Recorded because a contest is the root
  /// of everything else that is audited, and "who set this up, and when" is the first question
  /// asked when a window or a preset turns out to be wrong.
  contestCreate: "contest.create",
  /// The line-up changed. Records the slot labels rather than the problem ids, because "which
  /// problems were in this contest" is the question asked afterwards and an id answers it only
  /// for somebody with database access.
  contestProblemsSet: "contest.problems_set",
  /// Published, opened or ended. The transition an organizer makes deliberately, as distinct from
  /// a freeze, which is reversible and lives in the live console.
  contestStateSet: "contest.state_set",
  contestFreeze: "contest.freeze",
  contestUnfreeze: "contest.unfreeze",
  participantJoin: "participant.join",
  /// An organizer put a known account on a contest roster before anyone signed into it. The row
  /// that makes "who added this person, and when" answerable for a participant nobody ever saw
  /// sign in — which is now the normal case, because a roster is built before the contest starts.
  participantAdded: "participant.added_by_organizer",
  /// An organizer took somebody off a contest entirely. Records the submission count that went
  /// with them: `Submission.participantId` cascades on delete, so this is the only remaining
  /// record that there was work to lose.
  participantRemoved: "participant.removed_by_organizer",
  /// A browser presenting a valid join claim was handed its existing participant back. The row
  /// carries `chosenSetId` on EVERY rejoin, not just the first: the set must never change, and a
  /// trail that records it each time is how a set that did change stops being deniable.
  participantRejoin: "participant.rejoin",
  /// A browser that already holds a participant tried to join under a different name — the
  /// set-sampling attempt T5 describes. Logged because the organizer roster is where this is
  /// meant to be visible, and a refusal nobody can see is not a control.
  participantRejoinRefused: "participant.rejoin_refused",
  standingsExport: "standings.export",
  /// Problem-set assignment. The `after` value carries the SEED, not the result: the seed is what
  /// makes the assignment re-derivable, and a re-assignment overwrites Contest.setAssignmentSeed
  /// so without it the previous assignment would become unexplainable.
  setAssignment: "contest.assign_sets",
  setReassignment: "contest.reassign_sets",
  /// The sets were BUILT: which problems went into A, B, C, D. Distinct from the two above, which
  /// record which PLAYER holds a set. The `after` value carries the seed, the recipe and the set
  /// count — the three inputs `planSets` consumed — because those together re-derive the deal, and
  /// applying again overwrites all three on the contest row. Without this the previous split would
  /// become unexplainable, which is the property the seed exists to provide.
  setPlanApplied: "contest.build_sets",
  sideActivity: "team.side_activity",
  /// Team formation. A roster change is a SCORE change with extra steps, because team size is
  /// the divisor — so every one of these is recorded with an actor, and the organizer ones with
  /// a reason as well.
  teamCreated: "team.created",
  teamJoined: "team.joined",
  teamLeft: "team.left",
  teamRenamed: "team.renamed",
  teamDissolved: "team.dissolved",
  /// The one that moves TWO divisors at once: the team left shrinks, the team joined grows.
  teamMemberMoved: "team.member_moved",
  /// An organizer put a participant in a division, or took them out of one. A division decides
  /// which problems the player may open and which board ranks them, so the row carries a reason
  /// the same way a team move does — "why is this student suddenly Advanced" is asked at 9pm too.
  participantDivisionSet: "participant.division_set",
  /// A human overriding the seeded set derivation. After this, reDeriveAssignment reports
  /// matchesStored: false for the contest, and whoever shows a student "here is why you got set
  /// C" needs to know that happened.
  setForceReassigned: "contest.force_reassign_set",
  sessionRevoked: "session.revoked",
} as const;

export interface AuditEntry {
  readonly actor: string;
  readonly action: string;
  readonly entity: string;
  readonly before?: AuditValue | null;
  readonly after?: AuditValue | null;
  readonly reason?: string | null;
}

export async function writeAudit(entry: AuditEntry, db: Db = prisma): Promise<void> {
  await db.auditLog.create({
    data: {
      actor: entry.actor,
      action: entry.action,
      entity: entry.entity,
      before: (entry.before ?? null) as Prisma.InputJsonValue,
      after: (entry.after ?? null) as Prisma.InputJsonValue,
      reason: entry.reason ?? null,
    },
  });
}
