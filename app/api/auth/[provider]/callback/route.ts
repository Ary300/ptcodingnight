import { NextResponse } from "next/server";

import { z } from "zod";

import {
  AccountDisabledError,
  ProviderLinkConflictError,
  linkedUserFor,
} from "@/lib/contest/accounts";
import { ensureEnrolled, type Enrolment } from "@/lib/contest/enrolment";
import { cookiesAreSecure, oauthConfig } from "@/lib/contest/env";
import {
  OAUTH_STATE_COOKIE,
  OAuthError,
  identityFromCode,
  oAuthStateMatches,
  type OAuthProvider,
} from "@/lib/contest/oauth";
import {
  signInErrorLocation,
  type SignInErrorCode,
} from "@/lib/contest/sign-in-errors";
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
 * ## THIS ROUTE DOES NOT RUN THROUGH `handle()`, AND THAT IS THE POINT
 *
 * It did, and every failure it did not explicitly redirect on therefore answered a top-level
 * browser navigation with
 *
 *     {"success":false,"data":null,"error":{"code":"NOT_FOUND","message":"Not found"}}
 *
 * painted across the whole window. Measured on the running dev server:
 * `GET /api/auth/facebook/callback?code=x&state=y` → `404` and exactly that body. The same door
 * was open for every real failure that arrives as a throw rather than as a branch — a disabled
 * account, an email already linked to another provider subject, a token exchange the provider
 * refused. Each of those is a thing a student can genuinely hit on the night, and each of them
 * ended at raw JSON with nothing to click.
 *
 * The start route was fixed for this and the callback was not, which is the general shape of the
 * bug: `handle()` is right for a route a `fetch()` calls and wrong for a route a browser NAVIGATES
 * to (CLAUDE.md). So there is no `handle()` here. Every exit — including the catch-all — is a 302
 * to `/sign-in`, and the reason travels as a code that `lib/contest/sign-in-errors.ts` turns into
 * a sentence.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ProviderParamsSchema = z.object({
  provider: z.enum(["google", "github"]),
});

/**
 * Where a signed-in person lands, and where a failure sends them with a readable reason.
 *
 * A RELATIVE Location, deliberately. This used to rebuild an absolute URL from
 * `new URL(request.url).origin`, which means inventing a scheme and a host — and it invented the
 * wrong ones: a GitHub sign-in on localhost ended at `https://localhost:3000/contest`, which the
 * browser cannot open, after a callback that had actually succeeded.
 *
 * A relative Location is valid (RFC 7231 §7.1.2) and the browser resolves it against the URL it
 * is already on, so the scheme and host are whatever the student is genuinely using. There is no
 * configuration to get wrong and nothing to disagree with a proxy about.
 */
function redirectTo(path: string): NextResponse {
  return new NextResponse(null, { status: 302, headers: { location: path } });
}

/**
 * Clear the state cookie on the way out — on FAILURE too, not only on success.
 *
 * The success path always cleared it and the failure paths did not, so a cancelled or unverified
 * attempt left a live state hash sitting in the browser for the rest of its ten minutes. Nothing
 * dramatic follows from that, but a CSRF nonce that outlives the exchange it was minted for is a
 * nonce in name only, and "we cleaned up unless something went wrong" is the wrong default for a
 * credential.
 *
 * The attributes have to match the ones it was set with — `Secure` and `Path` are part of a
 * cookie's identity, so clearing without them leaves the original in place.
 */
function clearingState(response: NextResponse): NextResponse {
  response.cookies.set(OAUTH_STATE_COOKIE, "", {
    path: "/api/auth",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: cookiesAreSecure(),
  });
  return response;
}

function toSignIn(code: SignInErrorCode, provider: OAuthProvider | null): NextResponse {
  return clearingState(redirectTo(signInErrorLocation(code, provider ?? undefined)));
}

