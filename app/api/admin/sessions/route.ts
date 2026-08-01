import type { NextResponse } from "next/server";

import { z } from "zod";

import { DomainError } from "@/lib/errors";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/contest/audit";
import { NO_STORE, handle, jsonOk, readJson } from "@/lib/contest/http";
import {
  listLiveSessions,
  revokeParticipantSessions,
  revokeSession,
} from "@/lib/contest/session-store";
import { actorLabel, requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `GET  /api/admin/sessions` — who is signed in right now.
 * `POST /api/admin/sessions/revoke` semantics, via `{ sessionId }` or `{ participantId }`.
 *
 * **This endpoint is the reason sessions moved into Postgres.** With a signed cookie neither verb
 * was possible: there were no records to list, and a token stayed valid until it expired no matter
 * what an organizer wanted. An organizer who spots a session being misused twenty minutes into a
 * round can now end it.
 *
 * Revocation is audit-logged with a reason, for the same reason a verdict override is: the only
 * reason to cut somebody off is one you can state.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RevokeSchema = z
  .object({
    sessionId: z.string().min(1).optional(),
    /** Revokes every live session for this participant, not just one device. */
    participantId: z.string().min(1).optional(),
    reason: z.string().trim().min(3, "Give a reason. It goes in the audit log").max(500),
  })
  .refine(
    (v) => (v.sessionId === undefined) !== (v.participantId === undefined),
    "Name exactly one of sessionId or participantId",
  );

export async function GET(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    requireAdmin(await viewerFromRequest(request, now));

    const sessions = await listLiveSessions(now);

    return jsonOk(
      {
        sessions: sessions.map((s) => ({
          sessionId: s.id,
          role: s.role,
          // How they signed in. Useful on the night: a room full of JOIN_CODE sessions and one
          // GOOGLE session is worth a second look.
          method: s.method,
          displayName: s.displayName,
          participantId: s.participantId,
          createdAt: s.createdAt.toISOString(),
          lastSeenAt: s.lastSeenAt.toISOString(),
        })),
      },
      NO_STORE,
    );
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const admin = requireAdmin(await viewerFromRequest(request, now));
    const input = await readJson(request, RevokeSchema);

    if (input.sessionId !== undefined) {
      if (input.sessionId === admin.sessionId) {
        // Refused rather than allowed: an organizer revoking their own session mid-contest locks
        // themselves out of the console they need. Sign out via DELETE /api/auth/session instead.
        throw new DomainError(
          "VALIDATION",
          "That is your own session. Use sign-out rather than revoking it here.",
        );
      }

      await revokeSession(input.sessionId, input.reason, now);
      await writeAudit({
        actor: actorLabel(admin),
        action: AUDIT_ACTIONS.sessionRevoked,
        entity: `session:${input.sessionId}`,
        after: { revokedAt: now.toISOString() },
        reason: input.reason,
      });

      return jsonOk({ revoked: 1 }, NO_STORE);
    }

    const participantId = input.participantId ?? "";
    const revoked = await revokeParticipantSessions(participantId, input.reason, now);

    await writeAudit({
      actor: actorLabel(admin),
      action: AUDIT_ACTIONS.sessionRevoked,
      entity: `participant:${participantId}`,
      after: { revokedAt: now.toISOString(), sessions: revoked },
      reason: input.reason,
    });

    return jsonOk({ revoked }, NO_STORE);
  });
}
