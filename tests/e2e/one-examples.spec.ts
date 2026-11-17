import { expect, test, type Locator, type Page } from "@playwright/test";

import { chooseLanguage } from "./helpers/language";
import { pauseLiveContests, restoreContests, type PausedContest } from "./helpers/live-contests";
import { closeTestDb } from "./helpers/seed";

/**
 * G7, in a browser: ONE Examples section, which is also what "Run examples" runs.
 *
 * The organizers found a statement "Example" section beside a "Samples" list redundant. On a
 * problem whose statement examples are all published samples, the page now shows a single
 * "Examples" heading; each Example N disclosure holds its input, expected output and the
 * statement's explanation, and a run marks each one passed or failed inside it.
 *
 * Runs as a practice guest on the arena's first warm-up, whose statement has two bold
 * "Example N" blocks that equal its two samples. Needs the arena (`scripts/seed-practice.ts`)
 * and a judge worker for the run.
 */

test.describe.configure({ mode: "serial" });

const SLUG = "practice-two-sum";

let paused: PausedContest[] = [];

test.beforeAll(async () => {
  paused = await pauseLiveContests();
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
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

function summaryOf(details: Locator): Locator {
  return details.locator(":scope > summary");
}

test("one Examples section, closed, with input, output and explanation in each example", async ({ page }) => {
  await openProblemAsGuest(page);

  // Exactly one examples heading, and no statement Example or Samples heading beside it.
  await expect(page.getByRole("heading", { name: /^(examples?|samples?)$/i })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Examples", exact: true, level: 2 })).toBeVisible();
  await expect(page.locator("details[data-disclosure=statement-example]")).toHaveCount(0);

  const examples = page.locator("details[data-disclosure=example]");
  await expect(examples).toHaveCount(2);
  for (const example of await examples.all()) {
    await expect(example).not.toHaveAttribute("open", /.*/);
  }

  const first = examples.nth(0);
  await summaryOf(first).click();
  await expect(first).toHaveAttribute("open", "");
  await expect(first.getByRole("region", { name: "example 1 input" })).toHaveText("35 48");
  await expect(first.getByRole("region", { name: "example 1 expected output" })).toHaveText("83");
  await expect(first.getByRole("heading", { name: "Explanation" })).toBeVisible();
  await expect(first).toContainText("The first table earned");
  await expect(first.getByRole("button", { name: "Copy example 1 input" })).toBeVisible();

  // The statement's prose survives; only its Example section moved.
  const mainText = await page.locator("main").innerText();
  expect(mainText.match(/The first table earned/g)?.length).toBe(1);
});

test("Run examples marks each example passed or failed inside its disclosure", async ({ page }) => {
  test.setTimeout(180_000);
  await openProblemAsGuest(page);

  await chooseLanguage(page, "Python 3");
  // Right for Example 1 (35 48 -> 83), wrong for Example 2 (120 -15 -> 105).
  await page
    .getByRole("textbox", { name: /^Solution for / })
    .fill("a, b = map(int, input().split())\nprint(83)\n");
  await page.getByRole("button", { name: "Run examples" }).click();

  const examples = page.locator("details[data-disclosure=example]");
  const first = examples.nth(0);
  const second = examples.nth(1);

  // Marked on the closed rows, so a student sees which failed without opening anything.
  await expect(summaryOf(first)).toContainText("Passed", { timeout: 150_000 });
  await expect(summaryOf(second)).toContainText("Wrong answer");
  await expect(first).not.toHaveAttribute("open", /.*/);
  await expect(second).not.toHaveAttribute("open", /.*/);

  // Inside: the pass, and the failing example's diff.
  await summaryOf(first).click();
  await expect(first.getByText(/^Passed in \d+ ms\.$/)).toBeVisible();
  await summaryOf(second).focus();
  await page.keyboard.press("Enter");
  await expect(second).toHaveAttribute("open", "");
  await expect(second.getByText(/^Wrong answer in \d+ ms\./)).toBeVisible();
  await expect(second.getByRole("region", { name: "Difference for example 2" })).toContainText("105");
});
