import type { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { NO_STORE, handle, jsonOk } from "@/lib/contest/http";
import { JOIN_CLAIM_COOKIE, joinClaimCookieOptions } from "@/lib/contest/join-claim";
import {
  SESSION_COOKIE,
  clearedSessionCookieOptions,
  parseCookieHeader,
} from "@/lib/contest/session";
import { revokeSessionByToken } from "@/lib/contest/session-store";
import { viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `GET /api/auth/session` — who am I?
 * `DELETE` — sign out.
 *
 * One endpoint for every provider, because a session does not remember which form the person
 * filled in — only `Session.method` does, and that is for the audit trail rather than for the
 * client.
 *
 * DELETE **revokes the row**, not just the cookie. Clearing a cookie alone leaves a token that
 * still authenticates if anyone captured it, which was the old behaviour.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const viewer = await viewerFromRequest(request, new Date());

    if (viewer.kind === "anonymous") {
      return jsonOk(
        {
          signedIn: false as const,
          role: null,
          displayName: null,
          participantId: null,
          contestId: null,
          teamId: null,
          teamName: null,
        },
        NO_STORE,
      );
    }

    if (viewer.kind === "admin") {
      return jsonOk(
        {
          signedIn: true as const,
          role: "ADMIN" as const,
          displayName: viewer.displayName,
          participantId: null,
          contestId: null,
          teamId: null,
          teamName: null,
        },
        NO_STORE,
      );
    }

    // A competitor's own team, so "my team" does not need a second round trip to find itself.
    // Strictly the caller's own data: no other participant's id, name or score appears here.
    const participant = await prisma.participant.findUnique({
      where: { id: viewer.participantId },
      select: { teamId: true, team: { select: { name: true } } },
    });

    return jsonOk(
      {
        signedIn: true as const,
        role: "COMPETITOR" as const,
        displayName: viewer.displayName,
        participantId: viewer.participantId,
        contestId: viewer.contestId,
        teamId: participant?.teamId ?? null,
        teamName: participant?.team?.name ?? null,
      },
      NO_STORE,
    );
  });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const token = parseCookieHeader(request.headers.get("cookie"))[SESSION_COOKIE];
    if (token !== undefined) {
      await revokeSessionByToken(token, "signed out", new Date());
    }

    const response = jsonOk({ signedIn: false as const }, NO_STORE);
    response.cookies.set(SESSION_COOKIE, "", clearedSessionCookieOptions());

    /**
     * The join claim goes too, and this is the only place it is cleared.
     *
     * It exists to make re-joining idempotent (T5), which means it deliberately outlives the
     * session — a student whose cookie was dropped has to be able to get back to *their own*
     * participant. But a shared classroom laptop is a real case: one student finishes, the next
     * sits down. Sign-out is the explicit "I am done with this browser" action, so it is the
     * right and the only place to release the claim.
     *
     * This does mean sign-out-then-join is a way to draw a second set. It is a deliberate trade
     * against locking the next student out of a shared machine, it is one more audit row rather
     * than none, and the residual is recorded in docs/TODO.md T5.
     */
    response.cookies.set(JOIN_CLAIM_COOKIE, "", { ...joinClaimCookieOptions(), maxAge: 0 });
    return response;
  });
}
