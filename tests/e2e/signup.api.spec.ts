import { expect, test, type APIRequestContext } from "@playwright/test";

import { linkedUserFor } from "@/lib/contest/accounts";
import { STUDENT_ACCOUNTS_CLOSED_MESSAGE } from "@/lib/contest/accounts-closed";
import { viewerFromSession } from "@/lib/contest/viewer";
import { hashPassword } from "@/lib/contest/password";
import { ensureEnrolled } from "@/lib/contest/enrolment";
import { AdminRosterSchema, TeamStandingsResponseSchema } from "@/lib/schemas/api";

import { ContestApi, readEnvelope, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";

/**
 * G7 — student accounts are closed, and an account never enrols itself into a real contest.
 *
 * The organizers decided on join codes only. `POST /api/auth/signup` answers 410, and the only
 * ways into a real contest are a join code and the organizer's roster. An account that signs in
 * with a provider still resolves (`linkedUserFor`, below), and lands in a real contest only when
 * an organizer has already put it there.
 *
 * ## Why these call `linkedUserFor` directly instead of driving a browser
 *
 * The step in the middle belongs to Google. These specs hand `linkedUserFor` the identity a
 * provider would have returned and assert against the REAL database, the REAL roster route over
 * HTTP and the REAL scoring engine.
 */

let seeded: SeededContest;
let admin: ContestApi;
let adminContext: APIRequestContext;

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");

/** A provider identity, shaped as `identityFromCode` would return it. */
function googleIdentity(suffix: string, email: string | null, verified = true) {
  return {
    provider: "google" as const,
    subject: `google-sub-${suffix}`,
    email,
    emailVerified: verified,
    displayName: `Google Student ${suffix}`,
  };
}

function githubIdentity(suffix: string, email: string | null, verified = false) {
  return {
    provider: "github" as const,
    subject: `github-sub-${suffix}`,
    email,
    emailVerified: verified,
    displayName: `GitHub Student ${suffix}`,
  };
}

/** Everyone the roster route reports as being on no team. */
async function unassigned(): Promise<{ participantId: string; displayName: string }[]> {
  const envelope = await readOk(await admin.rosterRaw());
  const roster = AdminRosterSchema.parse(envelope.data);
  return [...roster.unassigned];
}

/** Is this exact participant listed as unassigned? By ID, never by name. */
async function isUnassigned(participantId: string): Promise<boolean> {
  return (await unassigned()).some((p) => p.participantId === participantId);
}

/** How many participants this account has in the seeded (real) contest. */
async function realContestRows(userId: string): Promise<number> {
  return testDb().participant.count({ where: { contestId: seeded.contestId, userId } });
}

/** An account may land in a practice arena or nowhere. Never in a real contest, whichever one. */
async function expectNoRealContest(contestId: string | undefined): Promise<void> {
  if (contestId === undefined) return;
  const contest = await testDb().contest.findUniqueOrThrow({
    where: { id: contestId },
    select: { isPractice: true, name: true },
  });
  expect(contest.isPractice, `an account enrolled itself into the real contest "${contest.name}"`).toBe(true);
}

/** The organizer's roster action: put an existing account into the seeded contest. */
async function organizerAdds(userId: string): Promise<void> {
  const response = await admin.addParticipantRaw(userId);
  expect(response.status(), "the organizer's roster action should be accepted").toBe(200);
}

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();
  adminContext = await playwright.request.newContext();
  admin = new ContestApi(adminContext, seeded.contestId);
  await admin.adminLogin(ADMIN_PASSCODE);
});

test.afterAll(async () => {
  await testDb().participant.deleteMany({ where: { displayName: { contains: "Student signup-" } } });
  await testDb().user.deleteMany({ where: { displayName: { contains: "Student signup-" } } });
  await testDb().user.deleteMany({ where: { displayName: { startsWith: "Victim Student " } } });
  await adminContext.dispose();
  await closeTestDb();
});

test.describe("the sign-up door is closed", () => {
  test("POST /api/auth/signup answers 410, points to /join, and creates nothing", async ({
    playwright,
  }) => {
    const email = `signup-closed-${String(Date.now())}@parktudor.org`;
    const context = await playwright.request.newContext();
    const response = await context.post("/api/auth/signup", {
      data: { fullName: "Closed Door", email, password: "a-long-practice-password" },
    });

    const envelope = await readEnvelope(response);
    expect(envelope.status).toBe(410);
    expect(envelope.code).toBe("GONE");
    expect(envelope.message).toBe(STUDENT_ACCOUNTS_CLOSED_MESSAGE);
    expect(envelope.message).toContain("/join");
    expect(response.headers()["set-cookie"] ?? "").not.toContain("ptcn_session");

    expect(await testDb().user.count({ where: { email } })).toBe(0);
    await context.dispose();
  });
});

