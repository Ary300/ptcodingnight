import { expect, test, type Page } from "@playwright/test";

import { closeTestDb, liveProblem, seedE2EContest, testDb } from "./helpers/seed";
import { signInAsCompetitor, type CompetitorSession } from "./helpers/session";

/**
 * G7 — unsubmitted code survives a closed tab, and a returning student finds what they last sent.
 *
 * Drafts lived in sessionStorage, so closing the tab or opening the problem in a new tab lost
 * them, and a student who came back saw the starter template, even under a "Solved" badge. Drafts
 * now live in localStorage keyed by contest, participant, problem and language, and with no draft
 * the editor opens on the student's LAST submission for that problem and language.
 *
 * And the other half, which matters as much: one student never sees another's code, in the
 * editor or over the source route.
 */

const CODE = "NFMDRAFTS";
const SUBMITTED = "print('what I sent last time')\n";
const TYPED = "print('typed, never submitted')\n";

test.describe.configure({ mode: "serial" });

let contestId = "";
let contestProblemId = "";
let slug = "";

test.beforeAll(async () => {
  const seeded = await seedE2EContest({ now: new Date() });
  const problem = liveProblem(seeded);
  slug = problem.slug;
  const db = testDb();
  await db.contest.deleteMany({ where: { joinCode: CODE } });
  const contest = await db.contest.create({
    data: {
      name: "E2E Drafts",
      joinCode: CODE,
      state: "RUNNING",
      startsAt: new Date(Date.now() - 10 * 60_000),
      endsAt: new Date(Date.now() + 60 * 60_000),
    },
    select: { id: true },
  });
  contestId = contest.id;
  const slot = await db.contestProblem.create({
    data: {
      contestId,
      problemId: problem.problemId,
      slotLabel: "G1",
      basePoints: 100,
      round: "GROUP",
    },
    select: { id: true },
  });
  contestProblemId = slot.id;
});

test.afterAll(async () => {
  await testDb().contest.deleteMany({ where: { joinCode: CODE } });
  await closeTestDb();
});

function editorOf(page: Page) {
  return page.getByRole("textbox", { name: /^Solution for / });
}

async function submittedEarlier(me: CompetitorSession): Promise<string> {
  const judgedAt = new Date(Date.now() - 30_000);
  const row = await testDb().submission.create({
    data: {
      participantId: me.participantId,
      contestProblemId,
      language: "PYTHON_312",
      sourceCode: SUBMITTED,
      submittedAt: new Date(Date.now() - 60_000),
      verdict: "AC",
      score: 100,
      judgedAt,
      effectiveAt: judgedAt,
    },
    select: { id: true },
  });
  return row.id;
}

test("typed code survives closing the tab and opening the problem in a new one", async ({
  page,
}) => {
  await signInAsCompetitor(page, contestId);
  await page.goto(`/contest/${slug}`);
  const editor = editorOf(page);
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.fill(TYPED);

  const context = page.context();
  await page.close();
  const fresh = await context.newPage();
  await fresh.goto(`/contest/${slug}`);
  await expect(editorOf(fresh)).toHaveValue(TYPED, { timeout: 30_000 });
});

test("with no draft, the editor opens on the code last submitted, and editing it is kept", async ({
  page,
}) => {
  const me = await signInAsCompetitor(page, contestId);
  await submittedEarlier(me);

  await page.goto(`/contest/${slug}`);
  const editor = editorOf(page);
  await expect(editor).toHaveValue(SUBMITTED, { timeout: 30_000 });

  // Edits are the draft from here on, and a reload keeps them over the submitted code.
  await editor.fill(`${SUBMITTED}# still working\n`);
  await page.reload();
  await expect(editorOf(page)).toHaveValue(`${SUBMITTED}# still working\n`, { timeout: 30_000 });
});

test("another student on the same browser sees neither the draft nor the submission", async ({
  page,
  playwright,
}) => {
  const first = await signInAsCompetitor(page, contestId);
  const firstSubmission = await submittedEarlier(first);
  await page.goto(`/contest/${slug}`);
  await expect(editorOf(page)).toHaveValue(SUBMITTED, { timeout: 30_000 });
  await editorOf(page).fill(TYPED);

  // Same browser, same localStorage, different student.
  await page.context().clearCookies();
  await signInAsCompetitor(page, contestId);
  await page.goto(`/contest/${slug}`);
  const editor = editorOf(page);
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await expect(editor).not.toHaveValue(TYPED);
  await expect(editor).not.toHaveValue(SUBMITTED);

  // And the source route answers the second student as if the submission did not exist.
  const cookies = await page.context().cookies();
  const api = await playwright.request.newContext({
    extraHTTPHeaders: { cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") },
  });
  const response = await api.get(`/api/submissions/${firstSubmission}/source`);
  expect(response.status()).toBe(404);
  expect(await response.text()).not.toContain("what I sent");
});
