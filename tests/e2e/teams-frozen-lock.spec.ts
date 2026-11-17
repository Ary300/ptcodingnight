import { expect, test, type Page } from "@playwright/test";

import { API_ROUTES } from "@/lib/schemas/api";

import { ContestApi, readEnvelope } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";

/**
 * G7 — moving a student while the board is frozen is locked, and the Teams page says so first.
 *
 * The refusal used to read "Unfreeze it before changing teams or roster membership", which on the
 * night tells the organizer to spoil the reveal to fix a seat, and it arrived only after the move
 * form was filled in. The page now says the move is locked before the form, the move buttons are
 * disabled with that sentence as their description, and the API's refusal says the same thing.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
const LOCKED = "Team moves and roster changes are locked while the public board is frozen";

let seeded: SeededContest;
let admin: ContestApi;

async function signInAsOrganizer(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.locator('input[name="signin-passcode"]').fill(ADMIN_PASSCODE);
  await page.getByRole("button", { name: /Open the organizer console/ }).click();
  await page.waitForURL(/\/admin/, { timeout: 60_000 });
}

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

test("a frozen board locks team moves on the Teams page and in the API", async ({ page }) => {
  await signInAsOrganizer(page);
  await page.goto(`/admin/contests/${seeded.contestId}/teams`);
  const firstMove = page.getByRole("button", { name: /move$/ }).first();
  await expect(firstMove).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByTestId("roster-locked-note")).toHaveCount(0);

  await admin.freeze(true);
  await page.reload();

  const note = page.getByTestId("roster-locked-note");
  await expect(note).toBeVisible({ timeout: 30_000 });
  await expect(note).toContainText(LOCKED);
  await expect(note).toContainText("Make them after the reveal.");
  await expect(note).not.toContainText(/unfreeze/i);

  await expect(firstMove).toBeDisabled();
  await expect(firstMove).toHaveAccessibleDescription(new RegExp(LOCKED));

  const member = await testDb().participant.findFirstOrThrow({
    where: { contestId: seeded.contestId, teamId: { not: null } },
    select: { id: true },
  });
  const refused = await readEnvelope(
    await page.request.post(API_ROUTES.adminMoveParticipant(seeded.contestId), {
      data: { participantId: member.id, teamId: null },
    }),
  );
  expect(refused.status).toBe(409);
  expect(refused.message ?? "").toContain(LOCKED);
  expect(refused.message ?? "").not.toMatch(/unfreeze/i);
});