export async function GET(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  /*
    `provider` is resolved INSIDE the try, and hoisted so the catch can still name it.

    Everything in this handler is inside one try for a single reason: the invariant is "no exit
    from this route is a JSON envelope", and an exit that escapes the handler is not an exit this
    route chose — Next answers it, with its own error page or its own 500. Awaiting `context.params`
    before the try left exactly one statement outside the guarantee. It is unlikely to reject; a
    guarantee with one unlikely hole in it is not a guarantee.
  */
  let provider: OAuthProvider | null = null;

  try {
    // `safeParse`, not `readParams`: `readParams` throws a NOT_FOUND, which used to become a 404
    // JSON body in front of a student. An unknown provider is a redirect like everything else.
    const parsed = ProviderParamsSchema.safeParse(await context.params);
    if (!parsed.success) return toSignIn("provider_unknown", null);
    provider = parsed.data.provider;

    const now = new Date();
    const url = new URL(request.url);

    const providerError = url.searchParams.get("error");
    if (providerError !== null) {
      // Cancelling at the consent screen is the common case and is not an error worth a stack
      // trace. Send them back to sign-in with something readable.
      return toSignIn("cancelled", provider);
    }

    const config = oauthConfig(provider);
    if (config === null) {
      return toSignIn("provider_unconfigured", provider);
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const cookieHash = parseCookieHeader(request.headers.get("cookie"))[OAUTH_STATE_COOKIE];

    if (code === null || state === null) {
      return toSignIn("state", provider);
    }

    if (cookieHash === undefined || !oAuthStateMatches(state, cookieHash)) {
      /*
        The student sees one message; the SERVER LOG says which of the two it was.

        Merging them in the response is right — "your cookie expired" versus "the state did not
        match" is only interesting to someone probing. Merging them in the log was not: the two
        have completely different causes, and an operator staring at a FORBIDDEN has no way to
        tell an expired state cookie (the student sat on the consent screen for over ten minutes,
        or the cookie was never stored) from a genuine mismatch.
      */
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "auth.oauth.state_rejected",
          provider,
          reason: cookieHash === undefined ? "no state cookie on the callback" : "state mismatch",
          hint:
            cookieHash === undefined
              ? "the cookie is set with path=/api/auth, SameSite=Lax and secure=COOKIE_SECURE — a secure cookie is never stored over plain HTTP"
              : "the flow was started in a different browser, or restarted in another tab",
        }),
      );

      return toSignIn("state", provider);
    }

    const identity = await identityFromCode(provider, config, code, fetch);
    const user = await linkedUserFor(identity);

    /*
      Signing in enrols a competitor in the contest an organizer is preparing, with NO team.

      Without this a student signs in successfully, sees an empty contest, and the organizer's
      roster shows nobody — two screens quietly wrong and no error to explain either. Team
      membership is still decided in exactly one place; this only makes the student visible there.

      Competitors only: an organizer is not a contestant, and enrolling them would put them in a
      team's divisor.

      ## Why this is no longer best-effort

      It was, with the reasoning "failing to enrol must not fail the sign-in — the account exists
      either way". That reasoning does not survive contact with `viewerFromSession`, which returns
      ANONYMOUS for a COMPETITOR session whose participantId is null. A swallowed enrolment failure
      therefore produced a session that authenticates as nobody: the student is bounced back to a
      sign-in page by every screen they open, `GET /api/auth/session` reports `signedIn: false`
      while their cookie sits right there, and nothing anywhere names the cause.

      That is the state the production box was in when the demo contest expired and "the site
      looked dead". The account still gets created — `linkedUserFor` already ran and committed —
      so nothing is lost by refusing here, and what the student reads names the actual problem:
      there is no contest open. An organizer opens one and the next sign-in works.
    */
    let enrolment: Enrolment | null = null;
    if (user.role === "COMPETITOR") {
      try {
        enrolment = await ensureEnrolled(user.userId, user.displayName);
      } catch (caught: unknown) {
        // Was a bare `catch {}` with a comment calling it the only swallowed catch in the file.
        // A swallowed catch on the path that decides whether a student can compete is not a
        // swallowed catch, it is an outage with the logging turned off.
        console.error(
          JSON.stringify({
            level: "error",
            event: "auth.enrolment_failed",
            provider,
            userId: user.userId,
            message: caught instanceof Error ? caught.message : String(caught),
          }),
        );
        return toSignIn("enrolment_failed", provider);
      }

      if (enrolment === null) {
        console.warn(
          JSON.stringify({
            level: "warn",
            event: "auth.no_enrollable_contest",
            provider,
            userId: user.userId,
            hint: "no contest in DRAFT, SCHEDULED or RUNNING — create one, or reopen the one that ended",
          }),
        );
        return toSignIn("no_contest", provider);
      }
    }

    /*
      The session carries the PARTICIPANT, not just the user, and that is load-bearing.

      `viewerFromSession` returns ANONYMOUS for a COMPETITOR session whose participantId or
      contestId is null — so a session minted with only `userId` signs the student in and then
      authorizes them as nobody. They land on /contest, the problem list refuses them, and every
      submission is rejected: signup works and competing does not, with no error naming the cause.

      That is exactly what shipped when this route first learned to create accounts, and it is why
      enrolment happens BEFORE the session is issued rather than after — and why the branch above
      refuses rather than continuing with a null.
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

    const response = clearingState(redirectTo(user.role === "ADMIN" ? "/admin" : "/contest"));
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions());
    return response;
  } catch (caught: unknown) {
    /*
      The catch-all that used to be `handle()`.

      Classified into codes rather than re-thrown, because every one of these arrives at a BROWSER.
      The two account refusals are matched by TYPE — see `AccountDisabledError` — and not by their
      message, so rewording a student-facing sentence cannot silently move a branch.
    */
    if (caught instanceof AccountDisabledError) return toSignIn("account_disabled", provider);
    if (caught instanceof ProviderLinkConflictError) {
      return toSignIn("account_linked_elsewhere", provider);
    }
    if (caught instanceof OAuthError) {
      // Ours or the provider's, never the student's: a stale client secret, a reused code, a
      // provider having an afternoon. The detail is for the log; the student gets a sentence.
      console.error(
        JSON.stringify({
          level: "error",
          event: "auth.oauth.exchange_failed",
          provider,
          message: caught.message,
        }),
      );
      return toSignIn("exchange", provider);
    }

    console.error(
      JSON.stringify({
        level: "error",
        event: "auth.oauth.callback_unhandled",
        provider,
        message: caught instanceof Error ? caught.message : String(caught),
        stack: caught instanceof Error ? caught.stack : null,
      }),
    );
    return toSignIn("unknown", provider);
  }
}
