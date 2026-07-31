import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountDisabledError, ProviderLinkConflictError } from "@/lib/contest/accounts";
import { OAuthError, hashOAuthState, newOAuthState } from "@/lib/contest/oauth";
import { signInErrorMessage } from "@/lib/contest/sign-in-errors";

/**
 * `GET /api/auth/{provider}/callback`, driven directly with a stubbed provider.
 *
 * ## Why this is a unit test and not a G7 spec
 *
 * The callback cannot be exercised over HTTP on a machine without Google and GitHub client
 * credentials: `oauthConfig()` returns null and the route redirects before it reaches any of the
 * behaviour below. The interesting half of this route is everything AFTER the consent screen, so
 * the module is imported and its dependencies stubbed — the same technique `lib/contest/oauth.test.ts`
 * uses for the token exchange, one layer up.
 *
 * ## The property every case here shares
 *
 * **A browser navigates to this URL, so it must never answer with a JSON envelope** (CLAUDE.md).
 * The route was wrapped in `handle()`, which is the right edge for a route `fetch()` calls and the
 * wrong one here, so anything that arrived as a THROW rather than as a branch painted
 *
 *     {"success":false,"data":null,"error":{"code":"NOT_FOUND","message":"Not found"}}
 *
 * across the whole window. Measured on the running dev server before the fix:
 * `GET /api/auth/facebook/callback?code=x&state=y` → 404 with exactly that body. A disabled
 * account, an email already linked to another provider subject, and a refused token exchange all
 * went out the same door — and all three are things a student can hit on the night.
 *
 * So every test asserts the shape as well as the reason: 302, a relative `location`, an empty body.
 */

const issueSession = vi.fn();
const linkedUserFor = vi.fn();
const ensureEnrolled = vi.fn();
const identityFromCode = vi.fn();
const oauthConfig = vi.fn();

// Stubbed rather than read from `.env`, so this suite stays DB-free and env-free: the whole point
// is the branch taken when a provider IS configured, which no developer machine has.
// `cookiesAreSecure` is here because `session.ts` imports it, not because this route calls it.
vi.mock("@/lib/contest/env", () => ({
  oauthConfig: (provider: string) => oauthConfig(provider) as unknown,
  cookiesAreSecure: () => false,
}));

vi.mock("@/lib/contest/session-store", () => ({
  issueSession: (...args: unknown[]) => issueSession(...args) as unknown,
}));

vi.mock("@/lib/contest/enrolment", () => ({
  ensureEnrolled: (...args: unknown[]) => ensureEnrolled(...args) as unknown,
}));

vi.mock("@/lib/contest/accounts", async (importOriginal) => {
  // The two error CLASSES stay real: the route matches on them with `instanceof`, which is the
  // whole point of them being types rather than message strings.
  const actual = await importOriginal<typeof import("@/lib/contest/accounts")>();
  return { ...actual, linkedUserFor: (...args: unknown[]) => linkedUserFor(...args) as unknown };
});

vi.mock("@/lib/contest/oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/contest/oauth")>();
  return {
    ...actual,
    identityFromCode: (...args: unknown[]) => identityFromCode(...args) as unknown,
  };
});

const { GET } = await import("@/app/api/auth/[provider]/callback/route");

const CONFIG = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "http://localhost:3000/api/auth/google/callback",
};

const IDENTITY = {
  provider: "google" as const,
  subject: "google-subject-1",
  email: "student@parktudor.org",
  emailVerified: true,
  displayName: "A Student",
};

interface CallOptions {
  readonly provider?: string;
  readonly query?: string;
  /** Omit for "the browser sent no state cookie". */
  readonly state?: string | null;
}

/** Drive the route the way a browser arriving back from a provider does. */
async function callback(options: CallOptions = {}) {
  const provider = options.provider ?? "google";
  const state = options.state === undefined ? newOAuthState() : options.state;
  const query =
    options.query ?? (state === null ? "code=the-code" : `code=the-code&state=${state}`);

  const headers = new Headers();
  if (state !== null) headers.set("cookie", `ptcn_oauth_state=${hashOAuthState(state)}`);

  const response = await GET(
    new Request(`http://localhost:3000/api/auth/${provider}/callback?${query}`, { headers }),
    { params: Promise.resolve({ provider }) },
  );

  const location = response.headers.get("location") ?? "";
  const body = await response.text();
  const params = new URLSearchParams(location.includes("?") ? location.split("?")[1] : "");

  return {
    status: response.status,
    location,
    body,
    setCookie: response.headers.getSetCookie(),
    /** The sentence a student actually reads, resolved the way the page resolves it. */
    message: signInErrorMessage(params.get("error"), params.get("provider")),
  };
}

