import { expect, test } from "@playwright/test";

import { linkedUserFor } from "@/lib/contest/accounts";
import { ensureEnrolled } from "@/lib/contest/enrolment";
import type { OAuthIdentity } from "@/lib/contest/oauth";
import { hashPassword } from "@/lib/contest/password";
import { signInErrorMessage } from "@/lib/contest/sign-in-errors";

import { ContestApi, readEnvelope, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";

/**
 * G7 — sign-in, over HTTP, for every path a person can actually use.
 *
 * **Both paths, not one.** The join code is what a student uses on the night; email and password is
 * what an organizer uses. Testing only one would leave the other free to rot, and each has a
 * different failure mode: the join code has no account behind it at all, and the credential path has
 * an account that can be disabled and a session that can be revoked.
 *
 * OAuth is exercised as far as it can be without a network: the redirect is built and the state
 * cookie is set. The token exchange itself is unit-tested against stubbed provider responses in
 * `lib/contest/oauth.test.ts`, because reaching accounts.google.com from a test suite would make
 * the gate depend on Google's uptime.
 */

let seeded: SeededContest;
let anon: ContestApi;

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");

/** A real organizer account, created directly so the credential path has something to sign in to. */
const ORGANIZER = {
  email: `e2e-organizer-${Date.now()}@parktudor.org`,
  password: "a-long-enough-e2e-passphrase",
  displayName: "E2E Organizer",
};

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();

  await testDb().user.create({
    data: {
      email: ORGANIZER.email,
      displayName: ORGANIZER.displayName,
      role: "ADMIN",
      // Hashed here rather than seeded as a literal: a fixture holding a hash would silently stop
      // matching the moment the cost parameters change.
      passwordHash: await hashPassword(ORGANIZER.password),
    },
  });

  anon = new ContestApi(await playwright.request.newContext(), seeded.contestId);
});

test.afterAll(async () => {
  await testDb().user.deleteMany({ where: { email: ORGANIZER.email } });
  await closeTestDb();
});

test.describe("the join-code path", () => {
  test("a student joins and holds a session", async ({ playwright }) => {
    const api = new ContestApi(await playwright.request.newContext(), seeded.contestId);

    const joined = await api.signIn({
      displayName: `E2E JoinAuth ${Date.now()}`,
      divisionId: null,
    });
    expect(joined.participantId.length).toBeGreaterThan(0);

    const session = await readOk(await api.sessionRaw());
    expect(session.status).toBe(200);
    expect((session.data as { signedIn: boolean }).signedIn).toBe(true);
    expect((session.data as { role: string }).role).toBe("COMPETITOR");
  });

  /*
    REMOVED: "a wrong join code is refused without saying which codes exist".

    It tested `POST /api/contests/{id}/join`, which no longer exists — students sign in with a
    provider and an organizer puts them on a team. The property it protected (a refusal must not
    reveal which codes are valid) has no code path left to protect, and the equivalent property on
    the surviving path — that a failure never says whether an account exists — is asserted by the
    password specs above.
  */

  test("signing out revokes the session rather than only clearing the cookie", async ({
    playwright,
  }) => {
    const context = await playwright.request.newContext();
    const api = new ContestApi(context, seeded.contestId);

    await api.signIn({
      displayName: `E2E SignOut ${Date.now()}`,
      divisionId: null,
    });

    expect((await readEnvelope(await api.sessionRaw())).status).toBe(200);

    await api.signOutRaw();

    const after = await readOk(await api.sessionRaw());
    expect((after.data as { signedIn: boolean }).signedIn).toBe(false);
  });
});

