import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, type Page } from "@playwright/test";

/**
 * Getting a browser to each surface G9 audits.
 *
 * The competitor screens are behind the join step, so every a11y spec that wants the lobby or a
 * problem page has to walk through it. Kept here rather than repeated so that a change to the
 * join flow breaks one file.
 */

/**
 * Read from the fixture rather than duplicated, because it already drifted once: this file said
 * `E2E-PANTHER` while `fixtures/e2e/contest.json` said `E2E-PANTHERS`, so every a11y spec behind the
 * join step silently reached an unjoined page and audited the wrong DOM.
 */
export const JOIN_CODE: string = (
  JSON.parse(
    readFileSync(path.resolve(__dirname, "..", "..", "..", "fixtures", "e2e", "contest.json"), "utf8"),
  ) as { contest: { joinCode: string } }
).contest.joinCode;
/**
 * Unique per call, because `Participant` is unique on `(contestId, displayName)`.
 *
 * A fixed name worked for exactly one test per seeded contest; the second join hit a CONFLICT and
 * the helper then waited forever for a navigation that was never going to happen. Which reads as a
 * mysterious page.goto timeout rather than as "that name is taken".
 */
let joinCounter = 0;
export function nextDisplayName(): string {
  joinCounter += 1;
  return `A11y Student ${Date.now()}-${joinCounter}`;
}

export async function joinContest(page: Page): Promise<void> {
  await page.goto("/join");
  await page.getByLabel("Join code").fill(JOIN_CODE);
  await page.locator("form").getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Display name").fill(nextDisplayName());
  await page.getByRole("button", { name: "Join the contest" }).click();
  await page.waitForURL("**/contest");
}

/** The lobby, joined, with the problem list loaded. */
export async function openLobby(page: Page): Promise<void> {
  await joinContest(page);
  await expect(page.getByRole("heading", { name: "Problems", level: 1 })).toBeVisible();
  await expect(page.getByRole("listitem").getByRole("link").first()).toBeVisible();
}

/** The first problem's workspace, with the editor mounted. */
export async function openProblem(page: Page): Promise<void> {
  await openLobby(page);
  await page.getByRole("listitem").getByRole("link").first().click();
  await page.waitForURL(/\/contest\/[^/]+$/);
  await expect(page.getByRole("textbox", { name: /^Solution for / })).toBeVisible();
}
