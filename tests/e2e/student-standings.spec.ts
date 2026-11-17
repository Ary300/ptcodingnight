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
import { signInAsCompetitor } from "./helpers/session";

/**
 * G7, in a browser: the team standings on a student's own laptop.
 *
 * On the night the students sit in different rooms, so each opens Standings from the top bar
 * and sees the board the projector shows. It must hold the freeze exactly as the wall does: an
 * AC after the freeze stays off this board, and the final standings appear only after the
 * organizer's "Unfreeze and reveal".
 *
 * Requires the worker and Docker, like every judged spec.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
// Above the 120 s the older judged specs use: on a shared host the queue wait alone has measured
// past two minutes, and the verdict still landed. This spec is about the board, not the judge.
const VERDICT_BUDGET_MS = 240_000;
const STUDENT = "E2E Standings Student";

let seeded: SeededContest;
let student: ContestApi;
let organizerApi: ContestApi;
let ottersId = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();
  ottersId = seeded.teamIds.get("otters") ?? "";
  student = new ContestApi(await playwright.request.newContext(), seeded.contestId);
  organizerApi = new ContestApi(await playwright.request.newContext(), seeded.contestId);
  await organizerApi.adminLogin(ADMIN_PASSCODE);
});

test.afterAll(async () => {
  // The reveal ends the shared fixture contest; put it back for specs that join it unseeded.
  await seedE2EContest();
  await closeTestDb();
});

async function signInStudent(page: Page): Promise<string> {
  const me = await signInAsCompetitor(page, seeded.contestId, {
    displayName: STUDENT,
    divisionId: seeded.divisionIds.get("intermediate") ?? null,
  });
  await pinParticipantToProblemSet(me.participantId, liveProblem(seeded).contestProblemId);
  // On a team BEFORE the freeze, so the frozen board already lists them with zero points.
  await testDb().participant.update({ where: { id: me.participantId }, data: { teamId: ottersId } });
  const cookies = await page.context().cookies();
  student.useSession(cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "));
  return me.participantId;
}

function teamRow(page: Page, teamId: string) {
  return page.locator(`tbody[data-flip-team="${teamId}"][data-flip-part="row"]`);
}

test("a student's Standings holds the freeze and shows the final board only after the reveal", async ({
  page,
}) => {
  test.setTimeout(VERDICT_BUDGET_MS + 150_000);
  expect(ottersId, "the fixture has no Otters team").not.toBe("");
  const live = liveProblem(seeded);
  await signInStudent(page);

  // --- from the top bar, every team on both division tabs ---------------------------------------
  await page.goto("/contest");
  await page
    .getByRole("navigation", { name: "Competitor" })
    .getByRole("link", { name: "Standings", exact: true })
    .click();
  await page.waitForURL("**/standings");
  await expect(page.getByRole("heading", { level: 1, name: "Standings" })).toBeVisible();
  await expect(page.getByTestId("standings-state")).toHaveText(/^Live standings/, {
    timeout: 30_000,
  });
  await expect(teamRow(page, ottersId)).toContainText("E2E Otters");
  await expect(page.getByText("E2E Panthers", { exact: true })).toBeVisible();
  const divisions = page.getByRole("tablist", { name: "Division standings" });
  await divisions.getByRole("tab", { name: "Advanced" }).click();
  await expect(page.getByText("E2E Cubs", { exact: true })).toBeVisible();
  await divisions.getByRole("tab", { name: "Intermediate" }).click();

  // Per-team expand, and Expand all / Collapse all.
  await page.getByRole("button", { name: "Expand all" }).click();
  await expect(page.getByText(STUDENT, { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Collapse all" }).click();

  // --- the organizer freezes; an AC lands after it ----------------------------------------------
  await organizerApi.freeze(true);
  await expect(page.getByTestId("board-frozen-notice")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Board frozen", { exact: true })).toBeVisible();
  await expect(page.getByTestId("standings-state")).toHaveText(/^Frozen standings, as of /);

  const created = await student.submit({
    contestProblemId: live.contestProblemId,
    language: "PYTHON_312",
    sourceCode: readSolution("accepted.py"),
  });
  expect((await waitForVerdict(student, created.submissionId, VERDICT_BUDGET_MS)).verdict).toBe("AC");

  // Positive control: the organizer's live board has the points, so a student board showing them
  // leaked through the freeze.
  const liveOtters = (await organizerApi.teamStandings()).teams.find((t) => t.teamId === ottersId);
  const publicOtters = (await organizerApi.projectorTeamStandings(true)).teams.find(
    (t) => t.teamId === ottersId,
  );
  expect(liveOtters).toBeDefined();
  expect(publicOtters).toBeDefined();
  const liveScore = (liveOtters?.score ?? 0).toFixed(2);
  const frozenScore = (publicOtters?.score ?? 0).toFixed(2);
  expect(liveScore).not.toBe(frozenScore);

  // Two polls, so a board that changed on its next fetch would have changed by now.
  await page.waitForTimeout(11_000);
  await expect(page.getByTestId("board-frozen-notice")).toBeVisible();
  await expect(teamRow(page, ottersId)).toContainText(frozenScore);
  await expect(teamRow(page, ottersId)).not.toContainText(liveScore);
  // A reload is not a way around it either.
  await page.reload();
  await expect(page.getByTestId("board-frozen-notice")).toBeVisible({ timeout: 30_000 });
  await expect(teamRow(page, ottersId)).not.toContainText(liveScore);

  // --- the window closes, and the organizer presses Unfreeze and reveal --------------------------
  await testDb().contest.update({
    where: { id: seeded.contestId },
    data: { endsAt: new Date(Date.now() - 1_000) },
  });
  await organizerApi.freeze(false);

  await expect(page.getByTestId("standings-state")).toHaveText("Final standings.", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("board-frozen-notice")).toHaveCount(0);
  await expect(teamRow(page, ottersId)).toContainText(liveScore);
});

test("the practice arena offers no Standings tab", async ({ page }) => {
  const arena = await testDb().contest.findFirst({
    where: { isPractice: true },
    select: { id: true },
  });
  test.skip(arena === null, "no practice arena: run scripts/seed-practice.ts");
  await signInAsCompetitor(page, arena?.id ?? "");
  await page.goto("/contest");
  const nav = page.getByRole("navigation", { name: "Competitor" });
  await expect(nav.getByRole("link", { name: "Problems" })).toBeVisible({ timeout: 30_000 });
  await expect(nav.getByRole("link", { name: "Standings", exact: true })).toHaveCount(0);
});
