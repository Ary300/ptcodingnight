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

test("the lobby's standings card never makes the page scroll past its content", async ({ page }) => {
  /*
    The card is a height-capped scroller holding a table, and its rows carry screen-reader-only
    text. `.sr-only` is position: absolute, so without a positioned scroller its containing block
    was the page itself: a long board laid those spans out far below the card, and the page grew a
    screen or more of blank space under the footer. Found on the live practice arena, 2026-11-16.

    A test database has too few rows to overflow the card, so the rows are added here, in the
    browser, the way a full arena fills it. What is under test is the CSS containment.
  */
  await page.goto("/join");
  await page.getByRole("button", { name: "Practice" }).click();
  await page.waitForURL("**/contest");
  const table = page.locator("table").filter({ has: page.locator("caption") }).first();
  await expect(table).toBeVisible();

  const { scrollHeight, contentBottom } = await table.evaluate((element) => {
    const body = element.querySelector("tbody") ?? element;
    for (let index = 0; index < 80; index += 1) {
      const row = document.createElement("tr");
      row.innerHTML = `<td style="padding:12px">Guest ${String(index)}<span class="sr-only">, </span></td>`;
      body.appendChild(row);
    }
    const bottoms = [...document.body.children].map(
      (child) => child.getBoundingClientRect().bottom + window.scrollY,
    );
    return { scrollHeight: document.documentElement.scrollHeight, contentBottom: Math.max(...bottoms) };
  });
  expect(scrollHeight).toBeLessThanOrEqual(Math.ceil(contentBottom) + 2);
});