/** Every exit from this route, success or failure, must look like this. */
function expectBrowserRedirect(result: Awaited<ReturnType<typeof callback>>): void {
  expect(result.status, "a browser navigation must be answered with a redirect").toBe(302);
  expect(result.body, "an API envelope was painted in front of a student").toBe("");
  expect(result.location, "an absolute Location invents a scheme and a host").not.toContain("://");
  expect(result.location.startsWith("/")).toBe(true);
}

beforeEach(() => {
  vi.clearAllMocks();
  oauthConfig.mockReturnValue(CONFIG);
  identityFromCode.mockResolvedValue(IDENTITY);
  linkedUserFor.mockResolvedValue({
    userId: "user-1",
    displayName: "A Student",
    role: "COMPETITOR",
  });
  ensureEnrolled.mockResolvedValue({
    contestId: "contest-1",
    participantId: "participant-1",
    created: true,
  });
  issueSession.mockResolvedValue({
    token: "session-token",
    sessionId: "session-1",
    expiresAt: new Date(),
  });
});

describe("a successful first sign-in", () => {
  it("issues a session carrying BOTH participantId and contestId", async () => {
    /*
      The regression this pins, and it is the one that costs a student their night:
      `viewerFromSession` returns ANONYMOUS for a COMPETITOR session whose participantId or
      contestId is null. A session minted with only `userId` therefore signs the student in and
      authorizes them as nobody — they land on /contest, the problem list refuses them, and every
      submission is rejected, with nothing anywhere naming the cause.
    */
    const result = await callback();

    expect(result.status).toBe(302);
    expect(result.location).toBe("/contest");

    expect(issueSession).toHaveBeenCalledTimes(1);
    const input = issueSession.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input.participantId).toBe("participant-1");
    expect(input.contestId).toBe("contest-1");
    expect(input.userId).toBe("user-1");
    expect(input.role).toBe("COMPETITOR");
    expect(input.method).toBe("GOOGLE");
  });

  it("enrols BEFORE issuing the session, so a half-populated session cannot exist", async () => {
    const order: string[] = [];
    ensureEnrolled.mockImplementation(() => {
      order.push("enrol");
      return Promise.resolve({ contestId: "c", participantId: "p", created: true });
    });
    issueSession.mockImplementation(() => {
      order.push("session");
      return Promise.resolve({ token: "t", sessionId: "s", expiresAt: new Date() });
    });

    await callback();
    expect(order).toEqual(["enrol", "session"]);
  });

  it("sets the session cookie and CLEARS the state cookie", async () => {
    const cookies = (await callback()).setCookie.join("\n");
    expect(cookies).toContain("ptcn_session=session-token");
    // A CSRF nonce that outlives the exchange it was minted for is a nonce in name only.
    expect(cookies).toMatch(/ptcn_oauth_state=;/);
  });

  it("sends an ADMIN to the console and never enrols one", async () => {
    // An organizer is not a contestant: enrolling them would put them in a team's divisor.
    linkedUserFor.mockResolvedValue({ userId: "u", displayName: "Organizer", role: "ADMIN" });

    const result = await callback();

    expect(result.location).toBe("/admin");
    expect(ensureEnrolled).not.toHaveBeenCalled();
  });

  it("re-uses the account on a second sign-in rather than creating a duplicate", async () => {
    // `linkedUserFor` keys on the provider's stable subject, so the same identity twice is one
    // account. Asserted here at the route level: two callbacks, one userId, two sessions.
    await callback();
    await callback();

    expect(linkedUserFor).toHaveBeenCalledTimes(2);
    const first = issueSession.mock.calls[0]?.[0] as { userId: string };
    const second = issueSession.mock.calls[1]?.[0] as { userId: string };
    expect(second.userId).toBe(first.userId);
  });
});

