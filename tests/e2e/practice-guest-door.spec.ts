import { expect, test } from "@playwright/test";

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

const NOTE =
  "Practice problems use the same editor and judge as the contest. They do not count for anything.";

test.beforeAll(async () => {
  const arena = await testDb().contest.findFirst({
    where: { isPractice: true, state: "RUNNING" },
    select: { id: true },
  });
  expect(arena, "no practice arena: run `npx tsx scripts/seed-practice.ts` first").not.toBeNull();
});

test.afterAll(async () => {
  await closeTestDb();
});

test("/join offers practice under the code form, and the button lands in the arena", async ({
  page,
}) => {
  await page.goto("/join");
  const button = page.getByRole("button", { name: "Try practice problems" });
  await expect(button).toBeVisible();
  await expect(page.getByText(NOTE)).toBeVisible();

  await button.click();
  await page.waitForURL("**/contest");

  await expect(page.locator("header").getByText("Practice", { exact: true })).toBeVisible();
  await expect(page.getByText("Two Tables, One Total").first()).toBeVisible();
});

test("the home page hero offers the same button beside the join code", async ({ page }) => {
  await page.goto("/");
  const join = page.getByRole("link", { name: "Enter your join code" }).last();
  const practice = page.getByRole("button", { name: "Try practice problems" });
  await expect(join).toBeVisible();
  await expect(practice).toBeVisible();
  await expect(page.getByText(NOTE)).toBeVisible();

  await practice.click();
  await page.waitForURL("**/contest");
  await expect(page.locator("header").getByText("Practice", { exact: true })).toBeVisible();
});
