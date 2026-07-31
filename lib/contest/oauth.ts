import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { z } from "zod";

/**
 * OAuth provider plumbing for Google and GitHub.
 *
 * Pure and I/O-free apart from the token exchange, which is passed in as a `fetch`-shaped function
 * so the flow is testable without a network. The database side lives in `linkedUserFor`.
 *
 * ## The invariant that matters
 *
 * This said "**neither provider can create an account** — `User.passwordHash` is NOT NULL, so an
 * OAuth-only account is unrepresentable". Every clause of that is now wrong: `passwordHash` is
 * nullable, a first sign-in creates the account, and there is no join code left to fall back to.
 * A comment describing a refusal that no longer exists is worse than no comment, because the next
 * reader goes looking for the check.
 *
 * What is true, and is enforced twice, is narrower: **signing in can create a COMPETITOR and can
 * never produce an ADMIN.** `selfSignUpFromOAuth` writes the role as a literal, and a CHECK
 * constraint refuses an ADMIN with no password regardless of which code path asks.
 *
 * Internet at the event is guaranteed (PRD §10.1), so the organizer passcode fallback is not about
 * the venue. It is about OAuth's own failure modes, which have nothing to do with the room: an
 * expired client secret, a changed consent screen, a student without a school account, a provider
 * having an afternoon. A contest that cannot start because Google is unavailable is a contest that
 * cannot start.
 *
 * ## CSRF
 *
 * The `state` parameter is mandatory here, not optional. Without it, an attacker can complete an
 * OAuth flow in a victim's browser and bind their own provider account to the victim's session.
 * State is a random value, stored hashed in a short-lived cookie, and compared in constant time.
 */

export type OAuthProvider = "google" | "github";

/** What a provider tells us about the person who just signed in. */
export interface OAuthIdentity {
  readonly provider: OAuthProvider;
  /**
   * The provider's STABLE subject id. Never an email or a username.
   *
   * Emails get reassigned between people and GitHub usernames are renameable and reusable, so
   * keying an account on either eventually hands one person's account to another.
   */
  readonly subject: string;
  readonly email: string | null;
  /**
   * Whether the provider asserts the email is verified.
   *
   * Only a verified email may be used to match an existing account. An unverified one is a claim
   * by the person signing in, not by the provider, and matching on it would let anyone who can set
   * their profile email to an organizer's address take that organizer's account.
   */
  readonly emailVerified: boolean;
  readonly displayName: string | null;
}

/* ------------------------------------------------------------------------ */
/* State (CSRF)                                                              */
/* ------------------------------------------------------------------------ */

export const OAUTH_STATE_COOKIE = "ptcn_oauth_state";

/** How long a sign-in attempt may sit half-finished. Long enough to read a consent screen. */
export const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

export function newOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

/** The cookie stores a hash, so a stolen cookie does not reveal a usable state value. */
export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("base64url");
}

export function oAuthStateMatches(stateFromProvider: string, hashFromCookie: string): boolean {
  const expected = Buffer.from(hashOAuthState(stateFromProvider), "utf8");
  const provided = Buffer.from(hashFromCookie, "utf8");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

/* ------------------------------------------------------------------------ */
/* Provider configuration                                                    */
/* ------------------------------------------------------------------------ */

export interface OAuthProviderConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

export interface OAuthEndpoints {
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly scope: string;
}

export const ENDPOINTS: Readonly<Record<OAuthProvider, OAuthEndpoints>> = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    // openid gets us an id_token, which carries `sub` and `email_verified` directly — no extra
    // round trip to a userinfo endpoint.
    scope: "openid email profile",
  },
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    // GitHub has no OIDC id_token here, so the email has to be fetched separately, and a user's
    // primary email is only visible with this scope.
    scope: "read:user user:email",
  },
};

/** Build the URL to send the browser to. */
export function authorizeUrlFor(
  provider: OAuthProvider,
  config: OAuthProviderConfig,
  state: string,
): string {
  const endpoints = ENDPOINTS[provider];
  const url = new URL(endpoints.authorizeUrl);

  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", endpoints.scope);
  url.searchParams.set("state", state);

  if (provider === "google") {
    // `select_account` rather than the default: on a shared classroom machine the default silently
    // reuses whoever signed in last, which is how a student ends up submitting as someone else.
    url.searchParams.set("prompt", "select_account");
  }

  return url.toString();
}

