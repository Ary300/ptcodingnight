import { expect, test, type APIRequestContext } from "@playwright/test";

import { ContestApi, readEnvelope, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";

/**
 * G7 — the GROUP-question clock, which is how the night opens with an individual stretch.
 *
 * The organizer's sentence is "team questions open thirty minutes in", so the request carries
 * MINUTES AFTER THE START and the server does the addition against the contest's own window. The
 * mirror of `freeze-schedule.api.spec.ts`. What this pins is that the clock is ENFORCED where it
 * matters, in the API: a locked team question lists as locked, its statement is refused, and an
 * individual question beside it is untouched. Clearing the clock opens the team question again.
 *
 * The fixture contest started 30 minutes before the seed and ends 90 minutes after it, so a clock
 * of 30 minutes would land exactly on the seed instant and be open by the time a request arrives.
 * The specs use 60 minutes, which opens half an hour from now and is unambiguously shut.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
const GROUP_SLUG = "e2e-group-problem";
const INDIVIDUAL_SLUG = "e2e-panther-sum";
const LOCKED_MINUTES = 60;

let seeded: SeededContest;
let admin: ContestApi;
let contestId: string;

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();
  contestId = seeded.contestId;
  admin = new ContestApi(await playwright.request.newContext(), contestId);
  await admin.adminLogin(ADMIN_PASSCODE);
});

test.afterAll(async () => {
  // Leave the fixture as the seed made it: a stray clock would lock the group problem for every
  // other spec that reads it from this contest.
  await readOk(await admin.groupUnlockRaw(null));
  await closeTestDb();
});

async function contestWindow(): Promise<{ startsAt: Date; endsAt: Date }> {
  return testDb().contest.findUniqueOrThrow({
    where: { id: contestId },
    select: { startsAt: true, endsAt: true },
  });
}

/** A student in the division the fixture's group problem belongs to, pinned onto set A. */
async function student(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  displayName: string,
): Promise<ContestApi> {
  const api = new ContestApi(await playwright.request.newContext(), contestId);
  await api.signIn({
    displayName,
    divisionId: seeded.divisionIds.get("intermediate") ?? null,
    chosenSetId: seeded.problemSetIds.get("setA") ?? null,
  });
  return api;
}

test("minutes after the start become an instant, computed from the contest's own window", async () => {
  const { startsAt } = await contestWindow();

  const { data } = await readOk(await admin.groupUnlockRaw(LOCKED_MINUTES));
  const saved = data as {
    minutesAfterStart: number;
    groupUnlockAt: string;
    openNow: boolean;
    groupProblemCount: number;
  };

  expect(saved.minutesAfterStart).toBe(LOCKED_MINUTES);
  expect(new Date(saved.groupUnlockAt).getTime()).toBe(
    startsAt.getTime() + LOCKED_MINUTES * 60_000,
  );
  expect(saved.openNow, "an opening half an hour from now is not open yet").toBe(false);
  expect(saved.groupProblemCount, "the fixture has one GROUP row").toBe(1);

  // The column stores MINUTES, never the derived instant: the single source of truth.
  const stored = await testDb().contest.findUniqueOrThrow({
    where: { id: contestId },
    select: { groupUnlockMinutes: true },
  });
  expect(stored.groupUnlockMinutes).toBe(LOCKED_MINUTES);

  // And no row was touched. The gate derives the opening on read.
  const row = await testDb().contestProblem.findFirstOrThrow({
    where: { contestId, problem: { slug: GROUP_SLUG } },
    select: { unlockAt: true },
  });
  expect(row.unlockAt).toBeNull();
});

test("a student sees the team question locked, with its opening time, and cannot read it", async ({
  playwright,
}) => {
  await readOk(await admin.groupUnlockRaw(LOCKED_MINUTES));
  const { startsAt } = await contestWindow();
  const expectedOpening = new Date(startsAt.getTime() + LOCKED_MINUTES * 60_000).toISOString();

  const api = await student(playwright, `E2E GroupClock Reader ${String(Date.now())}`);
  const problems = await api.listProblems();

  const group = problems.find((problem) => problem.slug === GROUP_SLUG);
  expect(group, "the group problem is still LISTED while locked").toBeDefined();
  expect(group?.isGroupProblem).toBe(true);
  expect(group?.unlocked).toBe(false);
  // The lobby prints "Opens 7:30 PM" from this, so the instant travels with the row.
  expect(group?.unlockAt).toBe(expectedOpening);

  // The statement is where the lock has to hold. 403, not 404: the problem exists and is theirs.
  const refused = await readEnvelope(await api.getProblemRaw(GROUP_SLUG));
  expect(refused.status).toBe(403);
  expect(refused.code).toBe("FORBIDDEN");

  // The individual question beside it never hears about the group clock.
  const individual = problems.find((problem) => problem.slug === INDIVIDUAL_SLUG);
  expect(individual?.unlocked).toBe(true);
  expect(individual?.unlockAt).toBeNull();
  const detail = await api.getProblem(INDIVIDUAL_SLUG);
  expect(detail.unlocked).toBe(true);
});

test("a locked team question refuses a submission, so the lock is not only on the list", async ({
  playwright,
}) => {
  await readOk(await admin.groupUnlockRaw(LOCKED_MINUTES));
  const api = await student(playwright, `E2E GroupClock Submitter ${String(Date.now())}`);
  const group = seeded.problems.get(GROUP_SLUG);
  expect(group).toBeDefined();
  if (group === undefined) return;

  const refused = await readEnvelope(
    await api.submitRaw({
      contestProblemId: group.contestProblemId,
      language: "PYTHON_312",
      sourceCode: "a, b = map(int, input().split())\nprint(a + b)\n",
    }),
  );
  expect(refused.status).toBe(403);
  expect(refused.code).toBe("FORBIDDEN");
});

test("clearing the clock opens the team question with everything else", async ({ playwright }) => {
  await readOk(await admin.groupUnlockRaw(LOCKED_MINUTES));
  const { data } = await readOk(await admin.groupUnlockRaw(null));
  const cleared = data as { minutesAfterStart: number | null; groupUnlockAt: string | null };
  expect(cleared.minutesAfterStart).toBeNull();
  expect(cleared.groupUnlockAt).toBeNull();

  const stored = await testDb().contest.findUniqueOrThrow({
    where: { id: contestId },
    select: { groupUnlockMinutes: true },
  });
  expect(stored.groupUnlockMinutes).toBeNull();

  const api = await student(playwright, `E2E GroupClock Opened ${String(Date.now())}`);
  const group = (await api.listProblems()).find((problem) => problem.slug === GROUP_SLUG);
  expect(group?.unlocked).toBe(true);
  expect(group?.unlockAt).toBeNull();

  const detail = await api.getProblem(GROUP_SLUG);
  expect(detail.slug).toBe(GROUP_SLUG);
  expect(detail.unlocked).toBe(true);
});

test("a time already passed opens the team questions now, and says so", async ({ playwright }) => {
  // The fixture started 30 minutes before the seed, so one minute in is already behind us.
  const { data } = await readOk(await admin.groupUnlockRaw(1));
  const saved = data as { groupUnlockAt: string; openNow: boolean };
  expect(new Date(saved.groupUnlockAt).getTime()).toBeLessThan(Date.now());
  expect(saved.openNow).toBe(true);

  const api = await student(playwright, `E2E GroupClock Late ${String(Date.now())}`);
  const group = (await api.listProblems()).find((problem) => problem.slug === GROUP_SLUG);
  expect(group?.unlocked).toBe(true);
  // The instant still travels with the row; it is simply in the past.
  expect(group?.unlockAt).toBe(saved.groupUnlockAt);

  await readOk(await admin.groupUnlockRaw(null));
});

test("an opening at or past the end is refused, and says what to change", async () => {
  const { startsAt, endsAt } = await contestWindow();
  const windowMinutes = Math.ceil((endsAt.getTime() - startsAt.getTime()) / 60_000);

  for (const bad of [windowMinutes, windowMinutes + 5]) {
    const refused = await readEnvelope(await admin.groupUnlockRaw(bad));
    expect(refused.status, `${String(bad)} minutes must be refused`).toBe(400);
    expect(refused.message ?? "").toMatch(/after the contest ends/i);
    expect(refused.message ?? "").toMatch(/fewer minutes, or a longer contest/i);
  }

  // Nothing was written: a refusal must not half-apply.
  const stored = await testDb().contest.findUniqueOrThrow({
    where: { id: contestId },
    select: { groupUnlockMinutes: true },
  });
  expect(stored.groupUnlockMinutes).toBeNull();
});

test("zero, a fraction and an hour past the ceiling are all refused at the boundary", async () => {
  for (const bad of [0, -30, 2.5, 721]) {
    const refused = await readEnvelope(await admin.groupUnlockRaw(bad));
    expect(refused.status, `${String(bad)} minutes must be refused`).toBe(400);
  }
});

test("the clock leaves the audit trail the freeze does", async () => {
  await readOk(await admin.groupUnlockRaw(LOCKED_MINUTES));
  const entry = await testDb().auditLog.findFirst({
    where: { entity: `Contest:${contestId}`, action: "contest.group_unlock_scheduled" },
    orderBy: { at: "desc" },
    select: { after: true },
  });
  expect(entry, "setting the clock is an organizer decision and is audited").not.toBeNull();
  expect(entry?.after).toMatchObject({ groupUnlockMinutes: LOCKED_MINUTES });
  await readOk(await admin.groupUnlockRaw(null));
});

test("only an organizer can set it", async ({ playwright }) => {
  const stranger = new ContestApi(await playwright.request.newContext(), contestId);
  const refused = await readEnvelope(await stranger.groupUnlockRaw(LOCKED_MINUTES));
  expect(refused.status).toBeGreaterThanOrEqual(400);
  expect(refused.status).toBeLessThan(500);
});
