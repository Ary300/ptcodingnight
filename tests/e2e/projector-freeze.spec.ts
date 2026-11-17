import { expect, test, type Page } from "@playwright/test";

import { ContestApi, waitForVerdict } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import {
  closeTestDb,
  liveProblem,
  pinParticipantToProblemSet,
  readSolution,
  seedE2EContest,
  testDb,
  type SeededContest,
} from "./helpers/seed";

/**
 * G7 — the projector on the ORGANIZER laptop keeps the frozen board in front of the room.
 *
 * The wall is opened in the same browser the organizer signed in with, so its polls carry the
 * organizer cookie. It used to receive the live board, and an accepted submission after the freeze
 * showed up on the wall within one poll. This drives it the way the night does: sign in as the
 * organizer, freeze, a student gets AC, and the wall must not move.
 *
 * Requires the worker and Docker, like every judged spec.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
const VERDICT_BUDGET_MS = 120_000;
const STUDENT = "E2E Wall Freeze Student";

let seeded: SeededContest;
let student: ContestApi;
let organizerApi: ContestApi;
let ottersId = "";

async function signInAsOrganizer(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.locator('input[name="signin-passcode"]').fill(ADMIN_PASSCODE);
  await page.getByRole("button", { name: /Open the organizer console/ }).click();
  await page.waitForURL(/\/admin/, { timeout: 60_000 });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();
  ottersId = seeded.teamIds.get("otters") ?? "";

  student = new ContestApi(await playwright.request.newContext(), seeded.contestId);
  const joined = await student.signIn({
    displayName: STUDENT,
    divisionId: seeded.divisionIds.get("intermediate") ?? null,
  });
  await pinParticipantToProblemSet(joined.participantId, liveProblem(seeded).contestProblemId);
  // On a team BEFORE the freeze, so the frozen board already lists them with zero points.
  await testDb().participant.update({ where: { id: joined.participantId }, data: { teamId: ottersId } });

  organizerApi = new ContestApi(await playwright.request.newContext(), seeded.contestId);
  await organizerApi.adminLogin(ADMIN_PASSCODE);
});

test.afterAll(async () => {
  await organizerApi?.freeze(false).catch(() => null);
  await closeTestDb();
});

test("an AC after the freeze does not reach the wall on the organizer's laptop", async ({ page }) => {
  test.setTimeout(VERDICT_BUDGET_MS + 90_000);
  expect(ottersId, "the fixture has no Otters team").not.toBe("");

  await signInAsOrganizer(page);

  // Frozen from the organizer's own browser session, the way the console does it.
  const frozen = await page.request.post(`/api/admin/contests/${seeded.contestId}/freeze`, {
    data: { frozen: true },
  });
  expect(frozen.status()).toBe(200);

  const live = liveProblem(seeded);
  const created = await student.submit({
    contestProblemId: live.contestProblemId,
    language: "PYTHON_312",
    sourceCode: readSolution("accepted.py"),
  });
  const judged = await waitForVerdict(student, created.submissionId, VERDICT_BUDGET_MS);
  expect(judged.verdict).toBe("AC");

  // Positive control: the organizer's own board has the points, so a wall that shows them leaked.
  const organizerBoard = await organizerApi.teamStandings();
  const liveOtters = organizerBoard.teams.find((team) => team.teamId === ottersId);
  expect(liveOtters?.score).toBe(live.basePoints);

  await page.goto(`/projector?contest=${seeded.contestId}`);
  await expect(page.getByText("Frozen standings", { exact: true })).toBeVisible({ timeout: 30_000 });

  const row = page.locator(`tbody[data-flip-team="${ottersId}"][data-flip-part="row"]`);
  await expect(row).toContainText("E2E Otters", { timeout: 30_000 });

  // Two polls, so a board that changed on its next fetch would have changed by now.
  await page.waitForTimeout(11_000);
  await expect(page.getByText("Frozen standings", { exact: true })).toBeVisible();
  await expect(row).not.toContainText(String(live.basePoints));
});
