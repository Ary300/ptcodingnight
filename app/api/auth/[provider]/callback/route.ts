import { NextResponse } from "next/server";

import { z } from "zod";

import { DomainError } from "@/lib/errors";
import { linkedUserFor, providerLabel } from "@/lib/contest/accounts";
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
 *  4. The identity must resolve to an EXISTING account. It never creates one — see
 *     docs/AUTH.md §3.
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

    const session = await issueSession(
      {
        role: user.role,
        method: provider === "google" ? "GOOGLE" : "GITHUB",
        displayName: user.displayName,
        userId: user.userId,
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
