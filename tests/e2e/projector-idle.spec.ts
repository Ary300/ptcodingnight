import { expect, test } from "@playwright/test";

import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7 — a bare /projector with nothing running says so, in a sentence, with no 404.
 *
 * It read "Open the projector with ?contestId=<id> not found" (a URL template with the error
 * class's suffix glued on) and logged a 404 on the one machine everybody can see.
 *
 * Nothing may have run for this to mean anything, since a finished contest is shown after its end,
 * so the spec parks every running, frozen and ended contest as ARCHIVED for its duration and puts
 * each one back exactly as it was afterwards.
 */

test.describe.configure({ mode: "serial" });

type Parked = "RUNNING" | "FROZEN" | "ENDED";
let parked: { id: string; state: Parked }[] = [];

test.beforeAll(async () => {
  const running = await testDb().contest.findMany({
    where: { state: { in: ["RUNNING", "FROZEN", "ENDED"] }, isPractice: false },
    select: { id: true, state: true },
  });
  parked = running.map((row) => ({ id: row.id, state: row.state as Parked }));
  await testDb().contest.updateMany({
    where: { id: { in: parked.map((row) => row.id) } },
    data: { state: "ARCHIVED" },
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

test("the individual board's 'nothing running' 404 is a sentence, not a URL template", async ({
  request,
}) => {
  const response = await request.get("/api/standings");
  expect(response.status()).toBe(404);
  const body = (await response.json()) as { error: { message: string } };
  expect(body.error.message).toBe(
    "No contest is running right now. Open the projector from a contest to show its board.",
  );
  expect(body.error.message).not.toContain("<id>");
  expect(body.error.message).not.toContain("not found");
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

test("once a contest has ended, the bare boards show its final standings instead of nothing", async ({
  request,
}) => {
  const now = Date.now();
  const ended = await testDb().contest.create({
    data: {
      name: `Ended wall ${String(now)}`,
      joinCode: `ended-wall-${String(now)}`,
      state: "ENDED",
      startsAt: new Date(now - 90 * 60_000),
      endsAt: new Date(now - 5 * 60_000),
    },
    select: { id: true },
  });
  try {
    const team = await request.get("/api/team-standings");
    expect(team.status()).toBe(200);
    const teamBody = (await team.json()) as { data: { contestId: string; frozen: boolean } };
    expect(teamBody.data.contestId).toBe(ended.id);
    expect(teamBody.data.frozen).toBe(false);

    const individual = await request.get("/api/standings");
    expect(individual.status()).toBe(200);
  } finally {
    await testDb().contest.delete({ where: { id: ended.id } });
  }
});