describe("the failure nobody plans for: no contest, or the only one has ENDED", () => {
  it("says so, instead of minting a session that authorizes as nobody", async () => {
    /*
      What the production box did: the demo contest expired, `ensureEnrolled` returned null, the
      route swallowed it and signed the student in anyway. The session had a null participantId,
      so every screen treated them as a stranger and `GET /api/auth/session` answered
      `{"signedIn":false}` while their cookie sat right there. The site "looked dead" and nothing
      said why.
    */
    ensureEnrolled.mockResolvedValue(null);

    const result = await callback();

    expectBrowserRedirect(result);
    expect(issueSession, "a session that cannot compete must not be minted").not.toHaveBeenCalled();
    expect(result.message).toContain("no contest open");
    expect(result.message?.toLowerCase()).toContain("organizer");
  });

  it("distinguishes a broken enrolment from an absent contest, because one is worth retrying", async () => {
    ensureEnrolled.mockRejectedValue(new Error("connection terminated unexpectedly"));

    const result = await callback();

    expectBrowserRedirect(result);
    expect(issueSession).not.toHaveBeenCalled();
    expect(result.message).toContain("Try signing in again");
    // And never the exception text.
    expect(result.location).not.toContain("connection terminated");
    expect(result.message).not.toContain("connection terminated");
  });
});

describe("every refusal lands on a PAGE, never on a JSON envelope", () => {
  it("an unknown provider — the case that measurably returned 404 JSON", async () => {
    const result = await callback({ provider: "facebook" });

    expectBrowserRedirect(result);
    expect(result.body).not.toContain('"success"');
    expect(result.location).toBe("/sign-in?error=provider_unknown");
    expect(result.message).toContain("not a sign-in provider this server offers");
  });

  it("the provider reported error=access_denied", async () => {
    const result = await callback({ query: "error=access_denied&state=x" });

    expectBrowserRedirect(result);
    expect(result.message).toContain("cancelled");
  });

  it("the state cookie is missing", async () => {
    const result = await callback({ state: null, query: "code=the-code&state=whatever" });

    expectBrowserRedirect(result);
    expect(result.message).toContain("could not be verified");
    expect(identityFromCode, "a code must never be exchanged without state").not.toHaveBeenCalled();
  });

  it("the state does not match the cookie", async () => {
    const result = await callback({ query: `code=the-code&state=${newOAuthState()}` });

    expectBrowserRedirect(result);
    expect(result.message).toContain("could not be verified");
    expect(identityFromCode).not.toHaveBeenCalled();
  });

  it("the callback arrived with no code", async () => {
    const result = await callback({ query: "state=only-a-state" });

    expectBrowserRedirect(result);
    expect(identityFromCode).not.toHaveBeenCalled();
  });

  it("the code exchange failed", async () => {
    identityFromCode.mockRejectedValue(new OAuthError("google rejected the authorization code"));

    const result = await callback();

    expectBrowserRedirect(result);
    expect(result.message).toContain("would not confirm who you are");
    // The provider's wording is for the log, not for the student.
    expect(result.location).not.toContain("authorization code");
  });

  it("the account has been disabled", async () => {
    linkedUserFor.mockRejectedValue(new AccountDisabledError());

    const result = await callback();

    expectBrowserRedirect(result);
    expect(result.message).toContain("turned off");
    expect(issueSession).not.toHaveBeenCalled();
  });

  it("the email is already linked to a different provider account", async () => {
    linkedUserFor.mockRejectedValue(new ProviderLinkConflictError("github"));

    const result = await callback({ provider: "github" });

    expectBrowserRedirect(result);
    expect(result.message).toContain("already linked to a different GitHub account");
  });

  it("something we did not model threw — and the stack does not reach the student", async () => {
    linkedUserFor.mockRejectedValue(
      new Error("Invalid `prisma.user.create()` invocation in /app/lib/db.ts:12"),
    );

    const result = await callback();

    expectBrowserRedirect(result);
    expect(result.location).not.toContain("prisma");
    expect(result.message).not.toContain("prisma");
    expect(result.message).toBe(signInErrorMessage("unknown", "google"));
  });

  it("clears the state cookie on the way out of a FAILURE too", async () => {
    linkedUserFor.mockRejectedValue(new AccountDisabledError());
    const result = await callback();
    expect(result.setCookie.join("\n")).toMatch(/ptcn_oauth_state=;/);
  });

  it("the provider is not configured on this server", async () => {
    oauthConfig.mockReturnValue(null);

    const result = await callback();

    expectBrowserRedirect(result);
    expect(result.message).toContain("not set up on this server");
    expect(result.message).toContain("not your account");
  });
});
