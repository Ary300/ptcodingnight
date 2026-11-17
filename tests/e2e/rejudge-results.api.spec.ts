import { expect, test } from "@playwright/test";

import { ContestApi, readEnvelope, waitForVerdict } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import {
  closeTestDb,
  liveProblem,
  pinParticipantToProblemSet,
  readSolution,
  seedE2EContest,
  testDb,
  type SeededContest,
} from "./helpers/seed";

/**
 * G7 — a rejudge replaces the per-test results, not only the verdict.
 *
 * Rejudge cleared the verdict and left the previous run's `TestResult` rows in place. The new run's
 * rows were then inserted with `skipDuplicates` against `@@unique([submissionId, testCaseId])`, so
 * every one was dropped: a WA rejudged to AC showed AC on top and the old failing test underneath.
 *
 * The WA is made real by pointing one hidden case at the wrong expected output for the first run
 * only, then putting it back and rejudging. Requires the worker and Docker.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
const VERDICT_BUDGET_MS = 120_000;

let seeded: SeededContest;

test.beforeAll(async () => {
  seeded = await seedE2EContest();
});

test.afterAll(async () => {
  await closeTestDb();
});

test("a WA rejudged to AC carries the new run's per-test rows", async ({ playwright }) => {
  test.setTimeout(2 * VERDICT_BUDGET_MS + 60_000);
  const live = liveProblem(seeded);

  const admin = new ContestApi(await playwright.request.newContext(), seeded.contestId);
  await admin.adminLogin(ADMIN_PASSCODE);
  const student = new ContestApi(await playwright.request.newContext(), seeded.contestId);
  const joined = await student.signIn({
    displayName: `E2E Rejudge Rows ${String(Date.now())}`,
    divisionId: seeded.divisionIds.get("intermediate") ?? null,
  });
  await pinParticipantToProblemSet(joined.participantId, live.contestProblemId);

  const cases = await testDb().testCase.findMany({
    where: { problemId: live.problemId },
    orderBy: { ordinal: "asc" },
    select: { id: true, isSample: true, expectedOutputPath: true },
  });
  const hidden = cases.find((testCase) => !testCase.isSample);
  const other = cases.find((testCase) => testCase.id !== hidden?.id);
  expect(hidden, "the fixture problem needs a hidden case").toBeDefined();
  expect(other).toBeDefined();
  if (hidden === undefined || other === undefined) return;

  // First run: the hidden case expects another case's output, so a correct solution fails it.
  await testDb().testCase.update({
    where: { id: hidden.id },
    data: { expectedOutputPath: other.expectedOutputPath },
  });
  let submissionId = "";
  try {
    const created = await student.submit({
      contestProblemId: live.contestProblemId,
      language: "PYTHON_312",
      sourceCode: readSolution("accepted.py"),
    });
    submissionId = created.submissionId;
    const first = await waitForVerdict(student, submissionId, VERDICT_BUDGET_MS);
    expect(first.verdict, "the premise: the tampered case fails the first run").toBe("WA");
    const failing = await testDb().testResult.findUnique({
      where: { submissionId_testCaseId: { submissionId, testCaseId: hidden.id } },
      select: { verdict: true },
    });
    expect(failing?.verdict).toBe("WA");
  } finally {
    await testDb().testCase.update({
      where: { id: hidden.id },
      data: { expectedOutputPath: hidden.expectedOutputPath },
    });
  }

  const rejudge = await readEnvelope(
    await admin.rejudgeRaw(submissionId, "Rejudge rows spec: the test data was corrected"),
  );
  expect(rejudge.status).toBe(200);

  const second = await waitForVerdict(student, submissionId, VERDICT_BUDGET_MS);
  expect(second.verdict).toBe("AC");

  // What the student is shown, and what is stored, both describe the NEW run.
  expect(second.testResults).toHaveLength(cases.length);
  for (const result of second.testResults) {
    expect(result.verdict, "a per-test row from the previous run survived the rejudge").toBe("AC");
  }
  const stored = await testDb().testResult.findMany({
    where: { submissionId },
    select: { verdict: true },
  });
  expect(stored).toHaveLength(cases.length);
  expect(stored.every((row) => row.verdict === "AC")).toBe(true);
});
