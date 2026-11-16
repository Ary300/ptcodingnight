import { expect, test } from "@playwright/test";

import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7 — a bare /projector with nothing running says so, in a sentence, with no 404.
 *
 * It read "Open the projector with ?contestId=<id> not found" (a URL template with the error
 * class's suffix glued on) and logged a 404 on the one machine everybody can see.
 *
 * Nothing may be running for this to mean anything, so the spec parks every running contest for
 * its duration and puts each one back exactly as it was afterwards.
 */

test.describe.configure({ mode: "serial" });

let parked: { id: string; state: "RUNNING" | "FROZEN" }[] = [];

test.beforeAll(async () => {
  const running = await testDb().contest.findMany({
    where: { state: { in: ["RUNNING", "FROZEN"] }, isPractice: false },
    select: { id: true, state: true },
  });
  parked = running.map((row) => ({ id: row.id, state: row.state as "RUNNING" | "FROZEN" }));
  await testDb().contest.updateMany({
    where: { id: { in: parked.map((row) => row.id) } },
    data: { state: "ENDED" },
  });
});

test.afterAll(async () => {
  for (const row of parked) {
    await testDb().contest.update({ where: { id: row.id }, data: { state: row.state } });
  }
  await closeTestDb();
});

test("the API answers 'nothing running' as an empty 200, not a 404", async ({ request }) => {
  const response = await request.get("/api/team-standings");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ success: true, data: null, error: null });
});

test("the wall says no contest is running, and how to show one", async ({ page }) => {
  const failures: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 400) {
      failures.push(`${String(response.status())} ${response.url()}`);
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(message.text());
  });

  await page.goto("/projector");
  const status = page.getByRole("status");
  await expect(status).toHaveText(/^No contest is running right now\./, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Team standings");
  await expect(page.getByText("Waiting for a contest to open")).toBeVisible();

  const rendered = await page.locator("body").innerText();
  expect(rendered).not.toContain("not found");
  expect(rendered).not.toContain("contestId");
  expect(rendered).not.toContain("<id>");
  expect(failures).toEqual([]);
});
