import { expect, test, type Page } from "@playwright/test";

import { requiredEnv } from "./helpers/env";
import {
  closeTestDb,
  draftProblem,
  seedE2EContest,
  testDb,
  type SeededContest,
} from "./helpers/seed";

/**
 * G7 — Open now asks first, like End, Freeze and Reopen.
 *
 * Open now moves the whole window to the instant of the press, so a stray click at 6:58 closes
 * submissions at 8:13. It was the one lifecycle press with no confirmation. It now arms, says what
 * it will do with the window's length, cancels on Escape, and opens only on the second press.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
const WINDOW_MINUTES = 75;

let seeded: SeededContest;

async function signInAsOrganizer(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.locator('input[name="signin-passcode"]').fill(ADMIN_PASSCODE);
  await page.getByRole("button", { name: /Open the organizer console/ }).click();
  await page.waitForURL(/\/admin/, { timeout: 60_000 });
}

async function stateOf(contestId: string): Promise<string> {
  const row = await testDb().contest.findUniqueOrThrow({
    where: { id: contestId },
    select: { state: true },
  });
  return row.state;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  seeded = await seedE2EContest();
  // The fixture carries a DRAFT question on purpose, and the API refuses to open a contest with
  // one. This spec is about the confirmation, so the line-up is made openable.
  await testDb().contestProblem.delete({ where: { id: draftProblem(seeded).contestProblemId } });
  const startsAt = new Date(Date.now() + 60 * 60_000);
  await testDb().contest.update({
    where: { id: seeded.contestId },
    data: {
      state: "SCHEDULED",
      startsAt,
      endsAt: new Date(startsAt.getTime() + WINDOW_MINUTES * 60_000),
      freezeAt: null,
    },
  });
});

test.afterAll(async () => {
  // This file reschedules the shared fixture contest; put it back for specs that join it unseeded.
  await seedE2EContest();
  await closeTestDb();
});

test("Open now confirms with the window length, and Escape cancels", async ({ page }) => {
  await signInAsOrganizer(page);
  const stateRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/state")) {
      stateRequests.push(request.url());
    }
  });
  await page.goto(`/admin/contests/${seeded.contestId}/setup`);

  await page.getByRole("button", { name: "Open now" }).click();
  await expect(
    page.getByText(`The contest starts now and ends in ${String(WINDOW_MINUTES)} minutes.`, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Press Escape to cancel." })).toHaveText(
    `Open now. The contest starts now and ends in ${String(WINDOW_MINUTES)} minutes. Press Escape to cancel.`,
  );
  expect(await stateOf(seeded.contestId), "one press opened it").toBe("SCHEDULED");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Cancel" })).toHaveCount(0);
  expect(await stateOf(seeded.contestId)).toBe("SCHEDULED");

  // The second press is what sends it. Whether the API then opens this fixture is the start
  // gate's business (its roster has players with no set), not this confirmation's.
  expect(stateRequests, "the first press or Escape sent a state change").toEqual([]);
  await page.getByRole("button", { name: "Open now" }).click();
  const sent = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().endsWith(`/api/admin/contests/${seeded.contestId}/state`),
  );
  await page.getByRole("button", { name: "Open now" }).click();
  expect((await sent).postDataJSON()).toMatchObject({ state: "RUNNING" });
});
