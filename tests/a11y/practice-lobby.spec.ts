import { expect, test } from "@playwright/test";

import { pauseLiveContests, restoreContests, type PausedContest } from "../e2e/helpers/live-contests";
import { closeTestDb } from "../e2e/helpers/seed";
import { auditPage } from "./helpers/audit";

/**
 * G9: the practice lobby a guest reaches through the Practice button.
 *
 * It has its own surfaces the contest lobby does not: the "Your practice" card (paper text and
 * thin progress bars on `--ink`, with a link whose focus ring has to show on the dark panel) and
 * the generated avatar in the header. Same bar as everywhere else: zero critical or serious.
 *
 * Practice is closed while a real contest is live, so the live contests are paused for the length
 * of this file, as the G7 practice specs do.
 */

let paused: PausedContest[] = [];

test.beforeAll(async () => {
  paused = await pauseLiveContests();
});

test.afterAll(async () => {
  await restoreContests(paused);
  await closeTestDb();
});

async function enterPractice(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/join");
  await page.getByRole("button", { name: "Practice" }).click();
  await page.waitForURL("**/contest");
  // Wait for the card, which arrives with the problem list; auditing before it reports a half page.
  await expect(page.getByRole("region", { name: "Your practice" })).toBeVisible();
}

test.describe("axe-core: the practice lobby", () => {
  test("the lobby with its progress card", async ({ page }) => {
    await enterPractice(page);
    await auditPage(page, "/contest (practice guest)");
  });

  test("with the account menu open", async ({ page }) => {
    await enterPractice(page);
    await page.getByRole("button", { name: /^Account: Guest/ }).click();
    await expect(page.getByRole("menu", { name: "Account" })).toBeVisible();
    await auditPage(page, "/contest (practice guest, account menu)");
  });

  test("at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await enterPractice(page);
    await auditPage(page, "/contest (practice guest, 360px)");
  });
});
