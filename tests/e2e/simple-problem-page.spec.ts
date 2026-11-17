import { expect, test, type Locator, type Page } from "@playwright/test";

import { pauseLiveContests, restoreContests, type PausedContest } from "./helpers/live-contests";
import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7, in a browser: the student problem page the organizers asked to be kept plain.
 *
 * Four things, each read from what the page renders rather than from the component:
 *
 * - the "Coding Night" logo goes to the home page, not back to the problem list;
 * - a problem named by its slot label carries its title, "P1 (Two Tables, One Total)";
 * - the examples fold behind a chevron, by click and by keyboard, each closed until opened;
 * - no "Constraints" anywhere on the page.
 *
 * Runs as a practice guest on the arena's first warm-up, because that statement is real authored
 * content with a `## Constraints` section and two bold "Example N" titles under `## Example`.
 * Needs the arena (`npx tsx scripts/seed-practice.ts`). No judge is involved.
 */

test.describe.configure({ mode: "serial" });

const SLUG = "practice-two-sum";

let paused: PausedContest[] = [];
let slotLabel = "";
let title = "";

test.beforeAll(async () => {
  // Practice is closed while any real contest is live; the e2e database always has one.
  paused = await pauseLiveContests();
  const row = await testDb().contestProblem.findFirst({
    where: { problem: { slug: SLUG }, contest: { isPractice: true, state: "RUNNING" } },
    select: { slotLabel: true, problem: { select: { title: true } } },
  });
  expect(row, "no practice arena: run `npx tsx scripts/seed-practice.ts` first").not.toBeNull();
  slotLabel = row?.slotLabel ?? "";
  title = row?.problem.title ?? "";
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
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

function summaryOf(details: Locator): Locator {
  return details.locator(":scope > summary");
}

async function expectOpen(details: Locator, open: boolean): Promise<void> {
  if (open) await expect(details).toHaveAttribute("open", "");
  else await expect(details).not.toHaveAttribute("open", /.*/);
}

test("the logo and the Coding Night crumb go to the home page", async ({ page }) => {
  await openProblemAsGuest(page);

  const logo = page.getByRole("banner").getByRole("link", { name: "Coding Night home" });
  await expect(logo).toHaveAttribute("href", "/");
  await logo.click();
  await page.waitForURL((url) => url.pathname === "/");

  await page.goto("/contest");
  const crumb = page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Coding Night" });
  await expect(crumb).toHaveAttribute("href", "/");
});

test("the problem is named by its slot label with its title, and shows no constraints", async ({ page }) => {
  await openProblemAsGuest(page);

  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  const label = `${slotLabel} (${title})`;
  await expect(crumbs).toContainText(label);
  // The rendered string, not the JSX: the bare slot label is no longer a crumb of its own.
  const crumbText = await crumbs.innerText();
  expect(crumbText.split("\n").map((line) => line.trim())).not.toContain(slotLabel);

  await expect(page.getByRole("heading", { name: /constraints/i })).toHaveCount(0);
  const mainText = await page.locator("main").innerText();
  expect(mainText).not.toMatch(/constraints/i);
  // The section the constraints sat beside is still there.
  await expect(page.getByRole("heading", { name: "Output", exact: true })).toBeVisible();
});

test("examples fold, all closed at first, by click and by keyboard", async ({ page }) => {
  await openProblemAsGuest(page);

  const samples = page.locator("details[data-disclosure=example]");
  await expect(samples).toHaveCount(2);
  const first = samples.nth(0);
  const second = samples.nth(1);
  // Nothing opens by itself (organizers' request, 2026-11-16).
  await expectOpen(first, false);
  await expectOpen(second, false);
  await expect(second.getByRole("region", { name: "example 2 input" })).toBeHidden();

  // Click opens and closes.
  await summaryOf(second).click();
  await expectOpen(second, true);
  await expect(second.getByRole("region", { name: "example 2 input" })).toBeVisible();
  await summaryOf(second).click();
  await expectOpen(second, false);

  // Keyboard: reach the summary by Tab, Enter closes, Space reopens, and the ring is visible.
  // Tab from the summary and Shift+Tab back, because `:focus-visible` follows the last input
  // modality and the clicks above were a pointer.
  await summaryOf(first).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(summaryOf(first)).toBeFocused();
  const outline = await summaryOf(first).evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe("none");
  await page.keyboard.press("Enter");
  await expectOpen(first, true);
  await expect(first.getByRole("button", { name: "Copy example 1 input" })).toBeVisible();
  await page.keyboard.press("Space");
  await expectOpen(first, false);
});

test("the statement examples are the runnable examples, closed until opened by click or keyboard", async ({ page }) => {
  await openProblemAsGuest(page);

  const examples = page.locator("details[data-disclosure=example]");
  await expect(examples).toHaveCount(2);
  await expect(summaryOf(examples.nth(0))).toHaveText("Example 1");
  await expect(summaryOf(examples.nth(1))).toHaveText("Example 2");
  await expectOpen(examples.nth(0), false);
  await expectOpen(examples.nth(1), false);
  await expect(examples.nth(0).getByText("35 48")).toBeHidden();

  await summaryOf(examples.nth(0)).click();
  await expectOpen(examples.nth(0), true);
  await expect(examples.nth(0).getByText("35 48")).toBeVisible();
  await expectOpen(examples.nth(1), false);

  await summaryOf(examples.nth(1)).focus();
  await page.keyboard.press("Enter");
  await expectOpen(examples.nth(1), true);
  await expect(examples.nth(1).getByText("120 -15")).toBeVisible();
  await page.keyboard.press("Enter");
  await expectOpen(examples.nth(1), false);
});
