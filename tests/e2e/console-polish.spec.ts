import { expect, test, type Page } from "@playwright/test";

import { ContestApi, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, liveProblem, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";
import { signInAsCompetitor } from "./helpers/session";

/**
 * G7 — three small things the walkthrough found on the organizer's screens.
 *
 * - An ENDED contest's console still offered "Freeze the public board", for a board that is final.
 * - An overridden submission looked exactly like a judged one, in the console and in the student's
 *   own My submissions.
 * - The Sets tab re-dealt its preview on every load before anything was built, so the deal code
 *   changed each time the tab was opened.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");

let seeded: SeededContest;
let admin: ContestApi;

async function signInAsOrganizer(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.locator('input[name="signin-passcode"]').fill(ADMIN_PASSCODE);
  await page.getByRole("button", { name: /Open the organizer console/ }).click();
  await page.waitForURL(/\/admin/, { timeout: 60_000 });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();
  admin = new ContestApi(await playwright.request.newContext(), seeded.contestId);
  await admin.adminLogin(ADMIN_PASSCODE);
});

test.afterAll(async () => {
  await closeTestDb();
});

test("an overridden submission is marked for the student and in the console", async ({
  page,
  browser,
}) => {
  const student = await signInAsCompetitor(page, seeded.contestId);
  const judgedAt = new Date(Date.now() - 60_000);
  // A judged submission nobody touched: it must carry no marker.
  await testDb().submission.create({
    data: {
      participantId: student.participantId,
      contestProblemId: liveProblem(seeded).contestProblemId,
      language: "PYTHON_312",
      sourceCode: "print('judged, left alone')\n",
      submittedAt: new Date(Date.now() - 120_000),
      verdict: "WA",
      score: 0,
      judgedAt,
      effectiveAt: judgedAt,
    },
    select: { id: true },
  });
  const overridden = await testDb().submission.create({
    data: {
      participantId: student.participantId,
      contestProblemId: liveProblem(seeded).contestProblemId,
      language: "PYTHON_312",
      sourceCode: "print('judged, then overridden')\n",
      submittedAt: new Date(Date.now() - 90_000),
      verdict: "WA",
      score: 0,
      judgedAt,
      effectiveAt: judgedAt,
    },
    select: { id: true },
  });
  const response = await readOk(
    await admin.overrideRaw({
      submissionId: overridden.id,
      verdict: "AC",
      score: liveProblem(seeded).basePoints,
      reason: "E2E: the checker rejected a correct trailing space",
    }),
  );
  expect(response.status).toBe(200);

  await page.goto("/submissions");
  // The page draws a table and a stacked list and shows one of them by width, so count the
  // visible markers: exactly one, for the overridden row and not for the plain one.
  const visibleMarkers = page.locator('[data-testid="overridden-marker"]:visible');
  await expect(visibleMarkers).toHaveCount(1, { timeout: 30_000 });

  const organizer = await browser.newPage();
  try {
    await signInAsOrganizer(organizer);
    await organizer.goto(`/admin/contests/${seeded.contestId}/console`);
    await expect(organizer.getByTestId("overridden-marker")).toHaveCount(1, { timeout: 30_000 });
  } finally {
    await organizer.close();
  }
});

test("an ENDED contest's console does not offer to freeze the board", async ({ page }) => {
  await signInAsOrganizer(page);
  await page.goto(`/admin/contests/${seeded.contestId}/console`);
  await expect(page.getByRole("button", { name: "Freeze the public board" })).toBeVisible({
    timeout: 30_000,
  });

  await readOk(await admin.setContestStateRaw(seeded.contestId, "ENDED", "E2E: end"));
  await page.reload();
  await expect(page.getByText("The contest has ended, so the final standings are public.", { exact: false })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "Freeze the public board" })).toHaveCount(0);
});

test("the Sets preview keeps its deal code across loads until Deal again", async ({ page }) => {
  const created = await readOk(
    await admin.createContestRaw({
      name: `E2E Sets Deal ${String(Date.now())}`,
      startsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
      freezeAt: null,
      scoringPresetId: "classic",
      divisions: [],
    }),
  );
  const contestId = (created.data as { contestId: string }).contestId;
  try {
    await signInAsOrganizer(page);
    await page.goto(`/admin/contests/${contestId}/sets`);
    const code = page.locator("p", { hasText: "Deal code:" }).locator("code");
    await expect(code).toBeVisible({ timeout: 30_000 });
    const first = await code.innerText();

    await page.reload();
    await expect(code).toBeVisible({ timeout: 30_000 });
    expect(await code.innerText(), "the preview re-dealt on reload").toBe(first);

    await page.getByRole("button", { name: "Deal again" }).click();
    await expect(code).not.toHaveText(first, { timeout: 30_000 });
    const second = await code.innerText();

    await page.reload();
    await expect(code).toBeVisible({ timeout: 30_000 });
    expect(await code.innerText(), "Deal again did not stick across a reload").toBe(second);
  } finally {
    await testDb().contest.delete({ where: { id: contestId } }).catch(() => null);
  }
});