test.describe("the email and password path", () => {
  test("an organizer signs in with admin-issued credentials", async ({ playwright }) => {
    const api = new ContestApi(await playwright.request.newContext(), seeded.contestId);

    const envelope = await readOk(
      await api.passwordLoginRaw(ORGANIZER.email, ORGANIZER.password),
    );

    expect(envelope.status).toBe(200);
    expect((envelope.data as { role: string }).role).toBe("ADMIN");

    // And the session is real: an admin-only route now answers.
    const sessions = await readEnvelope(await api.liveSessionsRaw());
    expect(sessions.status).toBe(200);
  });

  test("a wrong password is refused", async ({ playwright }) => {
    const api = new ContestApi(await playwright.request.newContext(), seeded.contestId);

    const envelope = await readEnvelope(
      await api.passwordLoginRaw(ORGANIZER.email, "not-the-passphrase"),
    );
    expect(envelope.status).toBeGreaterThanOrEqual(400);
    expect(envelope.status).toBeLessThan(500);
  });

  test("an unknown email is refused indistinguishably from a wrong password", async ({
    playwright,
  }) => {
    // Distinguishing them turns the login form into an account enumerator, and "that email has no
    // account here" is exactly what someone probing wants to learn.
    const api = new ContestApi(await playwright.request.newContext(), seeded.contestId);

    const unknown = await readEnvelope(
      await api.passwordLoginRaw("nobody-at-all@parktudor.org", ORGANIZER.password),
    );
    const wrongPassword = await readEnvelope(
      await api.passwordLoginRaw(ORGANIZER.email, "not-the-passphrase"),
    );

    expect(unknown.status).toBe(wrongPassword.status);
    expect(unknown.code).toBe(wrongPassword.code);
    expect(unknown.message).toBe(wrongPassword.message);
  });

  test("a disabled account cannot sign in", async ({ playwright }) => {
    const api = new ContestApi(await playwright.request.newContext(), seeded.contestId);

    await testDb().user.updateMany({
      where: { email: ORGANIZER.email },
      data: { disabledAt: new Date() },
    });

    try {
      const envelope = await readEnvelope(
        await api.passwordLoginRaw(ORGANIZER.email, ORGANIZER.password),
      );
      expect(envelope.status).toBeGreaterThanOrEqual(400);
    } finally {
      await testDb().user.updateMany({
        where: { email: ORGANIZER.email },
        data: { disabledAt: null },
      });
    }
  });
});

test.describe("OAuth start", () => {
  test("redirects to the provider with a state parameter, or says it is not configured", async ({
    playwright,
  }) => {
    const api = new ContestApi(await playwright.request.newContext(), seeded.contestId);
    const response = await api.oauthStartRaw("google");

    // Configured or not, the answer is a 302. What differs is WHERE to.
    expect([302, 307]).toContain(response.status());
    const location = response.headers().location ?? "";

    if (location.includes("accounts.google.com")) {
      // Without state, an attacker can complete a flow in a victim's browser and bind their own
      // provider account to the victim's session.
      expect(location).toContain("state=");
      // The client secret must never appear in a URL the browser is handed.
      expect(location).not.toContain("client_secret");

      const cookies = response.headers()["set-cookie"] ?? "";
      expect(cookies).toContain("ptcn_oauth_state");
      return;
    }

    // Not configured on this host is a legitimate outcome, and is still a redirect — this URL is
    // the href of a button and a browser is doing the navigating. See the spec below.
    //
    // The reason travels as a CODE now, not as the sentence. The sentence lives in
    // `lib/contest/sign-in-errors.ts`; resolving it here rather than asserting on the URL is what
    // keeps this test honest about what a student actually reads.
    expect(location).toContain("/sign-in?error=");
    const params = new URLSearchParams(location.split("?")[1]);
    expect(params.get("error")).toBe("provider_unconfigured");
    expect(signInErrorMessage(params.get("error"), params.get("provider"))).toContain(
      "not set up on this server",
    );
  });

  test("a provider failure lands on a PAGE, never on a JSON envelope", async ({ playwright }) => {
    /*
      The bug this pins: `/api/auth/{provider}` lives under `/api`, so it was written like an API
      route and ran through `handle()`. It is not one — it is what a student's browser navigates
      to when they press "Continue with Google". Every non-redirect exit painted

          {"ok":false,"error":{"code":"FORBIDDEN","message":"…"}}

      across the whole window: nothing to click, nothing that names the other provider, and a
      student with no way to tell "the server has no Google set up" from "you are not allowed".

      Asserted for BOTH providers and without following redirects, because the failure is a status
      code and a `location`, and a client that follows them cannot see either.
    */
    for (const provider of ["google", "github"] as const) {
      const api = new ContestApi(await playwright.request.newContext(), seeded.contestId);
      const response = await api.oauthStartRaw(provider);

      expect(
        [302, 307],
        `${provider} answered ${response.status()} — a browser navigation must redirect`,
      ).toContain(response.status());

      const body = await response.text();
      expect(body, `${provider} put an API envelope in front of a student`).not.toContain('"ok"');
      expect(body).not.toContain('"error"');

      // If it is our redirect rather than the provider's, it must carry a reason the page renders.
      const location = response.headers().location ?? "";
      if (location.startsWith("/sign-in")) {
        expect(location).toContain("error=");
      }
    }
  });

  test("rejects an unknown provider without leaving the site", async ({ playwright }) => {
    const context = await playwright.request.newContext();
    const response = await context.get("/api/auth/facebook", { maxRedirects: 0 });

    // Refused, not 4xx. The whole route redirects now, so the assertion that matters is where to:
    // an unknown provider must land back on our own sign-in page and must never produce an
    // outbound redirect, which is how a path parameter turns into an open redirect.
    expect([302, 307, 404]).toContain(response.status());
    const location = response.headers().location ?? "";
    if (location !== "") {
      expect(location, "an unknown provider sent the browser off-site").toMatch(/^\/sign-in/);
    }
    expect(await response.text()).not.toContain("ptcn_oauth_state");
  });
});

