import { expect, test } from "@playwright/test";

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
 *  - with nothing real open, a fresh sign-up lands in the arena instead of an error;
 *  - with a real contest open, the real contest wins the sign-in, however live the arena looks;
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

async function signUp(
  request: { newContext: () => Promise<import("@playwright/test").APIRequestContext> },
  email: string,
) {
  const context = await request.newContext();
  const response = await context.post("/api/auth/signup", {
    data: {
      fullName: `Arena Visitor ${Date.now()}`,
      email,
      password: "a-long-practice-password",
    },
  });
  return { context, response };
}

test("with nothing real open, a fresh sign-up lands in the arena instead of an error", async ({
  playwright,
}) => {
  /*
    "Nothing real open" has to be MADE true, not assumed: a dev database carries leftover
    RUNNING contests from earlier work, and any one of them legitimately outranks the arena
    (that ranking is this feature working). Close every real sign-in candidate, remember each
    row's actual state, and restore them all afterwards.
  */
  const openContests = await testDb().contest.findMany({
    where: {
      isPractice: false,
      state: { in: ["SCHEDULED", "RUNNING", "FROZEN"] },
    },
    select: { id: true, state: true },
  });
  await testDb().contest.updateMany({
    where: { id: { in: openContests.map((contest) => contest.id) } },
    data: { state: "ENDED" },
  });

  try {
    const arena = await testDb().contest.findUniqueOrThrow({
      where: { joinCode: ARENA_JOIN_CODE },
      select: { id: true },
    });

    /*
      Other spec files run in parallel workers and legitimately create open contests mid-test
      (the clock specs mint RUNNING rows; other files re-seed). A real contest born inside this
      window SHOULD outrank the arena - that is the feature - so landing there is a race, not a
      regression, and the honest response is to close it and try again. Landing in a contest
      that already existed when we swept is the actual failure this spec exists to catch.
    */
    const sweptIds = new Set(openContests.map((contest) => contest.id));
    let landed: string | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { context, response } = await signUp(
        playwright.request,
        `arena-${String(Date.now())}-${String(attempt)}@e2e.test`,
      );
      expect(response.status(), "sign-up must succeed with only the arena open").toBe(200);

      const session = await context.get("/api/auth/session");
      const body = (await session.json()) as { data: { contestId: string | null } };
      landed = body.data.contestId;
      if (landed === arena.id) break;

      expect(
        landed !== null && !sweptIds.has(landed),
        "sign-up landed in a contest that was already closed when the sweep ran",
      ).toBe(true);

      // A parallel worker opened that contest mid-test. Close it too and go again.
      if (landed !== null) {
        sweptIds.add(landed);
        const interloper = await testDb().contest.findUnique({
          where: { id: landed },
          select: { state: true },
        });
        if (interloper !== null) {
          openContests.push({ id: landed, state: interloper.state });
          await testDb().contest.update({
            where: { id: landed },
            data: { state: "ENDED" },
          });
        }
      }
    }
    expect(landed, "the session should point at the arena").toBe(arena.id);
  } finally {
    for (const contest of openContests) {
      await testDb().contest.update({
        where: { id: contest.id },
        data: { state: contest.state },
      });
    }
  }
});

test("with a real contest open, the real contest wins the sign-in over the arena", async ({
  playwright,
}) => {
  const { context, response } = await signUp(
    playwright.request,
    `real-${String(Date.now())}@e2e.test`,
  );
  expect(response.status()).toBe(200);

  const session = await context.get("/api/auth/session");
  const body = (await session.json()) as { data: { contestId: string | null } };
  expect(
    body.data.contestId,
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
