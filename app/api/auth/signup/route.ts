import type { NextResponse } from "next/server";

import { SignupSchema, createCompetitorAccount } from "@/lib/contest/accounts";
import { ensureEnrolled, type Enrolment } from "@/lib/contest/enrolment";
import { DomainError } from "@/lib/errors";
import { NO_STORE, handle, jsonOk, readJson } from "@/lib/contest/http";
import { passwordBackoff, passwordWork } from "@/lib/contest/rate-limit";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/contest/session";
import { issueSession } from "@/lib/contest/session-store";

/**
 * `POST /api/auth/signup` — create a competitor account with a name, email and password.
 *
 * OAuth remains the primary way in (one click, no password to forget on the night), but a student
 * without a Google or GitHub account, or one whose provider is refusing, needs a door that does
 * not route through an organizer. This is that door. It creates the account, enrols it in the
 * open contest, and signs the student in, all in one submit: a sign-up that lands you on a page
 * telling you to now log in is two forms where one form's work was done.
 *
 * ## The guards are the password route's guards, shared on purpose
 *
 * `hashPassword` is the same deliberate 32 MB scrypt that verification uses, so an unauthenticated
 * flood of THIS endpoint exhausts the box exactly the way a login flood would. `passwordWork`
 * bounds how many hashes run at once and sheds the rest; `passwordBackoff` throttles by client.
 * Sharing the login route's buckets is correct here rather than tidy: they bound the same scarce
 * resource (scrypt memory), and the organizer PASSCODE keeps its own separate bucket for the same
 * reason it always has — the operational fallback must not be lockable by anyone else's traffic.
 *
 * Enrolment failing (no open contest) refuses BEFORE the session is minted, with the same sentence
 * the password route uses. The account itself still exists at that point, deliberately: the
 * student's sign-up worked, and when an organizer opens the contest their next login completes.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const input = await readJson(request, SignupSchema);

    const user = await passwordWork.run(async () => {
      await passwordBackoff.throttle();
      try {
        const created = await createCompetitorAccount(input);
        passwordBackoff.recordSuccess();
        return created;
      } catch (error: unknown) {
        passwordBackoff.recordFailure();
        throw error;
      }
    }, "Too many sign-ups are in flight. Try again in a moment.");

    const enrolment: Enrolment | null = await ensureEnrolled(user.userId, user.displayName);
    if (enrolment === null) {
      throw new DomainError(
        "CONTEST_NOT_RUNNING",
        "Your account is ready, but there is no contest open right now. An organizer needs to " +
          "open tonight's contest, then log in.",
      );
    }

    const session = await issueSession(
      {
        role: "COMPETITOR",
        // The same labelling note as the password route: the enum value is historical, and the
        // role beside it says which kind of person this is.
        method: "ADMIN_PASSWORD",
        displayName: user.displayName,
        userId: user.userId,
        participantId: enrolment.participantId,
        contestId: enrolment.contestId,
      },
      now,
    );

    const response = jsonOk({ role: "COMPETITOR" as const, displayName: user.displayName }, NO_STORE);
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions());
    return response;
  });
}
