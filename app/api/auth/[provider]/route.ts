import { NextResponse } from "next/server";

import { z } from "zod";

import { cookiesAreSecure, oauthConfig } from "@/lib/contest/env";
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
 * ## Every exit from here is a redirect, never a JSON envelope
 *
 * This is a URL a student's BROWSER navigates to — it is the href of a button, not a fetch. It
 * used to run through `handle()`, so an unconfigured provider or any thrown error painted a raw
 * API error envelope across the whole window:
 *
 *     {"ok":false,"error":{"code":"FORBIDDEN","message":"…"}}
 *
 * That is a dead end. There is no back button that helps, nothing on the page to click, and
 * nothing that tells the student to go and use the other provider. The same mistake was in the
 * callback and is fixed there the same way: put the reason in `?error=` on `/sign-in` and let the
 * page that owns sign-in render it next to the alternatives.
 *
 * The distinction the old 503 was drawing — "this server has no GitHub set up" is an operator
 * problem, not a failed sign-in — is worth keeping, so it is kept in the WORDING rather than in
 * the status code. The student is told it is not their fault and pointed at the other button.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ProviderParamsSchema = z.object({
  provider: z.enum(["google", "github"]),
});

/** Back to the page that owns sign-in, carrying the reason. Relative: never re-writes the origin. */
function toSignIn(error: string): NextResponse {
  return new NextResponse(null, {
    status: 302,
    headers: { location: `/sign-in?error=${encodeURIComponent(error)}` },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  const parsed = ProviderParamsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return toSignIn("That sign-in provider is not one this server offers.");
  }
  const { provider } = parsed.data;
  const label = provider === "google" ? "Google" : "GitHub";

  try {
    const config = oauthConfig(provider);
    if (config === null) {
      return toSignIn(
        `${label} sign-in is not set up on this server — that is our configuration, not your ` +
          `account. Try the other provider, or ask an organizer.`,
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
  } catch (caught: unknown) {
    // Logged with the provider, because the only causes are ours: a malformed PUBLIC_ORIGIN, or
    // an env that fails to parse. The student gets a sentence they can act on and never the
    // exception text, which would leak the shape of the configuration.
    console.error({
      event: "auth.oauth.start_failed",
      provider,
      message: caught instanceof Error ? caught.message : String(caught),
    });
    return toSignIn(`${label} sign-in could not be started. An organizer can sign you in instead.`);
  }
}
