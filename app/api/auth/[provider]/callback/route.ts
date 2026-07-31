import { NextResponse } from "next/server";

import { z } from "zod";

import { DomainError } from "@/lib/errors";
import { linkedUserFor, providerLabel } from "@/lib/contest/accounts";
import { ensureEnrolled } from "@/lib/contest/enrolment";
import { cookiesAreSecure, oauthConfig } from "@/lib/contest/env";
import { handle, readParams } from "@/lib/contest/http";
import {
  OAUTH_STATE_COOKIE,
  identityFromCode,
  oAuthStateMatches,
} from "@/lib/contest/oauth";
import {
  SESSION_COOKIE,
  parseCookieHeader,
  sessionCookieOptions,
} from "@/lib/contest/session";
import { issueSession } from "@/lib/contest/session-store";

/**
 * `GET /api/auth/{google|github}/callback` — finish an OAuth sign-in.
 *
 * Order matters here and each step is a refusal:
 *
 *  1. The provider may report its own error (`?error=access_denied` when someone cancels).
 *  2. `state` must match the hash in our cookie. **Without this check an attacker can complete a
 *     flow in a victim's browser and bind their own provider account to the victim's session.**
 *  3. The code is exchanged server-to-server for an identity.
 *  4. The identity resolves to an account, CREATING a competitor if there is not one yet, and
 *     then enrols them in the contest with no team.
 *
 * Step 4 used to read "must resolve to an EXISTING account; it never creates one". Students now
 * sign themselves up — there are no join codes on the front door — so the refusal moved rather
 * than disappeared: signing in can only ever produce a COMPETITOR, enforced by a literal in
 * `selfSignUpFromOAuth` and by a CHECK constraint that refuses an ADMIN with no password.
 *
 * On success this redirects rather than returning JSON, because the browser arrived here by
 * following a redirect from the provider and a JSON body would leave the student staring at it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ProviderParamsSchema = z.object({
  provider: z.enum(["google", "github"]),
});

/** Where a signed-in person lands, and where a failure sends them with a readable reason. */
function destination(request: Request, path: string, error?: string): URL {
  const url = new URL(path, new URL(request.url).origin);
  if (error !== undefined) url.searchParams.set("error", error);
  return url;
}

export async function GET(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { provider } = await readParams(context.params, ProviderParamsSchema);
    const url = new URL(request.url);

    const providerError = url.searchParams.get("error");
    if (providerError !== null) {
      // Cancelling at the consent screen is the common case and is not an error worth a stack
      // trace. Send them back to sign-in with something readable.
      return NextResponse.redirect(
        destination(request, "/sign-in", `${providerLabel(provider)} sign-in was cancelled`),
      );
    }

    const config = oauthConfig(provider);
    if (config === null) {
      throw new DomainError(
        "VALIDATION",
        `${providerLabel(provider)} sign-in is not configured on this server`,
      );
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const cookieHash = parseCookieHeader(request.headers.get("cookie"))[OAUTH_STATE_COOKIE];

    if (code === null || state === null) {
      throw new DomainError("VALIDATION", "That sign-in link is incomplete. Start again.");
    }

    if (cookieHash === undefined || !oAuthStateMatches(state, cookieHash)) {
      // Deliberately not "your cookie expired" versus "the state did not match": both mean start
      // over, and the difference is only interesting to someone probing.
      throw new DomainError(
        "FORBIDDEN",
        "That sign-in could not be verified. Start again from the sign-in page.",
      );
    }

    const identity = await identityFromCode(provider, config, code, fetch);
    const user = await linkedUserFor(identity);

    // Signing in enrols a competitor in the contest an organizer is preparing, with NO team.
    //
    // Without this a student signs in successfully, sees an empty contest, and the organizer's
    // roster shows nobody — two screens quietly wrong and no error to explain either. Team
    // membership is still decided in exactly one place; this only makes the student visible there.
    //
    // Competitors only: an organizer is not a contestant, and enrolling them would put them in a
    // team's divisor. Best-effort, because failing to enrol must not fail the sign-in — the
    // account exists either way and an organizer can add them by hand.
    let enrolment: Awaited<ReturnType<typeof ensureEnrolled>> = null;
    if (user.role === "COMPETITOR") {
      try {
        enrolment = await ensureEnrolled(user.userId, user.displayName);
      } catch {
        // Deliberately swallowed, and the only swallowed catch here. A sign-in that worked must
        // not be reported as broken because a contest row was momentarily unavailable.
      }
    }

    /*
      The session carries the PARTICIPANT, not just the user, and that is load-bearing.

      `viewerFromSession` returns ANONYMOUS for a COMPETITOR session whose participantId or
      contestId is null — so a session minted with only `userId` signs the student in and then
      authorizes them as nobody. They land on /contest, the problem list refuses them, and every
      submission is rejected: signup works and competing does not, with no error naming the cause.

      That is exactly what shipped when this route first learned to create accounts, and it is why
      enrolment happens BEFORE the session is issued rather than after.
    */
    const session = await issueSession(
      {
        role: user.role,
        method: provider === "google" ? "GOOGLE" : "GITHUB",
        displayName: user.displayName,
        userId: user.userId,
        participantId: enrolment?.participantId ?? null,
        contestId: enrolment?.contestId ?? null,
      },
      now,
    );

    const response = NextResponse.redirect(
      destination(request, user.role === "ADMIN" ? "/admin" : "/contest"),
    );
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions());
    // The state cookie has done its job; leaving it would let a stale value be replayed. The
    // attributes have to match the ones it was set with — `Secure` and `Path` are part of a
    // cookie's identity, so clearing without them leaves the original in place.
    response.cookies.set(OAUTH_STATE_COOKIE, "", {
      path: "/api/auth",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: cookiesAreSecure(),
    });
    return response;
  });
}