test.describe("a brand-new account does NOT enrol itself in the real contest", () => {
  test("Google: the account resolves, and the real contest's roster does not gain it", async () => {
    const suffix = `signup-g-${String(Date.now())}`;
    const email = `${suffix}@parktudor.org`;

    const user = await linkedUserFor(googleIdentity(suffix, email));

    // The account exists immediately, and it is a COMPETITOR. Never an organizer.
    expect(user.role).toBe("COMPETITOR");
    const row = await testDb().user.findUnique({
      where: { id: user.userId },
      select: { role: true, passwordHash: true, email: true, googleSub: true },
    });
    expect(row?.role).toBe("COMPETITOR");
    expect(row?.passwordHash, "signed up with a provider, so there is no password").toBeNull();
    expect(row?.email).toBe(email);
    expect(row?.googleSub).toBe(`google-sub-${suffix}`);

    const enrolment = await ensureEnrolled(user.userId, user.displayName);
    await expectNoRealContest(enrolment?.contestId);
    expect(await realContestRows(user.userId)).toBe(0);
  });

  test("no real contest is enrollable by an account, a SCHEDULED one included", async () => {
    // The audit's case: once tonight's contest is SCHEDULED, any account enrolled into it.
    await testDb().contest.update({ where: { id: seeded.contestId }, data: { state: "SCHEDULED" } });
    try {
      const suffix = `signup-sched-${String(Date.now())}`;
      const user = await linkedUserFor(githubIdentity(suffix, null));
      const enrolment = await ensureEnrolled(user.userId, user.displayName);
      await expectNoRealContest(enrolment?.contestId);
      expect(await realContestRows(user.userId)).toBe(0);
    } finally {
      await testDb().contest.update({ where: { id: seeded.contestId }, data: { state: "RUNNING" } });
    }
  });

  test("GitHub with NO verified email still resolves to an account", async () => {
    const suffix = `signup-gh-${String(Date.now())}`;

    // No email at all. GitHub gives this constantly and it must not block anything.
    const user = await linkedUserFor(githubIdentity(suffix, null));
    expect(user.role).toBe("COMPETITOR");

    const row = await testDb().user.findUnique({
      where: { id: user.userId },
      select: { email: true, githubSub: true },
    });
    expect(row?.email, "no verified email means none is stored, not that signup fails").toBeNull();
    expect(row?.githubSub).toBe(`github-sub-${suffix}`);
  });

  test("simultaneous providers with one verified email link one account", async () => {
    const suffix = `signup-cross-provider-${String(Date.now())}`;
    const email = `${suffix}@parktudor.org`;
    const [google, github] = await Promise.all([
      linkedUserFor(googleIdentity(suffix, email)),
      linkedUserFor(githubIdentity(suffix, email, true)),
    ]);

    expect(github.userId).toBe(google.userId);
    const row = await testDb().user.findUnique({
      where: { id: google.userId },
      select: { googleSub: true, githubSub: true },
    });
    expect(row).toEqual({
      googleSub: `google-sub-${suffix}`,
      githubSub: `github-sub-${suffix}`,
    });
  });

  test("an UNVERIFIED email never takes over an existing account", async () => {
    // Someone types an organizer's address into their GitHub profile without verifying it; they
    // must get their own new account, not the organizer's.
    const suffix = `signup-spoof-${String(Date.now())}`;

    const victim = await testDb().user.create({
      data: {
        email: `victim-${suffix}@parktudor.org`,
        displayName: `Victim Student ${suffix}`,
        role: "ADMIN",
        passwordHash: await hashPassword("victim-password-not-used"),
      },
      select: { id: true, email: true },
    });

    const attacker = await linkedUserFor(
      githubIdentity(suffix, victim.email, /* verified */ false),
    );

    expect(attacker.userId, "an unverified claim must not resolve to the victim").not.toBe(
      victim.id,
    );
    expect(attacker.role).toBe("COMPETITOR");
    const row = await testDb().user.findUnique({
      where: { id: attacker.userId },
      select: { email: true },
    });
    expect(row?.email, "an unverified address is not stored either").toBeNull();
  });
});