/**
 * The CALLBACK, over real HTTP, for every failure that does not need a provider.
 *
 * The start route was fixed to redirect rather than to answer with an envelope, and the callback
 * was left running through `handle()`. Measured on this server before the fix:
 *
 *     GET /api/auth/facebook/callback?code=x&state=y
 *     404 {"success":false,"data":null,"error":{"code":"NOT_FOUND","message":"Not found"}}
 *
 * A student's browser NAVIGATES here — it arrives by following the provider's redirect — so that
 * body was the whole window, with nothing to click and nothing naming an alternative. The cases
 * that need a configured provider (state mismatch, a refused exchange, a disabled account) cannot
 * be reached over HTTP without client credentials and are covered in
 * `tests/unit/auth-callback-route.test.ts`.
 */
test.describe("OAuth callback", () => {
  const CASES: { readonly what: string; readonly path: string; readonly code: string }[] = [
    {
      what: "the student cancelled at the consent screen",
      path: "/api/auth/google/callback?error=access_denied",
      code: "cancelled",
    },
    {
      what: "an unknown provider — the case that measurably returned 404 JSON",
      path: "/api/auth/facebook/callback?code=x&state=y",
      code: "provider_unknown",
    },
    {
      what: "a callback with nothing on it at all",
      path: "/api/auth/github/callback",
      // Which of these two depends on whether this host has GitHub configured, and both are
      // legitimate. What must NOT vary is the shape of the answer.
      code: "",
    },
  ];

  for (const { what, path, code } of CASES) {
    test(`lands on a PAGE, never a JSON envelope: ${what}`, async ({ playwright }) => {
      const context = await playwright.request.newContext();
      const response = await context.get(path, { maxRedirects: 0 });

      expect([302, 307], `${path} answered ${response.status()}`).toContain(response.status());

      const body = await response.text();
      expect(body, "an API envelope was painted in front of a student").not.toContain('"success"');
      expect(body).not.toContain('"error"');

      const location = response.headers().location ?? "";
      // Relative, always: an absolute Location invents a scheme and a host, and it invented
      // `https://localhost:3000`, which the browser cannot open.
      expect(location.startsWith("/sign-in?")).toBe(true);
      expect(location).not.toContain("://");

      const params = new URLSearchParams(location.split("?")[1]);
      if (code !== "") expect(params.get("error")).toBe(code);
      // And whatever code it is, the page can turn it into a sentence.
      expect(signInErrorMessage(params.get("error"), params.get("provider"))).not.toBeNull();
    });
  }

  test("the reason renders on the sign-in page and survives a reload", async ({ playwright }) => {
    const context = await playwright.request.newContext();
    const start = await context.get("/api/auth/google/callback?error=access_denied", {
      maxRedirects: 0,
    });
    const location = start.headers().location ?? "";

    // Twice, because the banner lives in the URL rather than in a flash cookie — a student who
    // reloads must not be left staring at a form that has forgotten why it refused them.
    for (let i = 0; i < 2; i += 1) {
      const page = await context.get(location);
      const html = await page.text();
      expect(page.status()).toBe(200);
      expect(html).toContain("You cancelled the Google sign-in");
      expect(html).toContain('role="alert"');
    }
  });
});

