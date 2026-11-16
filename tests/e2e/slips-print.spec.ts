import { expect, test, type Page } from "@playwright/test";

import { ContestApi, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7 — printing the join slips prints only the slips.
 *
 * The admin header, the breadcrumb, the contest title and the tab strip all came out on paper
 * above the first slip. Read under print media, as rendered text.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
const CONTEST_NAME = `E2E Slips Print ${String(Date.now())}`;
let contestId = "";

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
      name: CONTEST_NAME,
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
  await readOk(await admin.addNamedParticipantRaw({ displayName: "Slip Student" }));
});

test.afterAll(async () => {
  if (contestId !== "") {
    await testDb().contest.delete({ where: { id: contestId } }).catch(() => null);
  }
  await closeTestDb();
});

test("on paper, the slips page shows the slips and none of the console around them", async ({
  page,
}) => {
  await signInAsOrganizer(page);
  await page.goto(`/admin/contests/${contestId}/slips`);
  await expect(page.getByText("Slip Student").first()).toBeVisible({ timeout: 30_000 });

  // On screen the console is all there.
  await expect(page.getByRole("navigation", { name: "Contest sections" })).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expect(page.getByText("Slip Student").first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: CONTEST_NAME })).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Contest sections" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Open projector" })).toBeHidden();
  await expect(page.locator("[data-print-chrome]").first()).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeHidden();

  const printed = await page.locator("body").innerText();
  expect(printed).not.toContain("Open projector");
  expect(printed).not.toContain("Join code slips");
  expect(printed).not.toMatch(/^Contests$/m);
});

test("other admin pages keep their header when printed", async ({ page }) => {
  await signInAsOrganizer(page);
  await page.goto(`/admin/contests/${contestId}/teams`);
  await expect(page.getByRole("navigation", { name: "Contest sections" })).toBeVisible({
    timeout: 30_000,
  });
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("heading", { level: 1, name: CONTEST_NAME })).toBeVisible();
});
