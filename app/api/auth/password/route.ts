import type { NextResponse } from "next/server";

import { EmailLoginSchema, authenticateWithPassword } from "@/lib/contest/accounts";
import { NO_STORE, handle, jsonOk, readJson } from "@/lib/contest/http";
import { passwordBackoff, passwordWork } from "@/lib/contest/rate-limit";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/contest/session";
import { issueSession } from "@/lib/contest/session-store";

/**
 * `POST /api/auth/password` — sign in with an admin-issued email and password.
 *
 * Guarded by CredentialBackoff. Without it, the constant-time comparison and the indistinguishable
 * error messages in `authenticateWithPassword` only slow an attacker down; they do not stop one
 * walking a password list.
 *
 * The limiter is its OWN bucket, deliberately NOT shared with the organizer passcode. Sharing them
 * looks tidy and is wrong: the passcode is the operational fallback that has to work on the night, so
 * an organizer who mistypes their password ten times must not thereby lose access to it. One bucket
 * inverts the point of having a fallback. (It WAS one bucket, `credentialBackoff`, while this
 * comment said otherwise — now `passwordBackoff`.)
 *
 * Backoff alone is not a resource bound, which is the other half of the guard here. Verification
 * is a deliberate 32 MB scrypt that runs even for an address that does not exist, so an
 * unauthenticated flood of this endpoint exhausts the box no matter how long each request first
 * sleeps. `passwordWork` bounds how many run at once and sheds the rest.
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

    // Parsed BEFORE the throttle, so a malformed body is rejected without occupying a slot.
    const input = await readJson(request, EmailLoginSchema);

    // Backoff rather than a counter, for the same reason the organizer passcode uses it: the only
    // client identity available here is attacker-supplied, and a shared hard limit would let a
    // student lock an organizer out mid-contest. Delay slows guessing without shutting anyone out.
    //
    // Inside the concurrency bound, so the SLEEPING requests are bounded too — 500 of them
    // sleeping in parallel and then all hitting scrypt at once is the exact failure this guards.
    const user = await passwordWork.run(async () => {
      await passwordBackoff.throttle();
      try {
        const authenticated = await authenticateWithPassword(input);
        passwordBackoff.recordSuccess();
        return authenticated;
      } catch (error: unknown) {
        passwordBackoff.recordFailure();
        throw error;
      }
    }, "Too many sign-in attempts are in flight. Try again in a moment.");

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