test.describe("mid-contest session revocation", () => {
  test("an organizer can cut off a student while the round is running", async ({ playwright }) => {
    // The reason sessions moved into Postgres. With a signed cookie this was impossible: the token
    // stayed valid until it expired no matter what an organizer wanted.
    const studentContext = await playwright.request.newContext();
    const student = new ContestApi(studentContext, seeded.contestId);

    const joined = await student.signIn({
      displayName: `E2E Revoked ${Date.now()}`,
      divisionId: null,
    });

    expect(
      ((await readOk(await student.sessionRaw())).data as { signedIn: boolean }).signedIn,
    ).toBe(true);

    const adminContext = await playwright.request.newContext();
    const admin = new ContestApi(adminContext, seeded.contestId);
    await admin.adminLogin(ADMIN_PASSCODE);

    const revoked = await readOk(
      await admin.revokeSessionRaw({
        participantId: joined.participantId,
        reason: "e2e: proving revocation takes effect",
      }),
    );
    expect(revoked.status).toBe(200);
    expect((revoked.data as { revoked: number }).revoked).toBeGreaterThan(0);

    // The very next request is anonymous. Not "eventually" — the next one.
    const after = await readOk(await student.sessionRaw());
    expect((after.data as { signedIn: boolean }).signedIn).toBe(false);

    // And a route that needs a competitor now refuses.
    const problems = await readEnvelope(await student.getProblemRaw("e2e-panther-sum"));
    expect(problems.status).toBeGreaterThanOrEqual(400);
  });

  test("requires a reason, because the only reason to cut somebody off is one you can state", async ({
    playwright,
  }) => {
    const adminContext = await playwright.request.newContext();
    const admin = new ContestApi(adminContext, seeded.contestId);
    await admin.adminLogin(ADMIN_PASSCODE);

    const response = await adminContext.post("/api/admin/sessions", {
      data: { participantId: "whoever", reason: "" },
    });
    const envelope = await readEnvelope(response);
    expect(envelope.status).toBeGreaterThanOrEqual(400);
  });

  test("refuses a competitor trying to revoke anybody", async () => {
    const envelope = await readEnvelope(
      await anon.revokeSessionRaw({ participantId: "whoever", reason: "should not work" }),
    );
    expect(envelope.status).toBeGreaterThanOrEqual(400);
  });

  test("lists who is signed in, which was impossible before", async ({ playwright }) => {
    const adminContext = await playwright.request.newContext();
    const admin = new ContestApi(adminContext, seeded.contestId);
    await admin.adminLogin(ADMIN_PASSCODE);

    const envelope = await readOk(await admin.liveSessionsRaw());
    expect(envelope.status).toBe(200);

    const body = envelope.data as {
      sessions: { role: string; method: string; displayName: string }[];
    };
    expect(Array.isArray(body.sessions)).toBe(true);
    // The admin's own session is in there, and it records HOW they signed in.
    expect(body.sessions.some((s) => s.method === "ADMIN_PASSCODE")).toBe(true);
  });
});

/**
 * The one invariant that survived opening self-signup, asserted against the real database.
 *
 * Students now create their own accounts by signing in with Google or GitHub. `selfSignUpFromOAuth`
 * writes `role: "COMPETITOR"` as a literal, so no argument can make it produce an organizer — but
 * "the code currently does the right thing" is a weaker guarantee than "the wrong thing cannot be
 * stored", and this is the one place in the app where the difference is worth a CHECK constraint.
 *
 * These talk to Postgres directly rather than through a route, on purpose. The point is that the
 * database refuses regardless of which code path asks — including one written later by someone
 * who never read `accounts.ts`.
 */
