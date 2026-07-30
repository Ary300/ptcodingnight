import { NextResponse } from "next/server";

import { z } from "zod";

import { DomainError } from "@/lib/errors";
import { cookiesAreSecure, oauthConfig } from "@/lib/contest/env";
import { handle, readParams } from "@/lib/contest/http";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_MS,
  authorizeUrlFor,
  hashOAuthState,
  newOAuthState,
} from "@/lib/contest/oauth";

/**
 * `GET /api/auth/{google|github}` — begin an OAuth sign-in.
 *
 * Mints a `state`, stores its HASH in a short-lived cookie, and redirects to the provider. The
 * cookie holds a hash rather than the state so that capturing the cookie does not yield a usable
 * state value.
 *
 * A provider with no credentials configured answers 503. That is a deliberate distinction: "this
 * server has no GitHub set up" is an operator problem, and reporting it as a failed sign-in would
 * send a student looking for a mistake they did not make.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ProviderParamsSchema = z.object({
  provider: z.enum(["google", "github"]),
});

export async function GET(
  _request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const { provider } = await readParams(context.params, ProviderParamsSchema);

    const config = oauthConfig(provider);
    if (config === null) {
      throw new DomainError(
        "VALIDATION",
        `${provider === "google" ? "Google" : "GitHub"} sign-in is not configured on this server. ` +
          "Use your email and password, or the contest join code.",
      );
    }

    const state = newOAuthState();
    const response = NextResponse.redirect(authorizeUrlFor(provider, config, state));

    response.cookies.set(OAUTH_STATE_COOKIE, hashOAuthState(state), {
      httpOnly: true,
      // `lax` is REQUIRED here, not merely sufficient. This cookie is read on the provider's
      // redirect back, which is a cross-site top-level navigation — exactly the request a
      // `strict` cookie is withheld from. Tightening this to `strict` does not harden anything;
      // it makes every Google and GitHub sign-in fail with a state mismatch.
      sameSite: "lax",
      path: "/api/auth",
      maxAge: Math.floor(OAUTH_STATE_MAX_AGE_MS / 1000),
      // Same source as the session cookie, and for the same reason (docs/AUTH.md §5). The state
      // value is a CSRF defence for the OAuth flow, so serving it over plain HTTP would let the
      // network path forge the thing that proves the flow was not forged.
      secure: cookiesAreSecure(),
    });

    return response;
  });
}