/* ------------------------------------------------------------------------ */
/* Token exchange and identity                                               */
/* ------------------------------------------------------------------------ */

const GoogleIdTokenClaims = z.object({
  sub: z.string().min(1),
  email: z.email().optional(),
  email_verified: z.union([z.boolean(), z.literal("true"), z.literal("false")]).optional(),
  name: z.string().optional(),
});

const GitHubUser = z.object({
  id: z.number().int(),
  login: z.string().min(1),
  name: z.string().nullable().optional(),
  email: z.email().nullable().optional(),
});

const GitHubEmail = z.object({
  email: z.email(),
  primary: z.boolean(),
  verified: z.boolean(),
});

/**
 * Decode a JWT payload WITHOUT verifying its signature.
 *
 * Safe only in this exact position, and the reason is worth stating: the id_token came directly
 * from Google's token endpoint over TLS in response to our own client secret. It was not supplied
 * by the browser, so there is no attacker in a position to forge it. Verifying the signature would
 * mean fetching and caching Google's JWKS for no additional security here.
 *
 * **This would be wrong for an id_token arriving any other way** — one posted by a client must
 * always have its signature checked.
 */
function decodeJwtPayload(token: string): unknown {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = parts[1];
  if (payload === undefined) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class OAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthError";
  }
}

/** Exchange the authorization code for an identity. */
export async function identityFromCode(
  provider: OAuthProvider,
  config: OAuthProviderConfig,
  code: string,
  fetchImpl: FetchLike = fetch,
): Promise<OAuthIdentity> {
  const endpoints = ENDPOINTS[provider];

  const tokenResponse = await fetchImpl(endpoints.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    throw new OAuthError(`${provider} rejected the authorization code`);
  }

  const token = (await tokenResponse.json()) as Record<string, unknown>;

  if (provider === "google") {
    const idToken = token.id_token;
    if (typeof idToken !== "string") throw new OAuthError("Google returned no id_token");

    const claims = GoogleIdTokenClaims.safeParse(decodeJwtPayload(idToken));
    if (!claims.success) throw new OAuthError("Google returned an id_token we cannot read");

    const verified = claims.data.email_verified;
    return {
      provider: "google",
      subject: claims.data.sub,
      email: claims.data.email ?? null,
      emailVerified: verified === true || verified === "true",
      displayName: claims.data.name ?? null,
    };
  }

  const accessToken = token.access_token;
  if (typeof accessToken !== "string") throw new OAuthError("GitHub returned no access_token");

  const authHeaders = {
    authorization: `Bearer ${accessToken}`,
    accept: "application/vnd.github+json",
    "user-agent": "park-tudor-coding-night",
  };

  const userResponse = await fetchImpl("https://api.github.com/user", { headers: authHeaders });
  if (!userResponse.ok) throw new OAuthError("GitHub would not describe the account");

  const user = GitHubUser.safeParse(await userResponse.json());
  if (!user.success) throw new OAuthError("GitHub returned an account we cannot read");

  // /user omits the email unless it is public, so ask explicitly and take the primary VERIFIED one.
  let email: string | null = user.data.email ?? null;
  let emailVerified = false;

  const emailsResponse = await fetchImpl("https://api.github.com/user/emails", {
    headers: authHeaders,
  });
  if (emailsResponse.ok) {
    const parsed = z.array(GitHubEmail).safeParse(await emailsResponse.json());
    if (parsed.success) {
      const primary = parsed.data.find((e) => e.primary && e.verified);
      if (primary !== undefined) {
        email = primary.email;
        emailVerified = true;
      }
    }
  }

  return {
    provider: "github",
    // GitHub's numeric id, as a string. Never `login`, which is renameable and reusable.
    subject: String(user.data.id),
    email,
    emailVerified,
    displayName: user.data.name ?? user.data.login,
  };
}
