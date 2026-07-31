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
  contestFreeze: "contest.freeze",
  contestUnfreeze: "contest.unfreeze",
  participantJoin: "participant.join",
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
