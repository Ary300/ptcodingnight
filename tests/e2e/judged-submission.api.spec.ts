import { expect, test, type APIRequestContext } from "@playwright/test";

import { ContestApi, waitForVerdict } from "./helpers/api";
import {
  closeTestDb,
  liveProblem,
  readSolution,
  seedE2EContest,
  type SeededContest,
} from "./helpers/seed";

/**
 * G7 — the steps that need a live judge.
 *
 * run samples -> submit -> live verdict -> leaderboard updates.
 *
 * Everything in this file requires **both** `npm run worker` and a running Docker daemon. It is
 * a separate file so that a host with no daemon fails exactly these specs and the rest of the
 * journey still reports honestly. There is no `.skip` here on purpose: a judge that is not
 * running is a red gate, not a green one with a note.
 *
 * The verdict budget below is generous because container creation on this host has been
 * measured at 2.4–15.6 s and varies run to run (CLAUDE.md). That is a budget for *this spec to
 * be meaningful*, not the contest-night latency target — the latency target is G8's, and it is
 * measured there rather than asserted here.
 */

const VERDICT_BUDGET_MS = 120_000;

test.describe.configure({ mode: "serial" });

test.describe("judged submission (requires the worker and Docker)", () => {
  let seeded: SeededContest;
  let competitorContext: APIRequestContext;
  let competitor: ContestApi;

  test.beforeAll(async ({ playwright, baseURL }) => {
    seeded = await seedE2EContest();
    competitorContext = await playwright.request.newContext({ baseURL });
    competitor = new ContestApi(competitorContext, seeded.contestId);

    await competitor.joinOrThrow({
      joinCode: seeded.joinCode,
      displayName: "E2E Judged Competitor",
      divisionId: seeded.divisionIds.get("intermediate") ?? null,
    });
  });

  test.afterAll(async () => {
    await competitorContext?.dispose();
    await closeTestDb();
  });

  test("running the samples is free, shows the full diff, and creates no submission", async () => {
    test.setTimeout(VERDICT_BUDGET_MS + 30_000);
    const live = liveProblem(seeded);

    const before = await competitor.listMySubmissions();

    const result = await competitor.runSamples({
      contestProblemId: live.contestProblemId,
      language: "PYTHON",
      sourceCode: readSolution("accepted.py"),
    });

    expect(result.results.length, "both sample cases should be reported").toBe(2);
    for (const sample of result.results) {
      expect(sample.isSample).toBe(true);
      expect(sample.verdict).toBe("AC");
    }

    const after = await competitor.listMySubmissions();
    expect(after.length, "run samples must never create a Submission (PRD §9.1)").toBe(
      before.length,
    );
  });

  test("a wrong answer comes back as WA with no hidden test data attached", async () => {
    test.setTimeout(VERDICT_BUDGET_MS + 30_000);
    const live = liveProblem(seeded);

    const created = await competitor.submit({
      contestProblemId: live.contestProblemId,
      language: "PYTHON",
      sourceCode: readSolution("wrong-answer.py"),
    });
    const judged = await waitForVerdict(competitor, created.submissionId, VERDICT_BUDGET_MS);

    expect(judged.verdict).toBe("WA");
    expect(judged.score).toBe(0);

    const hidden = judged.testResults.filter((result) => !result.isSample);
    expect(hidden.length, "the hidden cases should still be reported as rows").toBeGreaterThan(0);
    for (const result of hidden) {
      expect(result.diffSnippet, "a hidden case must never carry a diff (PRD §7.2)").toBeNull();
    }

    const body = JSON.stringify(judged);
    for (const secret of ["1000000 2000000", "3000000"]) {
      expect(body, `the submission view leaked hidden test data: ${secret}`).not.toContain(secret);
    }
  });

  test("a correct answer is AC and the leaderboard moves", async () => {
    test.setTimeout(VERDICT_BUDGET_MS + 30_000);
    const live = liveProblem(seeded);

    const before = await competitor.standings();
    const beforeScore =
      before.divisions
        .flatMap((division) => division.rows)
        .find((row) => row.displayName === "E2E Judged Competitor")?.score ?? -1;
    expect(beforeScore).toBe(0);

    const created = await competitor.submit({
      contestProblemId: live.contestProblemId,
      language: "PYTHON",
      sourceCode: readSolution("accepted.py"),
    });
    const judged = await waitForVerdict(competitor, created.submissionId, VERDICT_BUDGET_MS);

    expect(judged.verdict).toBe("AC");
    expect(judged.score).toBe(live.basePoints);
    expect(judged.runtimeMs).not.toBeNull();

    const after = await competitor.standings();
    const afterRow = after.divisions
      .flatMap((division) => division.rows)
      .find((row) => row.displayName === "E2E Judged Competitor");
    expect(afterRow?.score).toBe(live.basePoints);

    // And the problem list now says so, from the same scoring path.
    const problems = await competitor.listProblems();
    const solved = problems.find((problem) => problem.slug === live.slug);
    expect(solved?.solved).toBe(true);
    expect(solved?.bestScore).toBe(live.basePoints);
  });

  test("no submission is ever left showing IE to a student", async () => {
    const mine = await competitor.listMySubmissions();
    expect(mine.length).toBeGreaterThan(0);
    for (const submission of mine) {
      expect(submission.verdict, `submission ${submission.submissionId} came back IE`).not.toBe(
        "IE",
      );
    }
  });
});
