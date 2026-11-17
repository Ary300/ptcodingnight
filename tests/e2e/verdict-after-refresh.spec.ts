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

// The second case reuses the contest the first one builds.
test.describe.configure({ mode: "serial" });

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
  // The verdict panel itself. Side by side the Results drawer's summary line says "Accepted"
  // too, so the bare text matches twice there; the panel is the one that has to be on screen.
  const accepted = solution.getByRole("region", { name: "Verdict" }).getByText("Accepted", { exact: true });
  await expect(accepted).toBeVisible({ timeout: 30_000 });

  await page.reload();
  await expect(accepted).toBeVisible({ timeout: 30_000 });
});

test("a Java class not named Main is told to rename it (requires the worker)", async ({
  page,
  playwright,
}) => {
  test.setTimeout(240_000);
  const seeded = await seedE2EContest({ now: new Date() });
  const problem = liveProblem(seeded);
  const db = testDb();
  const contest = await db.contest.findFirstOrThrow({
    where: { joinCode: CODE },
    select: { id: true },
  });
  // The first case's slot pointed at a problem the reseed above replaced; point a fresh one at it.
  await db.contestProblem.deleteMany({ where: { contestId: contest.id } });
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

  await signInAsCompetitor(page, contest.id);
  const cookies = await page.context().cookies();
  const api = await playwright.request.newContext({
    extraHTTPHeaders: { cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") },
  });
  // What an IDE writes for a file called Solution.java.
  const response = await api.post("/api/submissions", {
    data: {
      contestProblemId: slot.id,
      language: "JAVA_21",
      sourceCode:
        "import java.util.*;\npublic class Solution {\n  public static void main(String[] a) {\n" +
        "    Scanner s = new Scanner(System.in);\n    System.out.println(s.nextLong() + s.nextLong());\n  }\n}\n",
    },
  });
  expect(response.status()).toBe(202);
  const id = ((await response.json()) as { data: { submissionId: string } }).data.submissionId;
  await expect
    .poll(
      async () =>
        (await db.submission.findUniqueOrThrow({ where: { id }, select: { verdict: true } }))
          .verdict,
      { timeout: 180_000 },
    )
    .toBe("CE");

  await page.goto(`/contest/${problem.slug}`);
  await expect(
    page
      .getByRole("region", { name: "Your solution" })
      .getByText(/^Rename the class Solution to Main\./),
  ).toBeVisible({ timeout: 30_000 });
});
