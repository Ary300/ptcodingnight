import { expect, test } from "@playwright/test";

import { closeTestDb, liveProblem, seedE2EContest, testDb } from "./helpers/seed";

/**
 * G7 — the wall clock counts against the server, not the laptop driving the projector.
 *
 * The projector's countdown subtracted the laptop's own clock from the end time, so a laptop three
 * minutes slow told the room it had three more minutes than the server would accept submissions
 * for. The page now reads the server's `Date` header on every poll and counts by that.
 */

const CODE = "NFMSKEW";

test.afterAll(async () => {
  await testDb().contest.deleteMany({ where: { joinCode: CODE } });
  await closeTestDb();
});

test("a projector laptop whose clock is three minutes slow still shows the server's time left", async ({
  page,
}) => {
  const seeded = await seedE2EContest({ now: new Date() });
  const db = testDb();
  await db.contest.deleteMany({ where: { joinCode: CODE } });
  const endsAt = new Date(Date.now() + 10 * 60_000);
  const contest = await db.contest.create({
    data: {
      name: "E2E Night Skew",
      joinCode: CODE,
      state: "RUNNING",
      startsAt: new Date(Date.now() - 30 * 60_000),
      endsAt,
    },
    select: { id: true },
  });
  await db.contestProblem.create({
    data: {
      contestId: contest.id,
      problemId: liveProblem(seeded).problemId,
      slotLabel: "G1",
      basePoints: 100,
      round: "GROUP",
    },
  });

  // The laptop's clock, three minutes behind the server's.
  await page.clock.install({ time: new Date(Date.now() - 3 * 60_000) });
  await page.goto(`/projector?contest=${contest.id}`);

  // Ten minutes left by the server; thirteen by the slow laptop. Allow the minute to tick over.
  await expect(page.getByText(/^00:(10|09):\d\d$/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/^00:1[23]:\d\d$/)).toHaveCount(0);
});
