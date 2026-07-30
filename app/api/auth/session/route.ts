import type { NextResponse } from "next/server";

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

export async function GET(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const viewer = await viewerFromRequest(request, new Date());

    if (viewer.kind === "anonymous") {
      return jsonOk({ signedIn: false as const, role: null, displayName: null }, NO_STORE);
    }

    return jsonOk(
      {
        signedIn: true as const,
        role: viewer.kind === "admin" ? ("ADMIN" as const) : ("COMPETITOR" as const),
        displayName: viewer.displayName,
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
