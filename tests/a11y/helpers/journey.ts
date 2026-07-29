import { expect, type Page } from "@playwright/test";

/**
 * Getting a browser to each surface G9 audits.
 *
 * The competitor screens are behind the join step, so every a11y spec that wants the lobby or a
 * problem page has to walk through it. Kept here rather than repeated so that a change to the
 * join flow breaks one file.
 */

export const JOIN_CODE = "E2E-PANTHER";
export const DISPLAY_NAME = "A11y Student";

export async function joinContest(page: Page): Promise<void> {
  await page.goto("/join");
  await page.getByLabel("Join code").fill(JOIN_CODE);
  await page.locator("form").getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Display name").fill(DISPLAY_NAME);
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
