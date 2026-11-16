import { expect, test, type Page } from "@playwright/test";

import type { SetPlanResponse } from "@/lib/schemas/api";

import { ContestApi, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb } from "./helpers/seed";

/**
 * G7 — a team of FIVE, read off the screens an organizer uses, as rendered text.
 *
 * The night may field one team of five beside teams of two. Driving that roster found two things
 * no API test could see:
 *
 *  - The Teams tab printed "5/4, divisor 5" under the team and "max 4" over the list, which reads
 *    as an over-full team on a roster that is right. The cap only ever limited students joining
 *    by themselves, and that path no longer exists.
 *  - Puzzle points are typed per seat, so the side-activity screen has to offer all five seats,
 *    A to E, when the team of five is chosen.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
const NAMES = ["Ana Five", "Bo Five", "Cal Five", "Dee Five", "Eve Five"];

test.describe.configure({ mode: "serial" });

let contestId = "";

async function signInAsOrganizer(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.locator('input[name="signin-passcode"]').fill(ADMIN_PASSCODE);
  await page.getByRole("button", { name: /Open the organizer console/ }).click();
  await page.waitForURL(/\/admin/, { timeout: 60_000 });
}

test.beforeAll(async ({ playwright }) => {
  await seedE2EContest();
  const bootstrap = new ContestApi(await playwright.request.newContext(), "unused");
  await bootstrap.adminLogin(ADMIN_PASSCODE);
  const created = await readOk(
    await bootstrap.createContestRaw({
      name: `E2E Team Of Five ${String(Date.now())}`,
      startsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
      freezeAt: null,
      scoringPresetId: "classic",
      divisions: ["Open"],
    }),
  );
  contestId = (created.data as { contestId: string }).contestId;
  const admin = new ContestApi(await playwright.request.newContext(), contestId);
  await admin.adminLogin(ADMIN_PASSCODE);

  const roster = await readOk(await admin.rosterRaw());
  const divisionId = (roster.data as { divisions: { divisionId: string }[] }).divisions[0]
    ?.divisionId;
  const team = await readOk(await admin.createTeamAsAdminRaw({ name: "Fivefold", divisionId }));
  const teamId = (team.data as { teamId: string }).teamId;
  for (const name of NAMES) {
    await readOk(await admin.addNamedParticipantRaw({ displayName: name, teamId }));
  }

  const preview = await readOk(
    await admin.planSetsRaw({
      mode: "preview",
      composition: [{ difficulty: "E", count: 1 }],
      setCount: 5,
      seed: "e2e-team-of-five",
    }),
  );
  const plan = preview.data as SetPlanResponse;
  await readOk(
    await admin.planSetsRaw({
      mode: "apply",
      composition: plan.composition,
      setCount: plan.setCount,
      seed: plan.seed ?? undefined,
      poolVersion: plan.poolVersion,
    }),
  );
  await readOk(await admin.assignSetsRaw({}));
});

test.afterAll(async () => {
  if (contestId !== "") {
    await testDb().contest.delete({ where: { id: contestId } }).catch(() => null);
  }
  await closeTestDb();
});

test("the Teams tab shows a team of five as five members, not as over a cap", async ({ page }) => {
  await signInAsOrganizer(page);
  await page.goto(`/admin/contests/${contestId}/teams`);
  await expect(page.locator("main")).toContainText("divisor 5", { timeout: 30_000 });

  const rendered = await page.locator("main").innerText();
  expect(rendered).toContain("5 members, divisor 5");
  expect(rendered).not.toContain("5/4");
  expect(rendered).not.toMatch(/max \d/);
});

test("the side-activity screen offers all five seats, A to E, for the team of five", async ({
  page,
}) => {
  await signInAsOrganizer(page);
  await page.goto(`/admin/contests/${contestId}/side-activities`);

  const form = page.locator("form").first();
  await page.getByRole("button", { name: "Sudoku", exact: true }).click();

  // A fine pointer gets the listbox; a phone gets the native <select> (`useFinePointer`).
  const team = form.getByLabel(/^Team/).first();
  const native = await team.evaluate((element) => element.tagName === "SELECT");
  if (native) {
    await team.selectOption({ label: "Fivefold (5 players)" });
  } else {
    await team.click();
    await page.getByRole("option", { name: /^Fivefold \(5 players\)/ }).click();
  }

  const seat = form.getByLabel("Seat or student (optional)");
  let seats: string[];
  if (native) {
    seats = await seat.locator("option").allInnerTexts();
  } else {
    await seat.click();
    await expect(page.getByRole("option", { name: /Seat E,/ })).toBeVisible();
    seats = await page.getByRole("option").allInnerTexts();
  }
  const letters = seats
    .map((option) => /Seat ([A-E]),/.exec(option)?.[1])
    .filter((letter): letter is string => letter !== undefined)
    .sort();
  expect(letters).toEqual(["A", "B", "C", "D", "E"]);
});
