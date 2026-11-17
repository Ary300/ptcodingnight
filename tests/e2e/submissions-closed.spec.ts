import { expect, test } from "@playwright/test";

import { closeTestDb, liveProblem, seedE2EContest, testDb } from "./helpers/seed";
import { signInAsCompetitor } from "./helpers/session";

/**
 * G7 — after submissions close, the problem page says so instead of letting a press fail.
 *
 * Submit for judging stayed enabled after the window closed, the press went to the server, and the
 * Results header read "Did not finish", which sounds like the student's code failed. Run examples
 * and Submit are now disabled once the window has closed, at load and on the clock for a student
 * who has the page open across the end, with the reason as the buttons' description.
 */

const CODE = "NFMCLOSED";
const REASON = /Submissions are closed because the contest window has ended/;

test.describe.configure({ mode: "serial" });

let contestId = "";
let slug = "";

async function windowEndsIn(ms: number): Promise<void> {
  await testDb().contest.update({
    where: { id: contestId },
    // RUNNING again: a page read past the end lets the clock reconcile the contest to ENDED.
    data: { state: "RUNNING", endsAt: new Date(Date.now() + ms) },
  });
}

test.beforeAll(async () => {
  const seeded = await seedE2EContest({ now: new Date() });
  const problem = liveProblem(seeded);
  slug = problem.slug;
  const db = testDb();
  await db.contest.deleteMany({ where: { joinCode: CODE } });
  const contest = await db.contest.create({
    data: {
      name: "E2E Submissions Closed",
      joinCode: CODE,
      state: "RUNNING",
      startsAt: new Date(Date.now() - 10 * 60_000),
      endsAt: new Date(Date.now() + 60 * 60_000),
    },
    select: { id: true },
  });
  contestId = contest.id;
  // A GROUP slot, which every participant can open whatever their set.
  await db.contestProblem.create({
    data: {
      contestId,
      problemId: problem.problemId,
      slotLabel: "G1",
      basePoints: 100,
      round: "GROUP",
    },
  });
});

test.afterAll(async () => {
  await testDb().contest.deleteMany({ where: { joinCode: CODE } });
  await closeTestDb();
});

test("a page opened after the end has Run examples and Submit disabled, with the reason", async ({
  page,
}) => {
  await windowEndsIn(-60_000);
  await signInAsCompetitor(page, contestId);
  await page.goto(`/contest/${slug}`);

  const submit = page.getByRole("button", { name: "Submit for judging" });
  const run = page.getByRole("button", { name: "Run examples" });
  await expect(submit).toBeVisible({ timeout: 30_000 });
  await expect(submit).toBeDisabled();
  await expect(run).toBeDisabled();
  await expect(submit).toHaveAccessibleDescription(REASON);
  await expect(run).toHaveAccessibleDescription(REASON);
});

test("a page open across the end disables both buttons when the window closes", async ({ page }) => {
  await windowEndsIn(12_000);
  await signInAsCompetitor(page, contestId);
  await page.goto(`/contest/${slug}`);

  const submit = page.getByRole("button", { name: "Submit for judging" });
  const run = page.getByRole("button", { name: "Run examples" });
  await expect(submit).toBeEnabled({ timeout: 30_000 });
  await expect(run).toBeEnabled();
  await expect(run).toHaveAccessibleDescription(/Running examples is free/);

  await expect(submit).toBeDisabled({ timeout: 30_000 });
  await expect(run).toBeDisabled();
  await expect(submit).toHaveAccessibleDescription(REASON);
});
