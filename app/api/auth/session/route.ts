import type { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { NO_STORE, handle, jsonOk } from "@/lib/contest/http";
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

/**
 * The avatar's last-changed instant, so the client can build a cache-busting `<img>` URL. Null for
 * a join-by-code competitor (no account) or an account with no picture. One tiny select, kept off
 * the avatar bytes themselves, which never travel with a session read.
 */
async function avatarUpdatedAtFor(userId: string | null): Promise<string | null> {
  if (userId === null) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUpdatedAt: true, avatarMime: true },
  });
  if (user === null || user.avatarMime === null) return null;
  return user.avatarUpdatedAt?.toISOString() ?? null;
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const viewer = await viewerFromRequest(request, new Date());

    if (viewer.kind === "anonymous") {
      return jsonOk(
        {
          signedIn: false as const,
          role: null,
          userId: null,
          displayName: null,
          participantId: null,
          contestId: null,
          teamId: null,
          teamName: null,
          divisionId: null,
          chosenSetId: null,
          chosenSetLabel: null,
          avatarUpdatedAt: null,
        },
        NO_STORE,
      );
    }

    if (viewer.kind === "admin") {
      return jsonOk(
        {
          signedIn: true as const,
          role: "ADMIN" as const,
          userId: viewer.userId,
          displayName: viewer.displayName,
          participantId: null,
          contestId: null,
          teamId: null,
          teamName: null,
          divisionId: null,
          chosenSetId: null,
          chosenSetLabel: null,
          avatarUpdatedAt: await avatarUpdatedAtFor(viewer.userId),
        },
        NO_STORE,
      );
    }

    /*
      A competitor's own team, division and problem set.

      Strictly the caller's own data — no other participant's id, name or score appears here.

      `divisionId`, `chosenSetId` and `chosenSetLabel` are on this response because THIS ROUTE IS
      HOW THE CLIENT LEARNS WHO IT IS. It used to learn that from the join response and keep it in
      `sessionStorage`; the join route is gone, so the only thing that knows is the session, and a
      client that cannot name its own contest cannot call a single contest-scoped route.

      `chosenSetLabel` in particular is not decoration: a student needs to be told which set they
      are on, and sets are assigned rather than chosen (PRD §6.2).
    */
    const participant = await prisma.participant.findUnique({
      where: { id: viewer.participantId },
      select: {
        teamId: true,
        divisionId: true,
        chosenSetId: true,
        team: { select: { name: true } },
        chosenSet: { select: { label: true } },
      },
    });

    return jsonOk(
      {
        signedIn: true as const,
        role: "COMPETITOR" as const,
        userId: viewer.userId,
        displayName: viewer.displayName,
        participantId: viewer.participantId,
        contestId: viewer.contestId,
        teamId: participant?.teamId ?? null,
        teamName: participant?.team?.name ?? null,
        divisionId: participant?.divisionId ?? null,
        chosenSetId: participant?.chosenSetId ?? null,
        chosenSetLabel: participant?.chosenSet?.label ?? null,
        avatarUpdatedAt: await avatarUpdatedAtFor(viewer.userId),
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

    return response;
  });
}
