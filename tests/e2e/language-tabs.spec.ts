import { expect, test, type Page } from "@playwright/test";

import { languageTabs } from "./helpers/language";
import { pauseLiveContests, restoreContests, type PausedContest } from "./helpers/live-contests";
import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7, in a browser: the editor's language picker is a row of tabs.
 *
 * Java 21, Python 3, C++17 in that order; Java selected on a first visit; a click selects a tab
 * and puts that language's starter in the editor; a reload keeps the pick; the arrow keys move
 * between tabs. Read from the rendered page, never from the component.
 *
 * Runs as a practice guest on the arena's first warm-up, because it allows exactly those three
 * languages. Needs the arena (`npx tsx scripts/seed-practice.ts`). No judge is involved.
 */

test.describe.configure({ mode: "serial", timeout: 90_000 });

const SLUG = "practice-two-sum";

let paused: PausedContest[] = [];
let arenaId = "";

test.beforeAll(async () => {
  // Practice is closed while any real contest is live; the e2e database always has one.
  paused = await pauseLiveContests();
  const row = await testDb().contestProblem.findFirst({
    where: { problem: { slug: SLUG }, contest: { isPractice: true, state: "RUNNING" } },
    select: { contestId: true },
  });
  expect(row, "no practice arena: run `npx tsx scripts/seed-practice.ts` first").not.toBeNull();
  arenaId = row?.contestId ?? "";
});

test.afterAll(async () => {
  await restoreContests(paused);
  await closeTestDb();
});

async function openProblemAsGuest(page: Page): Promise<void> {
  await page.goto("/join");
  await page.getByRole("button", { name: "Practice" }).click();
  await page.waitForURL("**/contest");
  await page.goto(`/contest/${SLUG}`);
  await expect(languageTabs(page)).toBeVisible({ timeout: 30_000 });
}

/** The starter the server hands out for this problem in Python, as the editor should show it. */
async function pythonStarter(page: Page): Promise<string> {
  const response = await page.request.get(`/api/contests/${arenaId}/problems/${SLUG}`);
  expect(response.ok(), "the problem detail read failed").toBe(true);
  const body = (await response.json()) as {
    data: { starters?: { language: string; code: string }[] };
  };
  const starter = body.data.starters?.find((entry) => entry.language === "PYTHON_312")?.code;
  expect(starter, "the practice problem has no Python starter").toBeTruthy();
  return starter ?? "";
}

test("the tabs read Java 21, Python 3, C++17, with Java selected", async ({ page }) => {
  await openProblemAsGuest(page);
  const tabs = languageTabs(page).getByRole("tab");

  await expect(tabs).toHaveText(["Java 21", "Python 3", "C++17"]);
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "false");
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "false");
  // Roving tabindex: the selected tab is the one Tab stop in the row.
  await expect(tabs.nth(0)).toHaveAttribute("tabindex", "0");
  await expect(tabs.nth(1)).toHaveAttribute("tabindex", "-1");
});

test("clicking Python 3 selects it, shows the Python starter, and survives a reload", async ({ page }) => {
  await openProblemAsGuest(page);
  const starter = await pythonStarter(page);
  const editor = page.getByRole("textbox", { name: /^Solution for / });
  const python = languageTabs(page).getByRole("tab", { name: "Python 3", exact: true });

  await python.click();
  await expect(python).toHaveAttribute("aria-selected", "true");
  await expect(languageTabs(page).getByRole("tab", { name: "Java 21" })).toHaveAttribute("aria-selected", "false");
  await expect(editor).toHaveValue(starter);

  await page.reload();
  const after = languageTabs(page).getByRole("tab", { name: "Python 3", exact: true });
  await expect(after).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });
  await expect(page.getByRole("textbox", { name: /^Solution for / })).toHaveValue(starter);
});

test("the arrow keys, Home and End move between the tabs", async ({ page }) => {
  await openProblemAsGuest(page);
  const tabs = languageTabs(page).getByRole("tab");

  await tabs.nth(0).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(2)).toBeFocused();
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");

  // Wraps from the last tab to the first, and back.
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(0)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(tabs.nth(2)).toBeFocused();

  await page.keyboard.press("Home");
  await expect(tabs.nth(0)).toBeFocused();
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(tabs.nth(2)).toBeFocused();
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
});

test("the tab row never widens the page at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openProblemAsGuest(page);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "the page scrolls sideways at 320px").toBeLessThanOrEqual(0);
  // Reset keeps its seat on the right of the bar, inside the 320px, to the right of the tabs.
  const reset = await page.getByRole("button", { name: "Reset the editor to the starter template" }).boundingBox();
  const row = await languageTabs(page).boundingBox();
  expect(reset, "the reset button is not rendered").not.toBeNull();
  expect(row, "the tab row is not rendered").not.toBeNull();
  if (reset === null || row === null) return;
  expect(reset.x + reset.width).toBeLessThanOrEqual(320);
  expect(reset.x).toBeGreaterThanOrEqual(row.x + row.width);
});
