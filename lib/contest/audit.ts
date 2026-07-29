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
  standingsExport: "standings.export",
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
