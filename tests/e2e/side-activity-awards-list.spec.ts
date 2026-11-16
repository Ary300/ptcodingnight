import { expect, test, type Page } from "@playwright/test";

import { ContestApi, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7 — the side-activity awards list says who entered an award in words, and every button says
 * which award it acts on.
 *
 * The "By" column printed a raw session id ("Organizer …qf1638 , session admin:cmwj…"), and each
 * row's Edit and Remove were indistinguishable to a screen reader in a list of several. Read as
 * rendered text and as accessible names.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
let contestId = "";
let sessionTail = "";

async function signInAsOrganizer(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.locator('input[name="signin-passcode"]').fill(ADMIN_PASSCODE);
  await page.getByRole("button", { name: /Open the organizer console/ }).click();
  await page.waitForURL(/\/admin/, { timeout: 60_000 });
}

test.beforeAll(async ({ playwright }) => {
  const bootstrap = new ContestApi(await playwright.request.newContext(), "unused");
  await bootstrap.adminLogin(ADMIN_PASSCODE);
  const created = await readOk(
    await bootstrap.createContestRaw({
      name: `E2E Awards List ${String(Date.now())}`,
      startsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
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
  const team = await readOk(await admin.createTeamAsAdminRaw({ name: "Awardees", divisionId }));
  const teamId = (team.data as { teamId: string }).teamId;
  await readOk(await admin.addNamedParticipantRaw({ displayName: "Ava Award", teamId }));
  await readOk(await admin.addSideActivityRaw(teamId, { label: "Sudoku", points: 25 }));
  await readOk(await admin.addSideActivityRaw(teamId, { label: "Kahoot", points: 60 }));

  const stored = await testDb().teamSideActivity.findFirstOrThrow({
    where: { teamId },
    select: { enteredBy: true },
  });
  sessionTail = stored.enteredBy.slice(-6);
});

test.afterAll(async () => {
  if (contestId !== "") {
    await testDb().contest.delete({ where: { id: contestId } }).catch(() => null);
  }
  await closeTestDb();
});

test("the By column says Organizer and the time, and each button names its award", async ({
  page,
}) => {
  await signInAsOrganizer(page);
  await page.goto(`/admin/contests/${contestId}/side-activities`);

  const form = page.locator("form").first();
  const team = form.getByLabel(/^Team/).first();
  await expect(team).toBeVisible({ timeout: 30_000 });
  const native = await team.evaluate((element) => element.tagName === "SELECT");
  if (native) {
    await team.selectOption({ label: "Awardees (1 player)" });
  } else {
    await team.click();
    await page.getByRole("option", { name: /^Awardees/ }).click();
  }

  const table = page.getByRole("table", { name: /^Awards to Awardees/ });
  await expect(table).toBeVisible({ timeout: 30_000 });

  const rendered = await table.innerText();
  expect(rendered).toContain("Organizer");
  expect(rendered).not.toContain("session");
  expect(rendered).not.toContain("admin:");
  expect(rendered).not.toContain(sessionTail);
  // The By cell carries the entry time beside the role.
  const byCell = table.getByRole("row").nth(1).getByRole("cell").nth(3);
  expect(await byCell.innerText()).toMatch(/^Organizer\s+\d{1,2}:\d{2}\s?[AP]M$/);

  // Every Edit and Remove names its award, so two rows never share a button name.
  await expect(table.getByRole("button", { name: "Edit award: Sudoku, +25 points" })).toBeVisible();
  await expect(table.getByRole("button", { name: "Edit award: Kahoot, +60 points" })).toBeVisible();
  const remove = table.getByRole("button", { name: "Remove award: Sudoku, +25 points" });
  await expect(remove).toBeVisible();
  await expect(table.getByRole("button", { name: "Remove award: Kahoot, +60 points" })).toBeVisible();
  await expect(table.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);

  // Armed, the confirm button still says which award it removes.
  await remove.click();
  await expect(
    table.getByRole("button", { name: "Confirm removing award: Sudoku, +25 points" }),
  ).toBeFocused();
});