test.describe("an account the ORGANIZER put in the contest", () => {
  test("signing in finds the roster row, twice, without a second participant", async () => {
    const suffix = `signup-twice-${String(Date.now())}`;
    const identity = googleIdentity(suffix, `${suffix}@parktudor.org`);

    const first = await linkedUserFor(identity);
    await organizerAdds(first.userId);

    const one = await ensureEnrolled(first.userId, first.displayName);
    const second = await linkedUserFor(identity);
    const two = await ensureEnrolled(second.userId, second.displayName);

    expect(second.userId, "the same provider subject is the same account").toBe(first.userId);
    expect(one?.contestId).toBe(seeded.contestId);
    expect(one?.created).toBe(false);
    expect(two?.participantId).toBe(one?.participantId);
    expect(await realContestRows(first.userId), "a second competitor was minted").toBe(1);
  });

  test("simultaneous callbacks resolve to the one roster participant", async () => {
    const suffix = `signup-race-${String(Date.now())}`;
    const providerIdentity = googleIdentity(suffix, `${suffix}@parktudor.org`);

    const users = await Promise.all(
      Array.from({ length: 6 }, async () => linkedUserFor(providerIdentity)),
    );
    expect(new Set(users.map((user) => user.userId)).size).toBe(1);
    const userId = users[0]?.userId ?? "";
    await organizerAdds(userId);

    const enrolments = await Promise.all(
      users.map(async (user) => ensureEnrolled(user.userId, user.displayName)),
    );
    expect(new Set(enrolments.map((entry) => entry?.participantId)).size).toBe(1);
    expect(enrolments.filter((entry) => entry?.created === true)).toHaveLength(0);
    expect(await realContestRows(userId)).toBe(1);
  });

  test("assign to a team, and the team's score recomputes over the divisor", async () => {
    const suffix = `signup-assign-${String(Date.now())}`;
    const user = await linkedUserFor(googleIdentity(suffix, `${suffix}@parktudor.org`));
    await organizerAdds(user.userId);
    const enrolment = await ensureEnrolled(user.userId, user.displayName);
    expect(enrolment?.contestId).toBe(seeded.contestId);
    expect(await isUnassigned(enrolment?.participantId ?? "")).toBe(true);

    const teamId = seeded.teamIds.get("cubs");
    expect(teamId).toBeDefined();

    const before = TeamStandingsResponseSchema.parse((await readOk(await admin.teamStandingsRaw())).data);
    const cubsBefore = before.teams.find((t) => t.teamId === teamId);
    expect(cubsBefore, "the fixture team should already be on the board").toBeDefined();

    const moved = await admin.moveParticipantRaw({
      participantId: enrolment?.participantId ?? "",
      teamId: teamId ?? "",
      reason: "Added from the roster and needed a team",
    });
    expect(moved.status(), "the organizer's assignment should be accepted").toBeLessThan(300);

    const after = TeamStandingsResponseSchema.parse((await readOk(await admin.teamStandingsRaw())).data);
    const cubsAfter = after.teams.find((t) => t.teamId === teamId);

    // The new player scored nothing, so the POOL is unchanged and the DIVISOR grew by one.
    expect(cubsAfter?.teamSize).toBe((cubsBefore?.teamSize ?? 0) + 1);
    expect(cubsAfter?.playerPoolPoints).toBe(cubsBefore?.playerPoolPoints);
    expect(
      cubsAfter?.scoreHundredths,
      "adding a player who has scored nothing must LOWER the mean, not leave it alone",
    ).toBeLessThan(cubsBefore?.scoreHundredths ?? 0);
    expect(await isUnassigned(enrolment?.participantId ?? "")).toBe(false);
    expect(
      (cubsAfter?.players ?? []).some((row) => row.participantId === enrolment?.participantId),
      "the assigned student must appear in their team's player breakdown",
    ).toBe(true);
  });

  test("the session such a sign-in receives resolves to a COMPETITOR viewer", async () => {
    const suffix = `signup-session-${String(Date.now())}`;
    const user = await linkedUserFor(googleIdentity(suffix, `${suffix}@parktudor.org`));
    await organizerAdds(user.userId);
    const enrolment = await ensureEnrolled(user.userId, user.displayName);
    expect(enrolment, "a competitor must be enrolled before the session is minted").not.toBeNull();

    // Exactly what app/api/auth/[provider]/callback/route.ts writes.
    const viewer = viewerFromSession({
      id: "probe-session",
      role: "COMPETITOR",
      method: "GOOGLE",
      userId: user.userId,
      displayName: user.displayName,
      participantId: enrolment?.participantId ?? null,
      contestId: enrolment?.contestId ?? null,
    });
    expect(viewer.kind).toBe("competitor");
  });

  test("a session WITHOUT the participant is anonymous — the bug, pinned", async () => {
    const viewer = viewerFromSession({
      id: "probe-session",
      role: "COMPETITOR",
      method: "GOOGLE",
      userId: "probe-user",
      displayName: "No Participant",
      participantId: null,
      contestId: null,
    });
    expect(viewer.kind).toBe("anonymous");
  });
});
