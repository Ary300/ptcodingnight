import type { NextResponse } from "next/server";

import { EmailLoginSchema, authenticateWithPassword } from "@/lib/contest/accounts";
import { ensureEnrolled, type Enrolment } from "@/lib/contest/enrolment";
import { DomainError } from "@/lib/errors";
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
 *
 * ## Why a COMPETITOR is enrolled here too
 *
 * This route is not organizer-only, however much its doc comment implied it. An organizer can set a
 * password for a student whose provider is not working, and `SignInForm` routes the response by
 * ROLE precisely because a competitor can arrive through it.
 *
 * That path was broken, and silently. It minted a session with `userId` and nothing else, and
 * `viewerFromSession` returns ANONYMOUS for a COMPETITOR session whose participantId or contestId
 * is null. Measured against the running dev server: `POST /api/auth/password` answered
 * `200 {"role":"COMPETITOR"}`, set a session cookie, and `GET /api/auth/session` with that very
 * cookie answered `{"signedIn":false}`. The student is sent to /contest by a successful sign-in
 * and every screen there treats them as a stranger.
 *
 * The OAuth callback learned this lesson once already and this route was left behind. Enrolment
 * runs BEFORE the session is issued, for the same reason it does there: a session that cannot
 * compete must not be minted at all.
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

    // Organizers are not contestants: enrolling one would put them in a team's divisor.
    let enrolment: Enrolment | null = null;
    if (user.role === "COMPETITOR") {
      enrolment = await ensureEnrolled(user.userId, user.displayName);
      if (enrolment === null) {
        // No DRAFT, SCHEDULED or RUNNING contest exists. Refusing with a sentence that names the
        // real cause beats issuing a session that authorizes as nobody — the state the production
        // box was in when the demo contest expired and the site "looked dead".
        throw new DomainError(
          "CONTEST_NOT_RUNNING",
          "Your account is ready, but there is no contest open right now. An organizer needs to " +
            "open tonight's contest, then sign in again.",
        );
      }
    }

    const session = await issueSession(
      {
        role: user.role,
        // `ADMIN_PASSWORD` is a misnomer for a COMPETITOR signing in this way, and it stays one:
        // the value is a Postgres enum, so renaming it is a migration plus every historical
        // `Session.method` row, to fix a label an organizer reads on the live-sessions list. The
        // `role` beside it already says which kind of person this is. Noted so the next reader does
        // not conclude a competitor session was minted by the wrong route.
        method: "ADMIN_PASSWORD",
        displayName: user.displayName,
        userId: user.userId,
        participantId: enrolment?.participantId ?? null,
        contestId: enrolment?.contestId ?? null,
      },
      now,
    );

    const response = jsonOk({ role: user.role, displayName: user.displayName }, NO_STORE);
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions());
    return response;
  });
}
