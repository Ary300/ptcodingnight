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
 * G7 — End contest on a frozen board, pressed the way the organizer presses it.
 *
 * The walkthrough found that End then "End it now" on the Setup tab revealed the final board at
 * once, post-freeze points and all, and the console's "Unfreeze and reveal" plate disappeared. The
 * confirmation said nothing about it. This presses the same buttons: freeze, an AC after the
 * freeze, End from the Setup tab (whose confirmation must now say the board stays frozen), the
 * projector must still show the frozen board without the AC, and the console's reveal is what
 * finally puts the points on the wall.
 *
 * Requires the worker and Docker, like every judged spec.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
const VERDICT_BUDGET_MS = 120_000;

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
    displayName: "E2E End Frozen Student",
    divisionId: seeded.divisionIds.get("intermediate") ?? null,
  });
  await pinParticipantToProblemSet(joined.participantId, liveProblem(seeded).contestProblemId);
  await testDb().participant.update({ where: { id: joined.participantId }, data: { teamId: ottersId } });

  organizerApi = new ContestApi(await playwright.request.newContext(), seeded.contestId);
  await organizerApi.adminLogin(ADMIN_PASSCODE);
});

test.afterAll(async () => {
  await closeTestDb();
});

test("End on a frozen board keeps the wall frozen until Unfreeze and reveal", async ({ page }) => {
  test.setTimeout(VERDICT_BUDGET_MS + 150_000);
  expect(ottersId, "the fixture has no Otters team").not.toBe("");
  const live = liveProblem(seeded);

  await organizerApi.freeze(true);
  const created = await student.submit({
    contestProblemId: live.contestProblemId,
    language: "PYTHON_312",
    sourceCode: readSolution("accepted.py"),
  });
  expect((await waitForVerdict(student, created.submissionId, VERDICT_BUDGET_MS)).verdict).toBe("AC");

  await signInAsOrganizer(page);
  await page.goto(`/admin/contests/${seeded.contestId}/setup`);

  await page.getByRole("button", { name: "End contest" }).click();
  await expect(
    page.getByText(
      "Submissions close now. The board stays frozen until you press Unfreeze and reveal.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "End it now" }).click();

  await expect(page.getByTestId("closed-and-frozen")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "End contest" })).toHaveCount(0);
  const row = await testDb().contest.findUniqueOrThrow({
    where: { id: seeded.contestId },
    select: { state: true },
  });
  expect(row.state).toBe("FROZEN");

  // The wall, from the organizer's own browser: still the frozen board, and no post-freeze points.
  await page.goto(`/projector?contest=${seeded.contestId}`);
  await expect(page.getByText("Frozen standings", { exact: true })).toBeVisible({ timeout: 30_000 });
  const otters = page.locator(`tbody[data-flip-team="${ottersId}"][data-flip-part="row"]`);
  await expect(otters).toContainText("E2E Otters", { timeout: 30_000 });
  await expect(otters).not.toContainText(String(live.basePoints));

  // The console still offers the reveal, and the reveal ends the contest.
  await page.goto(`/admin/contests/${seeded.contestId}/console`);
  await page.getByRole("button", { name: "Unfreeze and reveal" }).click();
  await page.getByRole("button", { name: "Reveal the final board" }).click();
  await expect(page.getByRole("button", { name: "Unfreeze and reveal" })).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect
    .poll(
      async () =>
        (
          await testDb().contest.findUniqueOrThrow({
            where: { id: seeded.contestId },
            select: { state: true },
          })
        ).state,
    )
    .toBe("ENDED");

  await page.goto(`/projector?contest=${seeded.contestId}`);
  await expect(otters).toContainText(String(live.basePoints), { timeout: 30_000 });
  await expect(page.getByText("Frozen standings", { exact: true })).toHaveCount(0);
});
