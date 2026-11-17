import { expect, test } from "@playwright/test";

import { ContestApi } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";
import { signInAsCompetitor } from "./helpers/session";

/**
 * G7 — /team says the board is frozen.
 *
 * During a freeze the problem list shows a post-freeze AC as "Solved, 200 pts" while the team
 * page, computed as of the freeze, shows 0 for it. /contest's standings card says the board is
 * frozen and why; /team said nothing, which reads as lost points.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");

let seeded: SeededContest;
let admin: ContestApi;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();
  admin = new ContestApi(await playwright.request.newContext(), seeded.contestId);
  await admin.adminLogin(ADMIN_PASSCODE);
});

test.afterAll(async () => {
  await admin?.freeze(false).catch(() => null);
  await closeTestDb();
});

test("the team page shows the frozen notice only while the board is frozen", async ({ page }) => {
  const ottersId = seeded.teamIds.get("otters") ?? "";
  expect(ottersId, "the fixture has no Otters team").not.toBe("");

  const session = await signInAsCompetitor(page, seeded.contestId, {
    divisionId: seeded.divisionIds.get("intermediate") ?? null,
  });
  await testDb().participant.update({
    where: { id: session.participantId },
    data: { teamId: ottersId },
  });

  await page.goto("/team");
  await expect(page.getByRole("heading", { name: "E2E Otters", level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("board-frozen-notice")).toHaveCount(0);

  await admin.freeze(true);
  await page.reload();
  const notice = page.getByTestId("board-frozen-notice");
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await expect(notice).toContainText("Board frozen");
  await expect(notice).toContainText(
    "Points scored after the freeze still count, and they appear at the reveal.",
  );
});
