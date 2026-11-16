import { expect, test, type Page } from "@playwright/test";

import { loadContestFixture, readSolution, seedE2EContest, testDb } from "./helpers/seed";
import { signInAsCompetitor } from "./helpers/session";

/**
 * Each problem tab shows ITS OWN submission's verdict.
 *
 * The contest stream carries every verdict a student gets. The tab used to take the first finished
 * frame it saw, whichever submission it belonged to, and then stop listening. Found on the
 * 4 vCPU droplet on 2026-11-16: with two submissions pending, 21 and 22 of 38 tabs showed another
 * submission's result, and 8 and 11 of those showed the wrong verdict.
 *
 * Two tabs on one problem, one wrong and one correct, submitted together. Whichever verdict lands
 * first, the old code painted it in both tabs, so one of them was always wrong.
 */

const JOIN_CODE = loadContestFixture().contest.joinCode;
const VERDICT_WORDS = /Accepted|Wrong answer|Too slow|Out of memory|Runtime error|Did not compile/;

async function openProblem(page: Page): Promise<void> {
  await page.goto("/contest");
  const firstProblem = page
    .getByRole("list", { name: "Problems" })
    .getByRole("listitem")
    .getByRole("link")
    .first();
  await expect(firstProblem).toBeVisible();
  await firstProblem.click();
  await page.waitForURL(/\/contest\/[^/]+$/);
}

async function submit(page: Page, source: string): Promise<void> {
  await page.getByRole("textbox", { name: /^Solution for / }).fill(source);
  await page.getByRole("button", { name: "Submit for judging" }).click();
}

function verdictChip(page: Page) {
  return page.getByRole("region", { name: "Verdict" }).locator("header").getByText(VERDICT_WORDS);
}

// Re-seeded so the fixture contest's window is open now, as the API specs do.
test.beforeAll(async () => {
  await seedE2EContest();
});

test("two tabs with submissions pending each show their own verdict", async ({ context }) => {
  test.setTimeout(180_000);
  const db = testDb();
  const contest = await db.contest.findFirst({ where: { joinCode: JOIN_CODE }, select: { id: true } });
  expect(contest, "the E2E fixture contest is missing").not.toBeNull();
  const target = await db.contestProblem.findFirst({
    where: { problem: { state: "PUBLISHED" }, contest: { joinCode: JOIN_CODE } },
    select: { divisionId: true, setId: true },
  });

  const wrongTab = await context.newPage();
  await signInAsCompetitor(wrongTab, contest?.id ?? "", {
    displayName: `E2E Two Tabs ${String(Date.now())}`,
    divisionId: target?.divisionId ?? null,
    chosenSetId: target?.setId ?? null,
  });
  const rightTab = await context.newPage();
  await openProblem(wrongTab);
  await openProblem(rightTab);

  await submit(wrongTab, readSolution("wrong-answer.py"));
  await submit(rightTab, readSolution("accepted.py"));

  await expect(verdictChip(wrongTab)).toBeVisible({ timeout: 120_000 });
  await expect(verdictChip(rightTab)).toBeVisible({ timeout: 120_000 });
  await expect(verdictChip(rightTab)).toHaveText("Accepted");
  await expect(verdictChip(wrongTab)).not.toHaveText("Accepted");
});
