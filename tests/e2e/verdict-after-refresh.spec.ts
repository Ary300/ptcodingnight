import { expect, test } from "@playwright/test";

import { closeTestDb, liveProblem, readSolution, seedE2EContest, testDb } from "./helpers/seed";
import { signInAsCompetitor } from "./helpers/session";

/**
 * G7 — a refresh, a closed lid or a lost connection does not lose the verdict.
 *
 * The verdict panel lived only in memory. A student who submitted, refreshed while it was judging
 * and came back found an empty panel under the editor and no sign the submission had happened, and
 * the verdict sat on a Submissions page they did not know to open. The problem page now opens on
 * its last submission for that problem.
 */

const CODE = "NFMREFRESH";

test.afterAll(async () => {
  await testDb().contest.deleteMany({ where: { joinCode: CODE } });
  await closeTestDb();
});

test("the problem page opens on the verdict of the last submission made there", async ({
  page,
}) => {
  const seeded = await seedE2EContest({ now: new Date() });
  const problem = liveProblem(seeded);
  const db = testDb();
  await db.contest.deleteMany({ where: { joinCode: CODE } });
  const contest = await db.contest.create({
    data: {
      name: "E2E Night Refresh",
      joinCode: CODE,
      state: "RUNNING",
      startsAt: new Date(Date.now() - 10 * 60_000),
      endsAt: new Date(Date.now() + 60 * 60_000),
    },
    select: { id: true },
  });
  const slot = await db.contestProblem.create({
    data: {
      contestId: contest.id,
      problemId: problem.problemId,
      slotLabel: "G1",
      basePoints: 100,
      round: "GROUP",
    },
    select: { id: true },
  });

  const me = await signInAsCompetitor(page, contest.id);
  // Judged while the student was away: the row is all the page has to go on.
  const judgedAt = new Date(Date.now() - 30_000);
  await db.submission.create({
    data: {
      participantId: me.participantId,
      contestProblemId: slot.id,
      language: "PYTHON_312",
      sourceCode: readSolution("accepted.py"),
      submittedAt: new Date(Date.now() - 60_000),
      verdict: "AC",
      score: 100,
      judgedAt,
      effectiveAt: judgedAt,
    },
  });

  await page.goto(`/contest/${problem.slug}`);
  const solution = page.getByRole("region", { name: "Your solution" });
  await expect(solution.getByText("Accepted", { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.reload();
  await expect(solution.getByText("Accepted", { exact: true })).toBeVisible({ timeout: 30_000 });
});