test.describe("an OAuth-only ADMIN is unrepresentable", () => {
  const probe = `probe-${String(Date.now())}@example.org`;

  test.afterAll(async () => {
    await testDb().user.deleteMany({ where: { email: { startsWith: "probe-" } } });
  });

  test("the database REFUSES an admin with no password", async () => {
    await expect(
      testDb().user.create({
        data: {
          email: probe,
          displayName: "Probe Admin",
          role: "ADMIN",
          // What an OAuth signup would produce. For an admin it must not be storable at all.
          passwordHash: null,
          googleSub: `probe-sub-${String(Date.now())}`,
        },
      }),
    ).rejects.toThrow(/User_admin_requires_password|check constraint/i);
  });

  test("but a competitor with no password is fine, which is the whole point", async () => {
    const created = await testDb().user.create({
      data: {
        email: `probe-competitor-${String(Date.now())}@example.org`,
        displayName: "Probe Competitor",
        role: "COMPETITOR",
        passwordHash: null,
        githubSub: `probe-gh-${String(Date.now())}`,
      },
      select: { id: true, role: true, passwordHash: true },
    });
    expect(created.role).toBe("COMPETITOR");
    expect(created.passwordHash).toBeNull();
  });

  test("and an existing admin cannot be stripped of its password by an update", async () => {
    // The insert is guarded above; a CHECK also has to hold on UPDATE, which is the path a
    // "let them link Google instead" feature would take.
    await expect(
      testDb().user.updateMany({
        where: { email: ORGANIZER.email },
        data: { passwordHash: null },
      }),
    ).rejects.toThrow(/User_admin_requires_password|check constraint/i);
  });
});

/**
 * Account creation, against the real database.
 *
 * These call `linkedUserFor` and `ensureEnrolled` directly rather than through the callback,
 * because the callback cannot be driven over HTTP without Google or GitHub client credentials —
 * `oauthConfig()` returns null and the route redirects long before it reaches any of this. The
 * ROUTE's own decisions are covered in `tests/unit/auth-callback-route.test.ts`; what these add is
 * the half a mock cannot: that the rows Postgres ends up holding are the right ones.
 */
