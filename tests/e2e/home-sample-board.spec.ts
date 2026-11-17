import { expect, test } from "@playwright/test";

import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7 — the homepage's sample board never calls itself live.
 *
 * While a real contest ran, the homepage showed "Team standings Live" above invented teams
 * (Panthers, Cubs, Night Owls), which tells a visitor those are the real leaders. The panel is an
 * example and says so; "Live" is reserved for real data. Read as rendered text.
 */

test.afterAll(async () => {
  await closeTestDb();
});

test("the sample board is labelled an example, not live, while a contest runs", async ({
  page,
}) => {
  // The condition the walkthrough saw: a real contest running at the same time.
  const running = await testDb().contest.count({ where: { state: { in: ["RUNNING", "FROZEN"] } } });
  expect(running, "seed a running contest (scripts/seed-demo.ts) before this spec").toBeGreaterThan(0);

  await page.goto("/");
  const table = page.getByRole("region", { name: "Sample team standings" });
  await expect(table).toBeVisible();

  // The panel is the table's parent card: header bar, caption, table.
  const panel = page.locator("div:has(> [aria-label='Sample team standings'])");
  const rendered = await panel.innerText();
  expect(rendered).toContain("Panthers");
  expect(rendered).toMatch(/^Team standings\s+Example/);
  expect(rendered).not.toMatch(/\bLive\b/);
  expect(rendered).toContain("Sample standings.");
});

test("the homepage states the night as the organizers set it: five a team, a puzzle each, a freeze", async ({
  page,
}) => {
  await page.goto("/");
  const rendered = await page.locator("body").innerText();
  expect(rendered).toContain(
    "the standings on the projector update live until the last fifteen minutes, when the board freezes.",
  );
  expect(rendered).toContain("Teams have up to five students");
  expect(rendered).toContain("each team member also receives one puzzle");
  expect(rendered).not.toContain("throughout the contest");
});
