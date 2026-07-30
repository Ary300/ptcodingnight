import type { NextResponse } from "next/server";

import { AdminLoginSchema, authenticateAdmin } from "@/lib/contest/admin";
import { NO_STORE, handle, jsonOk, readJson } from "@/lib/contest/http";
import {
  SESSION_COOKIE,
  clearedSessionCookieOptions,
  parseCookieHeader,
  sessionCookieOptions,
} from "@/lib/contest/session";
import { issueSession, revokeSessionByToken } from "@/lib/contest/session-store";

/**
 * `POST /api/admin/session` — organizer sign-in; `DELETE` — sign-out.
 *
 * Google sign-in restricted to the school domain is the preferred story (docs/PRD.md §4), but a
 * fallback that works with no internet has to exist, and on the night it is the one that runs.
 * The passcode lives in the environment — never in source — and is compared in constant time
 * behind a rate limit.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const input = await readJson(request, AdminLoginSchema);

    await authenticateAdmin(input);

    // ADMIN_PASSCODE: the night's fallback, and the path that must work with no internet.
    const session = await issueSession(
      { role: "ADMIN", method: "ADMIN_PASSCODE", displayName: "Organizer" },
      now,
    );

    const response = jsonOk({ role: "ADMIN" as const }, NO_STORE);
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions());
    return response;
  });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  return handle(async () => {
    // Sign-out now REVOKES the row rather than only clearing the cookie. Clearing the cookie
    // alone left a token that still authenticated if anyone had captured it.
    const token = parseCookieHeader(request.headers.get("cookie"))[SESSION_COOKIE];
    if (token !== undefined) {
      await revokeSessionByToken(token, "signed out", new Date());
    }

    const response = jsonOk({ role: null }, NO_STORE);
    response.cookies.set(SESSION_COOKIE, "", clearedSessionCookieOptions());
    return response;
  });
}