test.describe("signing up with a provider", () => {
  const stamp = String(Date.now());

  function identity(overrides: Partial<OAuthIdentity> = {}): OAuthIdentity {
    return {
      provider: "google",
      subject: `signup-sub-${stamp}`,
      email: `signup-${stamp}@parktudor.org`,
      emailVerified: true,
      displayName: "Signup Student",
      ...overrides,
    };
  }

  test.afterAll(async () => {
    await testDb().participant.deleteMany({ where: { user: { email: { contains: stamp } } } });
    await testDb().user.deleteMany({ where: { email: { contains: stamp } } });
    await testDb().participant.deleteMany({ where: { displayName: { contains: stamp } } });
    await testDb().user.deleteMany({ where: { googleSub: { contains: stamp } } });
    await testDb().user.deleteMany({ where: { githubSub: { contains: stamp } } });
  });

  test("a brand-new identity creates a COMPETITOR and a Participant, and never an ADMIN", async () => {
    const user = await linkedUserFor(identity());

    expect(user.role).toBe("COMPETITOR");

    const row = await testDb().user.findUnique({
      where: { id: user.userId },
      select: { role: true, passwordHash: true, googleSub: true, email: true },
    });
    // The role is a literal in `selfSignUpFromOAuth` and the database refuses an ADMIN with no
    // password independently. Signing up cannot produce an organizer by any route.
    expect(row?.role).toBe("COMPETITOR");
    expect(row?.passwordHash).toBeNull();
    expect(row?.googleSub).toBe(`signup-sub-${stamp}`);

    const enrolment = await ensureEnrolled(user.userId, user.displayName);
    expect(enrolment, "no enrollable contest — the fixture should have seeded one").not.toBeNull();

    const participant = await testDb().participant.findFirst({
      where: { userId: user.userId },
      select: { id: true, contestId: true, teamId: true },
    });
    expect(participant?.id).toBe(enrolment?.participantId);
    expect(participant?.contestId).toBe(enrolment?.contestId);
    // No team. The organizer assigns it from the roster, and that is the only place it happens.
    expect(participant?.teamId).toBeNull();
  });

  test("a second sign-in re-uses the account rather than creating a duplicate", async () => {
    const first = await linkedUserFor(identity());
    const second = await linkedUserFor(identity({ displayName: "Renamed In Google" }));

    expect(second.userId).toBe(first.userId);

    const count = await testDb().user.count({ where: { googleSub: `signup-sub-${stamp}` } });
    expect(count, "a second sign-in minted a second account").toBe(1);

    // And enrolment is idempotent too, keyed on (contestId, userId) rather than on the display
    // name — a rename must not mint a second participant competing against the first.
    await ensureEnrolled(first.userId, first.displayName);
    await ensureEnrolled(second.userId, "Renamed In Google");
    expect(await testDb().participant.count({ where: { userId: first.userId } })).toBe(1);
  });

  test("an UNVERIFIED provider email never links to an existing account", async () => {
    /*
      The takeover this stops: an unverified email is a claim by the person signing in, not by the
      provider. Anyone who can type an organizer's address into their GitHub profile would
      otherwise walk into that organizer's account.

      The correct behaviour is not a refusal — a GitHub account with no verified public email is
      the normal state of a student's GitHub account. It is: do not LOOK for an existing account,
      and create a fresh one keyed on the provider's stable subject id.
    */
    const victimEmail = `victim-${stamp}@parktudor.org`;
    const victim = await testDb().user.create({
      data: {
        email: victimEmail,
        displayName: `Victim ${stamp}`,
        role: "ADMIN",
        passwordHash: await hashPassword("a-long-enough-e2e-passphrase"),
      },
      select: { id: true },
    });

    const attacker = await linkedUserFor({
      provider: "github",
      subject: `attacker-sub-${stamp}`,
      email: victimEmail,
      emailVerified: false,
      displayName: `Attacker ${stamp}`,
    });

    expect(attacker.userId, "an unverified email took over an existing account").not.toBe(victim.id);
    expect(attacker.role).toBe("COMPETITOR");

    // The victim's row is untouched: no provider subject was written onto it.
    const after = await testDb().user.findUnique({
      where: { id: victim.id },
      select: { githubSub: true, role: true },
    });
    expect(after?.githubSub).toBeNull();
    expect(after?.role).toBe("ADMIN");

    // And the address is NOT stored on the new account either — writing an unverified email would
    // let the attacker squat the address a later verified sign-in matches against.
    const created = await testDb().user.findUnique({
      where: { id: attacker.userId },
      select: { email: true },
    });
    expect(created?.email).toBeNull();
  });

  test("a RUNNING contest wins over a DRAFT that starts later", async () => {
    /*
      Ordering by `startsAt` alone picks the contest that starts FURTHEST IN THE FUTURE. The moment
      an organizer drafts next month's Coding Night, every student signing in tonight is enrolled
      in next month's — and nothing errors. They land on a contest with no problems published and
      tonight's roster shows nobody: two quietly empty screens, the same signature as the "site
      looked dead" failure from a different cause.
    */
    const nextMonth = await testDb().contest.create({
      data: {
        name: `Next Month ${stamp}`,
        joinCode: `NX${stamp.slice(-4)}`,
        scoringPresetId: "coding-night-classic",
        startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000 + 7_200_000),
        state: "DRAFT",
      },
      select: { id: true },
    });

    try {
      const user = await linkedUserFor(
        identity({ subject: `ordering-sub-${stamp}`, email: `ordering-${stamp}@parktudor.org` }),
      );
      const enrolment = await ensureEnrolled(user.userId, `Ordering ${stamp}`);

      expect(enrolment).not.toBeNull();
      expect(
        enrolment?.contestId,
        "a student signing in tonight was enrolled in next month's contest",
      ).not.toBe(nextMonth.id);
    } finally {
      await testDb().participant.deleteMany({ where: { contestId: nextMonth.id } });
      await testDb().contest.delete({ where: { id: nextMonth.id } });
    }
  });

  test("a VERIFIED email does link to the account that already owns it", async () => {
    // The other half of the rule: verified is exactly the case where linking is safe, and without
    // it an organizer who signs in with Google gets a second, competitor-shaped account.
    const email = `linkable-${stamp}@parktudor.org`;
    const existing = await testDb().user.create({
      data: {
        email,
        displayName: `Linkable ${stamp}`,
        role: "ADMIN",
        passwordHash: await hashPassword("a-long-enough-e2e-passphrase"),
      },
      select: { id: true },
    });

    const linked = await linkedUserFor({
      provider: "google",
      subject: `linkable-sub-${stamp}`,
      email,
      emailVerified: true,
      displayName: "Linked By Email",
    });

    expect(linked.userId).toBe(existing.id);
    expect(linked.role).toBe("ADMIN");
  });
});

