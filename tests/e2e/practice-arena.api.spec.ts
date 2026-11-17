import { expect, test } from "@playwright/test";

import { linkedUserFor } from "@/lib/contest/accounts";
import { ensureEnrolled } from "@/lib/contest/enrolment";

import { ContestApi, readEnvelope } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";

/**
 * G7 — the practice arena: sign-in is never a locked door.
 *
 * Sign-in used to refuse a student flatly when no contest was open. The organizer's call: let
 * people in and give them sample questions to try. The mechanism is one permanent contest with
 * `isPractice: true`, and these specs pin its three contracts from the outside:
 *
 *  - a fresh account lands in the arena, never in a real contest (student accounts are closed);
 *  - an account the organizer put on a real roster lands there, however live the arena looks;
 *  - a practice question can never enter a scored line-up (API refusal, like DRAFT).
 */

let seeded: SeededContest;
let admin: ContestApi;

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
const ARENA_JOIN_CODE = "E2E-PRACTICE-ARENA";

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();
  admin = new ContestApi(await playwright.request.newContext(), seeded.contestId);
  await admin.adminLogin(ADMIN_PASSCODE);

  await testDb().contest.deleteMany({ where: { joinCode: ARENA_JOIN_CODE } });
  await testDb().contest.create({
    data: {
      name: "E2E Practice Arena",
      joinCode: ARENA_JOIN_CODE,
      scoringPresetId: "coding-night-classic",
      state: "RUNNING",
      isPractice: true,
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      endsAt: new Date("2100-01-01T00:00:00.000Z"),
      allowReadingUnassignedSets: true,
    },
  });
});

test.afterAll(async () => {
  // The fixture contest back to RUNNING for whoever runs next, and the arena gone entirely.
  await testDb().contest.update({
    where: { id: seeded.contestId },
    data: { state: "RUNNING" },
  });
  await testDb().contest.deleteMany({ where: { joinCode: ARENA_JOIN_CODE } });
  await closeTestDb();
});

let accountSeq = 0;

/** A fresh account signing in with a provider, the way the OAuth callback does it. */
async function freshAccountSignsIn(): Promise<{ userId: string; contestId: string | null }> {
  accountSeq += 1;
  const stamp = `${String(Date.now())}-${String(accountSeq)}`;
  const user = await linkedUserFor({
    provider: "google",
    subject: `arena-sub-${stamp}`,
    email: `arena-${stamp}@e2e.test`,
    emailVerified: true,
    displayName: `Arena Visitor ${stamp}`,
  });
  const enrolment = await ensureEnrolled(user.userId, user.displayName);
  return { userId: user.userId, contestId: enrolment?.contestId ?? null };
}

test("a fresh account lands in a practice arena, never in the real contest", async () => {
  // Student accounts are closed: join codes and the organizer roster are the only ways into a
  // real contest. An account that signs in anyway still gets somewhere to practise.
  const landed = await freshAccountSignsIn();
  expect(landed.contestId, "an account enrolled itself into the real contest").not.toBe(
    seeded.contestId,
  );
  expect(landed.contestId, "the arena should take a fresh account").not.toBeNull();
  const contest = await testDb().contest.findUniqueOrThrow({
    where: { id: landed.contestId ?? "" },
    select: { isPractice: true },
  });
  expect(contest.isPractice).toBe(true);
});

test("an account the organizer put on the real roster lands in the real contest over the arena", async () => {
  const first = await freshAccountSignsIn();
  // The organizer's roster action, over HTTP.
  expect((await admin.addParticipantRaw(first.userId)).status()).toBe(200);

  const user = await testDb().user.findUniqueOrThrow({
    where: { id: first.userId },
    select: { displayName: true },
  });
  const enrolment = await ensureEnrolled(first.userId, user.displayName);
  expect(
    enrolment?.contestId,
    "the arena's permanent window must not outrank the night's contest",
  ).toBe(seeded.contestId);
});

test("a practice question is refused by a scored line-up, in the API", async () => {
  const problem = await testDb().problem.create({
    data: {
      slug: `e2e-practice-only-${String(Date.now())}`,
      title: "E2E Practice Only",
      statementMd: "Practice statement.",
      state: "PUBLISHED",
      type: "ALGORITHM",
      practiceOnly: true,
    },
    select: { id: true },
  });

  try {
    const draft = await testDb().contest.create({
      data: {
        name: `E2E Lineup Refusal ${String(Date.now())}`,
        joinCode: `E2EPRC${String(Date.now()).slice(-6)}`,
        scoringPresetId: "coding-night-classic",
        state: "DRAFT",
        startsAt: new Date(Date.now() + 60 * 60_000),
        endsAt: new Date(Date.now() + 2 * 60 * 60_000),
      },
      select: { id: true },
    });

    const refusal = await readEnvelope(
      await admin.setContestProblemsRaw(draft.id, {
        reason: "attempting to schedule a practice question",
        problems: [
          {
            problemId: problem.id,
            slotLabel: "A1",
            basePoints: 100,
            round: "INDIVIDUAL",
            setLabel: "A",
            divisionId: null,
          },
        ],
      }),
    );
    expect(refusal.status, "the line-up API must refuse a practice question").toBe(400);

    await testDb().contest.delete({ where: { id: draft.id } });
  } finally {
    await testDb().problem.delete({ where: { id: problem.id } });
  }
});
