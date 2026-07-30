import type { NextResponse } from "next/server";

import { EmailLoginSchema, authenticateWithPassword } from "@/lib/contest/accounts";
import { NO_STORE, handle, jsonOk, readJson } from "@/lib/contest/http";
import { clientKey, passwordLoginLimiter } from "@/lib/contest/rate-limit";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/contest/session";
import { issueSession } from "@/lib/contest/session-store";

/**
 * `POST /api/auth/password` — sign in with an admin-issued email and password.
 *
 * Rate limited per client. Without a limiter the constant-time comparison and the
 * indistinguishable error messages in `authenticateWithPassword` only slow an attacker down;
 * they do not stop one walking a password list.
 *
 * The limiter is its OWN bucket, deliberately NOT shared with the organizer passcode. Sharing them
 * looks tidy and is wrong: the passcode is the operational fallback that has to work on the night, so
 * an organizer who mistypes their password ten times must not thereby lose access to it. One bucket
 * inverts the point of having a fallback.
 *
 * Keyed by client, not by email — keying by email would let anyone lock out a named organizer by
 * hammering their address, which is an account-lockout denial of service aimed at the person most
 * needed during a contest.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();

    passwordLoginLimiter.consumeOrThrow(
      clientKey(request),
      now,
      "Too many sign-in attempts. Wait a few minutes.",
    );

    const input = await readJson(request, EmailLoginSchema);
    const user = await authenticateWithPassword(input);

    const session = await issueSession(
      {
        role: user.role,
        method: "ADMIN_PASSWORD",
        displayName: user.displayName,
        userId: user.userId,
      },
      now,
    );

    const response = jsonOk({ role: user.role, displayName: user.displayName }, NO_STORE);
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions());
    return response;
  });
}
