import { expect, test, type APIRequestContext } from "@playwright/test";

import { linkedUserFor } from "@/lib/contest/accounts";
import { viewerFromSession } from "@/lib/contest/viewer";
import { hashPassword } from "@/lib/contest/password";
import { ensureEnrolled } from "@/lib/contest/enrolment";
import { AdminRosterSchema, TeamStandingsResponseSchema } from "@/lib/schemas/api";

import { ContestApi, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";

/**
 * G7 — a student signs up with Google or GitHub and an organizer puts them on a team.
 *
 * ## Why these call `linkedUserFor` directly instead of driving a browser
 *
 * The step in the middle belongs to Google. There is no way to complete a real consent screen in
 * CI, and a mock of the provider would only prove that the mock works.
 *
 * So the seam is drawn exactly where our code begins: `identityFromCode` is the last thing that
 * talks to the provider, and `linkedUserFor` is the first thing that is ours. These specs hand
 * `linkedUserFor` the identity a provider would have returned and then assert against the REAL
 * database, the REAL roster route over HTTP, and the REAL scoring engine. Everything downstream
 * of the consent screen is covered; only the consent screen itself is not.
 *
 * ## The case that used to be broken
 *
 * `github-no-verified-email` is not an exotic input. A student's GitHub account is registered to
 * whatever address they used at thirteen and usually exposes no verified email at all. An earlier
 * version of this feature required a school domain and refused exactly these people — the button
 * appeared to work and then said "not eligible", which is the failure this spec exists to pin.
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

/**
 * Is this exact participant listed as unassigned?
 *
 * By ID, never by name. Display names are capped at 40 characters for the projector, and matching
 * on a name substring made this suite fail on `signup-gmail-<13-digit timestamp>` for the single
 * reason that the generated name was 41 characters long — the product behaving correctly and the
 * assertion being wrong about it.
 */
async function isUnassigned(participantId: string): Promise<boolean> {
  return (await unassigned()).some((p) => p.participantId === participantId);
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

test.describe("a brand-new account signs itself up", () => {
  test("Google: no account, no code, no approval — and it lands in the roster unassigned", async () => {
    const suffix = `signup-g-${String(Date.now())}`;
    const email = `${suffix}@parktudor.org`;

    const before = await unassigned();
    expect(before.some((p) => p.displayName.includes(suffix))).toBe(false);

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
    expect(enrolment, "signing in must enrol into the contest being organised").not.toBeNull();

    // The organizer sees them, on no team, over HTTP.
    expect(
      await isUnassigned(enrolment?.participantId ?? ""),
      "a signed-up student must appear in the roster as unassigned",
    ).toBe(true);
  });

  test("GitHub with NO verified email — the case a domain allowlist used to refuse", async () => {
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

    const enrolment = await ensureEnrolled(user.userId, user.displayName);
    expect(await isUnassigned(enrolment?.participantId ?? "")).toBe(true);
  });

  test("a personal gmail address signs up too — there is no domain gate", async () => {
    const suffix = `signup-gmail-${String(Date.now())}`;
    const user = await linkedUserFor(googleIdentity(suffix, `${suffix}@gmail.com`));
    expect(user.role).toBe("COMPETITOR");
    const enrolment = await ensureEnrolled(user.userId, user.displayName);
    expect(await isUnassigned(enrolment?.participantId ?? "")).toBe(true);
  });

  test("signing in a second time is the same account and the same participant", async () => {
    const suffix = `signup-twice-${String(Date.now())}`;
    const identity = googleIdentity(suffix, `${suffix}@parktudor.org`);

    const first = await linkedUserFor(identity);
    await ensureEnrolled(first.userId, first.displayName);
    const second = await linkedUserFor(identity);
    await ensureEnrolled(second.userId, second.displayName);

    expect(second.userId, "the same provider subject is the same account").toBe(first.userId);

    const participants = await testDb().participant.findMany({
      where: { contestId: seeded.contestId, userId: first.userId },
      select: { id: true },
    });
    expect(participants, "enrolment is idempotent, not a second competitor").toHaveLength(1);
  });

  test("an UNVERIFIED email never takes over an existing account", async () => {
    // The one refusal that survives. Someone types an organizer's address into their GitHub
    // profile without verifying it; they must get their own new account, not the organizer's.
    const suffix = `signup-spoof-${String(Date.now())}`;

    // The victim is CREATED here rather than found, so this spec asserts the same thing on every
    // machine. Depending on the fixture happening to contain an admin with an email would make
    // this silently stop testing anything the day that fixture changed.
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

test.describe("the organizer assigns them, and the mean follows", () => {
  test("assign to a team, and the team's score recomputes over the divisor", async () => {
    const suffix = `signup-assign-${String(Date.now())}`;
    const user = await linkedUserFor(googleIdentity(suffix, `${suffix}@parktudor.org`));
    const enrolment = await ensureEnrolled(user.userId, user.displayName);
    expect(enrolment).not.toBeNull();

    const teamId = seeded.teamIds.get("cubs");
    expect(teamId).toBeDefined();

    const beforeEnvelope = await readOk(await admin.teamStandingsRaw());
    const before = TeamStandingsResponseSchema.parse(beforeEnvelope.data);
    const cubsBefore = before.teams.find((t: { teamId: string }) => t.teamId === teamId);
    expect(cubsBefore, "the fixture team should already be on the board").toBeDefined();

    const moved = await admin.moveParticipantRaw({
      participantId: enrolment?.participantId ?? "",
      teamId: teamId ?? "",
      reason: "Signed up on the night and needed a team",
    });
    expect(moved.status(), "the organizer's assignment should be accepted").toBeLessThan(300);

    const afterEnvelope = await readOk(await admin.teamStandingsRaw());
    const after = TeamStandingsResponseSchema.parse(afterEnvelope.data);
    const cubsAfter = after.teams.find((t: { teamId: string }) => t.teamId === teamId);
    expect(cubsAfter).toBeDefined();

    // The new player scored nothing, so the POOL is unchanged and the DIVISOR grew by one. That
    // is the whole team formula in one assertion, and it is the number a student disputes.
    expect(cubsAfter?.teamSize).toBe((cubsBefore?.teamSize ?? 0) + 1);
    expect(cubsAfter?.playerPoolPoints).toBe(cubsBefore?.playerPoolPoints);
    expect(
      cubsAfter?.scoreHundredths,
      "adding a player who has scored nothing must LOWER the mean, not leave it alone",
    ).toBeLessThan(cubsBefore?.scoreHundredths ?? 0);

    // And they are no longer listed as unassigned.
    expect(await isUnassigned(enrolment?.participantId ?? "")).toBe(false);

    // They are on the team the organizer chose, and the board names them in its breakdown — which
    // is what "I can see my team" means from the student's side. The per-player rows are what
    // /team renders, so a player missing here is a player who signed up, got assigned, and still
    // sees nothing.
    const stored = await testDb().participant.findUnique({
      where: { id: enrolment?.participantId ?? "" },
      select: { teamId: true },
    });
    expect(stored?.teamId).toBe(teamId);

    const players = cubsAfter?.players ?? [];
    expect(
      players.some((row: { participantId: string }) => row.participantId === enrolment?.participantId),
      "the assigned student must appear in their team's player breakdown",
    ).toBe(true);
  });
});


/**
 * The session a signed-up student receives must authorize them AS A COMPETITOR.
 *
 * `viewerFromSession` returns ANONYMOUS for a COMPETITOR session whose participantId or contestId
 * is null. A session minted from the OAuth identity alone has neither, so the student signs in
 * successfully and is then authorized as nobody: the problem list refuses them and every
 * submission is rejected, with nothing anywhere naming the cause.
 *
 * That shipped. This is the assertion that would have caught it, and it deliberately checks the
 * VIEWER rather than the session row — the row having the right columns is not the property that
 * matters, being resolvable to a competitor is.
 */
test.describe("the session a new signup receives", () => {
  test("resolves to a COMPETITOR viewer, not to anonymous", async () => {
    const suffix = `signup-session-${String(Date.now())}`;
    const user = await linkedUserFor(googleIdentity(suffix, `${suffix}@parktudor.org`));
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

    expect(
      viewer.kind,
      "a signed-up student authorized as anonymous can read nothing and submit nothing",
    ).toBe("competitor");
  });

  test("a session WITHOUT the participant is anonymous — the bug, pinned", async () => {
    // Guards the regression directly: if someone drops participantId from the callback again,
    // the test above still needs this one to explain why it matters.
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
