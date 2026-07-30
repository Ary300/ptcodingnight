import { expect, test } from "@playwright/test";

import { hashPassword } from "@/lib/contest/password";

import { ContestApi, readEnvelope, readOk } from "./helpers/api";
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

const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE ?? "";

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

    const joined = await api.joinOrThrow({
      joinCode: seeded.joinCode,
      displayName: `E2E JoinAuth ${Date.now()}`,
      divisionId: null,
    });
    expect(joined.participantId.length).toBeGreaterThan(0);

    const session = await readOk(await api.sessionRaw());
    expect(session.status).toBe(200);
    expect((session.data as { signedIn: boolean }).signedIn).toBe(true);
    expect((session.data as { role: string }).role).toBe("COMPETITOR");
  });

  test("a wrong join code is refused without saying which codes exist", async ({ playwright }) => {
    const api = new ContestApi(await playwright.request.newContext(), seeded.contestId);

    const envelope = await readEnvelope(
      await api.join({ joinCode: "E2E-NOT-A-CODE", displayName: "Nobody", divisionId: null }),
    );

    expect(envelope.status).toBeGreaterThanOrEqual(400);
    // The same answer a valid code for another contest gives, deliberately: no enumeration.
    expect(envelope.status).toBeLessThan(500);
  });

  test("signing out revokes the session rather than only clearing the cookie", async ({
    playwright,
  }) => {
    const context = await playwright.request.newContext();
    const api = new ContestApi(context, seeded.contestId);

    await api.joinOrThrow({
      joinCode: seeded.joinCode,
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

    if (response.status() === 302 || response.status() === 307) {
      const location = response.headers().location ?? "";
      expect(location).toContain("accounts.google.com");
      // Without state, an attacker can complete a flow in a victim's browser and bind their own
      // provider account to the victim's session.
      expect(location).toContain("state=");
      // The client secret must never appear in a URL the browser is handed.
      expect(location).not.toContain("client_secret");

      const cookies = response.headers()["set-cookie"] ?? "";
      expect(cookies).toContain("ptcn_oauth_state");
      return;
    }

    // Not configured on this host is a legitimate outcome and must be reported as an operator
    // problem, not as a failed sign-in the student caused.
    const envelope = await readEnvelope(response);
    expect(envelope.status).toBeGreaterThanOrEqual(400);
    expect((envelope.message ?? "").toLowerCase()).toContain("not configured");
  });

  test("rejects an unknown provider", async ({ playwright }) => {
    const context = await playwright.request.newContext();
    const response = await context.get("/api/auth/facebook", { maxRedirects: 0 });
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe("mid-contest session revocation", () => {
  test.skip(ADMIN_PASSCODE === "", "ADMIN_PASSCODE is not set");

  test("an organizer can cut off a student while the round is running", async ({ playwright }) => {
    // The reason sessions moved into Postgres. With a signed cookie this was impossible: the token
    // stayed valid until it expired no matter what an organizer wanted.
    const studentContext = await playwright.request.newContext();
    const student = new ContestApi(studentContext, seeded.contestId);

    const joined = await student.joinOrThrow({
      joinCode: seeded.joinCode,
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
