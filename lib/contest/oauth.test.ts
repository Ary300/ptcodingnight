import { describe, expect, it } from "vitest";

import {
  ENDPOINTS,
  OAuthError,
  authorizeUrlFor,
  hashOAuthState,
  identityFromCode,
  newOAuthState,
  oAuthStateMatches,
  type FetchLike,
  type OAuthProviderConfig,
} from "@/lib/contest/oauth";

/**
 * OAuth flow, tested without a network.
 *
 * `identityFromCode` takes a `fetch`-shaped function, so the provider responses below are the real
 * shapes Google and GitHub return — including the awkward ones, like GitHub omitting the email from
 * `/user` and Google sending `email_verified` as the string `"true"`.
 */

const config: OAuthProviderConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "http://contest.local/api/auth/google/callback",
};

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "RS256" })}.${b64(payload)}.signature-not-checked`;
}

/** A fetch stub that answers by URL substring. */
function stubFetch(routes: Record<string, { ok?: boolean; body: unknown }>): FetchLike {
  return (input) => {
    for (const [fragment, response] of Object.entries(routes)) {
      if (input.includes(fragment)) {
        return Promise.resolve({
          ok: response.ok ?? true,
          json: () => Promise.resolve(response.body),
        } as Response);
      }
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
  };
}

describe("state (CSRF)", () => {
  it("never mints the same state twice", () => {
    const states = new Set(Array.from({ length: 200 }, () => newOAuthState()));
    expect(states.size).toBe(200);
  });

  it("matches a state against its own hash", () => {
    const state = newOAuthState();
    expect(oAuthStateMatches(state, hashOAuthState(state))).toBe(true);
  });

  it("rejects a state that does not match", () => {
    // Without this check, an attacker can complete an OAuth flow in a victim's browser and bind
    // their own provider account to the victim's session.
    expect(oAuthStateMatches(newOAuthState(), hashOAuthState(newOAuthState()))).toBe(false);
  });

  it("returns false rather than throwing on a malformed cookie", () => {
    expect(oAuthStateMatches(newOAuthState(), "")).toBe(false);
    expect(oAuthStateMatches(newOAuthState(), "short")).toBe(false);
  });

  it("stores a hash, not the state itself", () => {
    const state = newOAuthState();
    expect(hashOAuthState(state)).not.toBe(state);
  });
});

describe("authorizeUrlFor", () => {
  it("includes the state, so the callback can be checked", () => {
    const url = new URL(authorizeUrlFor("google", config, "the-state"));
    expect(url.searchParams.get("state")).toBe("the-state");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("never puts the client secret in a URL the browser sees", () => {
    const url = authorizeUrlFor("google", config, "s");
    expect(url).not.toContain("client-secret");
  });

  it("forces Google's account chooser", () => {
    // On a shared classroom machine the default silently reuses whoever signed in last, which is
    // how a student ends up submitting as someone else.
    const url = new URL(authorizeUrlFor("google", config, "s"));
    expect(url.searchParams.get("prompt")).toBe("select_account");
  });

  it("asks GitHub for the scope that reveals a verified email", () => {
    const url = new URL(authorizeUrlFor("github", config, "s"));
    expect(url.searchParams.get("scope")).toBe(ENDPOINTS.github.scope);
    expect(url.searchParams.get("scope")).toContain("user:email");
  });
});

describe("identityFromCode — Google", () => {
  it("reads the subject and verified email from the id_token", async () => {
    const identity = await identityFromCode(
      "google",
      config,
      "the-code",
      stubFetch({
        "oauth2.googleapis.com/token": {
          body: {
            id_token: jwt({
              sub: "google-subject-1",
              email: "ada@parktudor.org",
              email_verified: true,
              name: "Ada L",
            }),
          },
        },
      }),
    );

    expect(identity.provider).toBe("google");
    expect(identity.subject).toBe("google-subject-1");
    expect(identity.email).toBe("ada@parktudor.org");
    expect(identity.emailVerified).toBe(true);
    expect(identity.displayName).toBe("Ada L");
  });

  it('accepts email_verified as the string "true"', async () => {
    // Google really does send it as a string in some flows, and reading it as a boolean silently
    // makes every email unverified — which would make Google sign-in never match an account.
    const identity = await identityFromCode(
      "google",
      config,
      "c",
      stubFetch({
        token: { body: { id_token: jwt({ sub: "s", email: "ada@parktudor.org", email_verified: "true" }) } },
      }),
    );

    expect(identity.emailVerified).toBe(true);
  });

  it("reports an unverified email as unverified", async () => {
    const identity = await identityFromCode(
      "google",
      config,
      "c",
      stubFetch({
        token: { body: { id_token: jwt({ sub: "s", email: "ada@parktudor.org", email_verified: false }) } },
      }),
    );

    expect(identity.emailVerified).toBe(false);
  });

  it("throws when the code is rejected", async () => {
    await expect(
      identityFromCode("google", config, "bad", stubFetch({ token: { ok: false, body: {} } })),
    ).rejects.toThrow(OAuthError);
  });

  it("throws when there is no id_token", async () => {
    await expect(
      identityFromCode("google", config, "c", stubFetch({ token: { body: {} } })),
    ).rejects.toThrow(/no id_token/);
  });

  it("throws on an unreadable id_token rather than trusting it", async () => {
    await expect(
      identityFromCode("google", config, "c", stubFetch({ token: { body: { id_token: "nonsense" } } })),
    ).rejects.toThrow(OAuthError);
  });
});

describe("identityFromCode — GitHub", () => {
  it("uses the numeric id as the subject, never the login", async () => {
    // A GitHub username is renameable and reusable, so keying an account on it eventually hands
    // one person's account to another.
    const identity = await identityFromCode(
      "github",
      config,
      "c",
      stubFetch({
        "github.com/login/oauth/access_token": { body: { access_token: "gho_x" } },
        "api.github.com/user/emails": {
          body: [
            { email: "old@example.com", primary: false, verified: true },
            { email: "ada@parktudor.org", primary: true, verified: true },
          ],
        },
        "api.github.com/user": { body: { id: 4242, login: "ada", name: "Ada L", email: null } },
      }),
    );

    expect(identity.subject).toBe("4242");
    expect(identity.subject).not.toBe("ada");
    expect(identity.email).toBe("ada@parktudor.org");
    expect(identity.emailVerified).toBe(true);
  });

  it("does not treat an unverified primary email as verified", async () => {
    const identity = await identityFromCode(
      "github",
      config,
      "c",
      stubFetch({
        "login/oauth/access_token": { body: { access_token: "t" } },
        "api.github.com/user/emails": {
          body: [{ email: "spoof@parktudor.org", primary: true, verified: false }],
        },
        "api.github.com/user": { body: { id: 1, login: "x", name: null, email: null } },
      }),
    );

    expect(identity.emailVerified).toBe(false);
  });

  it("survives the emails endpoint being unavailable", async () => {
    // The scope may not have been granted. That is a "cannot match an account" case, not a 500.
    const identity = await identityFromCode(
      "github",
      config,
      "c",
      stubFetch({
        "login/oauth/access_token": { body: { access_token: "t" } },
        "api.github.com/user": { body: { id: 7, login: "solo", name: null, email: null } },
      }),
    );

    expect(identity.subject).toBe("7");
    expect(identity.emailVerified).toBe(false);
    expect(identity.displayName).toBe("solo");
  });

  it("throws when there is no access_token", async () => {
    await expect(
      identityFromCode("github", config, "c", stubFetch({ "access_token": { body: {} } })),
    ).rejects.toThrow(/no access_token/);
  });
});
