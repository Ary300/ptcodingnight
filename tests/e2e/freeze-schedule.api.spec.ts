import { expect, test } from "@playwright/test";

import { ContestApi, readEnvelope, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";

/**
 * G7 — scheduling the freeze, which is how the last stretch of the night keeps its mystery.
 *
 * The organizer's sentence is "freeze the board thirty minutes before the end", so the request
 * carries MINUTES and the server does the subtraction against the contest's own end time. Freezing
 * itself is not new; nothing here changes how a frozen board is computed. What is new is that the
 * clock can be set after the contest exists, which it could not be before: the only control was an
 * absolute datetime in the create form, and a contest already made needed SQL.
 */

let seeded: SeededContest;
let admin: ContestApi;
let contestId: string;

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();
  contestId = seeded.contestId;
  admin = new ContestApi(await playwright.request.newContext(), contestId);
  await admin.adminLogin(ADMIN_PASSCODE);
});

test.afterAll(async () => {
  // Leave the fixture as the seed made it: a stray freeze would silently freeze the board for
  // every other spec that reads standings from this contest.
  await readOk(await admin.freezeScheduleRaw(null));
  await closeTestDb();
});

async function contestWindow(): Promise<{ startsAt: Date; endsAt: Date }> {
  return testDb().contest.findUniqueOrThrow({
    where: { id: contestId },
    select: { startsAt: true, endsAt: true },
  });
}

test("minutes before the end become an instant, computed from the contest's own window", async () => {
  const { endsAt } = await contestWindow();

  const { data } = await readOk(await admin.freezeScheduleRaw(30));
  const saved = data as { freezeAt: string; minutesBeforeEnd: number; activeNow: boolean };

  expect(saved.minutesBeforeEnd).toBe(30);
  expect(new Date(saved.freezeAt).getTime()).toBe(endsAt.getTime() - 30 * 60_000);
  expect(saved.activeNow, "a fixture window that has not reached the freeze yet").toBe(false);

  // And it is the same column the freeze has always been computed from, not a second store.
  const stored = await testDb().contest.findUniqueOrThrow({
    where: { id: contestId },
    select: { freezeAt: true },
  });
  expect(stored.freezeAt?.toISOString()).toBe(saved.freezeAt);
});

test("clearing it puts the board back to updating until the end", async () => {
  await readOk(await admin.freezeScheduleRaw(30));
  const { data } = await readOk(await admin.freezeScheduleRaw(null));
  expect((data as { freezeAt: string | null }).freezeAt).toBeNull();

  const stored = await testDb().contest.findUniqueOrThrow({
    where: { id: contestId },
    select: { freezeAt: true },
  });
  expect(stored.freezeAt).toBeNull();
});

test("a freeze longer than the contest is refused, and says what to change", async () => {
  const { startsAt, endsAt } = await contestWindow();
  const windowMinutes = Math.ceil((endsAt.getTime() - startsAt.getTime()) / 60_000);

  const refused = await readEnvelope(await admin.freezeScheduleRaw(windowMinutes + 5));
  expect(refused.status).toBe(400);
  expect(refused.message ?? "").toMatch(/before the contest does/i);

  // Nothing was written: a refusal must not half-apply.
  const stored = await testDb().contest.findUniqueOrThrow({
    where: { id: contestId },
    select: { freezeAt: true },
  });
  expect(stored.freezeAt).toBeNull();
});

test("zero, a fraction and an hour past the ceiling are all refused at the boundary", async () => {
  for (const bad of [0, -30, 2.5, 721]) {
    const refused = await readEnvelope(await admin.freezeScheduleRaw(bad));
    expect(refused.status, `${String(bad)} minutes must be refused`).toBe(400);
  }
});

test("a time already past freezes the public board now, and says so", async ({ playwright }) => {
  /*
    The organizer who forgot until after the moment they wanted. Setting a freeze that has already
    passed is legitimate — it means "stop the board as of then" — and the response says the board is
    frozen now rather than leaving the organizer to wonder.
  */
  const { startsAt, endsAt } = await contestWindow();
  const windowMinutes = Math.floor((endsAt.getTime() - startsAt.getTime()) / 60_000);
  const remaining = Math.ceil((endsAt.getTime() - Date.now()) / 60_000);
  // Far enough back to be in the past, still inside the contest window.
  const minutes = Math.min(windowMinutes - 1, remaining + 5);

  const { data } = await readOk(await admin.freezeScheduleRaw(minutes));
  const saved = data as { freezeAt: string; activeNow: boolean };
  expect(new Date(saved.freezeAt).getTime()).toBeLessThan(Date.now());
  expect(saved.activeNow).toBe(true);

  /*
    The PUBLIC board is now computed as-of that instant. Read as a STUDENT, not as the organizer:
    the admin view is never frozen by design, which is what makes the reveal at the end a reveal
    rather than a recalculation. Asserting this against `admin` proved nothing, and it is the first
    thing this spec got wrong.
  */
  const student = new ContestApi(await playwright.request.newContext(), contestId);
  await student.signIn({ displayName: `E2E Freeze Watcher ${String(Date.now())}` });
  const board = (await readOk(await student.standingsRaw())).data as {
    frozen: boolean;
    asOf: string;
  };
  expect(board.frozen).toBe(true);
  expect(new Date(board.asOf).getTime()).toBe(new Date(saved.freezeAt).getTime());

  await readOk(await admin.freezeScheduleRaw(null));
});

test("a hand-frozen board refuses a schedule change until it is unfrozen", async () => {
  /*
    A manual freeze stamps `freezeAt` with the instant it happened, and every public replay is
    computed against that instant. Rewriting it underneath would move the cutoff of a board the room
    has already seen, so the organizer unfreezes first.
  */
  await admin.freeze(true);
  try {
    const refused = await readEnvelope(await admin.freezeScheduleRaw(30));
    expect(refused.status).toBe(409);
    expect(refused.message ?? "").toMatch(/Unfreeze it first/i);
  } finally {
    await admin.freeze(false);
    await readOk(await admin.freezeScheduleRaw(null));
  }
});

test("only an organizer can set it", async ({ playwright }) => {
  const stranger = new ContestApi(await playwright.request.newContext(), contestId);
  const refused = await readEnvelope(await stranger.freezeScheduleRaw(30));
  expect(refused.status).toBeGreaterThanOrEqual(400);
  expect(refused.status).toBeLessThan(500);
});
