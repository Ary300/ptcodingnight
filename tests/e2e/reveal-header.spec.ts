import { expect, test, type Page } from "@playwright/test";

import { ContestApi, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7 — the reveal, pressed the way NIGHT.md §5 says: past the end, on a frozen board, from the
 * live console.
 *
 * Unfreezing a contest past its end ENDS it. The console re-read its own panel, but the state
 * pill above the tabs is server-rendered and was never refreshed, so on the walkthrough the
 * header still read "RUNNING. Live. Students are submitting now." beside the revealed final
 * board. The rendered header is what this reads.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
let contestId = "";

async function signInAsOrganizer(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.locator('input[name="signin-passcode"]').fill(ADMIN_PASSCODE);
  await page.getByRole("button", { name: /Open the organizer console/ }).click();
  await page.waitForURL(/\/admin/, { timeout: 60_000 });
}

test.beforeAll(async ({ playwright }) => {
  const admin = new ContestApi(await playwright.request.newContext(), "unused");
  await admin.adminLogin(ADMIN_PASSCODE);
  const created = await readOk(
    await admin.createContestRaw({
      name: `E2E Reveal Header ${String(Date.now())}`,
      startsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
      freezeAt: null,
      scoringPresetId: "classic",
      divisions: ["Open"],
    }),
  );
  contestId = (created.data as { contestId: string }).contestId;

  // The state the clock leaves at 8:15: the window is over and the board is still frozen.
  const now = Date.now();
  await testDb().contest.update({
    where: { id: contestId },
    data: {
      state: "RUNNING",
      startsAt: new Date(now - 75 * 60_000),
      endsAt: new Date(now - 60_000),
      freezeAt: new Date(now - 16 * 60_000),
    },
  });
});

test.afterAll(async () => {
  if (contestId !== "") {
    await testDb().contest.delete({ where: { id: contestId } }).catch(() => null);
  }
  await closeTestDb();
});

test("Unfreeze and reveal past the end shows the contest as ended without a reload", async ({
  page,
}) => {
  await signInAsOrganizer(page);
  await page.goto(`/admin/contests/${contestId}/console`);

  await page.getByRole("button", { name: "Unfreeze and reveal" }).click();
  await page.getByRole("button", { name: "Reveal the final board" }).click();

  await expect(page.getByText("Over. Standings are final.")).toBeVisible({ timeout: 15_000 });
  const header = await page.locator("main").innerText();
  expect(header).not.toContain("Students are submitting now");

  const row = await testDb().contest.findUniqueOrThrow({
    where: { id: contestId },
    select: { state: true },
  });
  expect(row.state).toBe("ENDED");
});