/**
 * The password path enrols a COMPETITOR, which it did not.
 *
 * Measured against this server before the fix: `POST /api/auth/password` answered
 * `200 {"role":"COMPETITOR"}` and set a session cookie, and `GET /api/auth/session` with that very
 * cookie answered `{"signedIn":false}`. `viewerFromSession` returns ANONYMOUS for a COMPETITOR
 * session whose participantId or contestId is null, so the sign-in succeeded and authorized as
 * nobody — the student is sent to /contest by a working sign-in and every screen there treats them
 * as a stranger.
 *
 * The OAuth callback had already learned this and this route was left behind, which is why the
 * assertion is on the SESSION and not on the sign-in response: the sign-in response was always 200.
 */
test.describe("a competitor with a password", () => {
  const STUDENT = {
    email: `e2e-student-pw-${Date.now()}@parktudor.org`,
    password: "a-long-enough-e2e-passphrase",
    displayName: `E2E Password Student ${Date.now()}`,
  };

  test.beforeAll(async () => {
    await testDb().user.create({
      data: {
        email: STUDENT.email,
        displayName: STUDENT.displayName,
        role: "COMPETITOR",
        passwordHash: await hashPassword(STUDENT.password),
      },
    });
  });

  test.afterAll(async () => {
    await testDb().participant.deleteMany({ where: { user: { email: STUDENT.email } } });
    await testDb().user.deleteMany({ where: { email: STUDENT.email } });
  });

  test("signs in AND can compete — the session carries participantId and contestId", async ({
    playwright,
  }) => {
    const api = new ContestApi(await playwright.request.newContext(), seeded.contestId);

    const login = await readOk(await api.passwordLoginRaw(STUDENT.email, STUDENT.password));
    expect(login.status).toBe(200);
    expect((login.data as { role: string }).role).toBe("COMPETITOR");

    const session = await readOk(await api.sessionRaw());
    const body = session.data as {
      signedIn: boolean;
      role: string;
      participantId: string | null;
      contestId: string | null;
    };

    expect(body.signedIn, "signed in and immediately anonymous — the bug this pins").toBe(true);
    expect(body.role).toBe("COMPETITOR");
    expect(body.participantId).not.toBeNull();
    expect(body.contestId).not.toBeNull();
  });

  test("appears on the organizer's roster, which is the point of enrolling", async () => {
    // A student the roster cannot see is a student nobody can put on a team.
    const participant = await testDb().participant.findFirst({
      where: { user: { email: STUDENT.email } },
      select: { teamId: true, contestId: true },
    });
    expect(participant).not.toBeNull();
    expect(participant?.teamId).toBeNull();
  });

  test("an ADMIN is still NOT enrolled, because an organizer is not a contestant", async ({
    playwright,
  }) => {
    // Enrolling one would put them in a team's divisor, and team size is the divisor.
    const api = new ContestApi(await playwright.request.newContext(), seeded.contestId);
    await readOk(await api.passwordLoginRaw(ORGANIZER.email, ORGANIZER.password));

    const session = await readOk(await api.sessionRaw());
    expect((session.data as { role: string }).role).toBe("ADMIN");
    expect((session.data as { participantId: string | null }).participantId).toBeNull();

    expect(await testDb().participant.count({ where: { user: { email: ORGANIZER.email } } })).toBe(0);
  });
});
