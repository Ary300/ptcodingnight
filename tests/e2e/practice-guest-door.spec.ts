import { expect, test } from "@playwright/test";

import { pauseLiveContests, restoreContests, type PausedContest } from "./helpers/live-contests";
import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7, in a browser: a student with no slip finds the practice problems and lands in the arena.
 *
 * `practice-guest.api.spec.ts` proves the route. This proves a student can reach it by clicking:
 * the button is on `/join` under the code form and in the home page hero, pressing it lands on
 * `/contest`, and the PRACTICE chip says which contest this is. This project has shipped screens
 * that answered every action and performed none of them, and each one passed the API specs.
 *
 * Needs the arena: `npx tsx scripts/seed-practice.ts`.
 */


let paused: PausedContest[] = [];

test.beforeAll(async () => {
  // Practice is closed while any real contest is live; the e2e database always has one.
  paused = await pauseLiveContests();
  const arena = await testDb().contest.findFirst({
    where: { isPractice: true, state: "RUNNING" },
    select: { id: true },
  });
  expect(arena, "no practice arena: run `npx tsx scripts/seed-practice.ts` first").not.toBeNull();
});

test.afterAll(async () => {
  await restoreContests(paused);
  await closeTestDb();
});

test("/join offers Practice above the code form, and the button lands in the arena", async ({
  page,
}) => {
  await page.goto("/join");
  const button = page.getByRole("button", { name: "Practice" });
  await expect(button).toBeVisible();
  // Above the form, by the organizers' call: the button's top sits above the code field's.
  const buttonTop = (await button.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
  const fieldTop = (await page.getByLabel("Your join code").boundingBox())?.y ?? 0;
  expect(buttonTop).toBeLessThan(fieldTop);

  await button.click();
  await page.waitForURL("**/contest");

  await expect(page.locator("header").getByText("Practice", { exact: true })).toBeVisible();
  await expect(page.getByText("Two Tables, One Total").first()).toBeVisible();
});

test("the home page top bar offers Practice beside the join code", async ({ page }) => {
  await page.goto("/");
  const bar = page.getByRole("navigation", { name: "Site" });
  const join = bar.getByRole("link", { name: "Enter your join code" });
  const practice = bar.getByRole("button", { name: "Practice" });
  await expect(join).toBeVisible();
  await expect(practice).toBeVisible();

  await practice.click();
  await page.waitForURL("**/contest");
  await expect(page.locator("header").getByText("Practice", { exact: true })).toBeVisible();
});

/*
  The standings card's containment test used to live here, because the bug was found on the
  practice arena. The arena no longer shows standings (see practice-lobby.spec.ts), so the test
  moved to competitor-ui.spec.ts, where the card still renders in the contest lobby.
*/
