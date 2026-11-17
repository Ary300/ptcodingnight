import { expect, test, type Page } from "@playwright/test";

import { formatEventTime } from "@/lib/contest/event-time";

import { ContestApi, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";
import { signInAsCompetitor } from "./helpers/session";

/**
 * G7 — the organizers' decisions of 2026-11-17, from a student's chair.
 *
 * 1. The lobby shows the student's OWN team, one line per teammate, and nobody from another team.
 *    It used to show a ranked board of every individual in the contest.
 * 2. A frozen board says so in the same words on /contest, /standings, /team and the projector:
 *    "Board frozen at <time>" in Indiana time, and the sentence explaining it.
 * 3. After End on a frozen board the lobby says submissions are closed and the board stays frozen
 *    until the reveal; it says "final" only after the reveal.
 *
 * Nothing here is judged, so the spec does not need the worker.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
const EXPLANATION =
  "Rankings stopped updating so the final result is a surprise. Points scored after this are still counted and appear when the organizers reveal the final standings.";

const STAMP = String(Date.now());
const ME = `E2E Boards Me ${STAMP}`;
const TEAMMATE = `E2E Boards Teammate ${STAMP}`;
const RIVAL = `E2E Boards Rival ${STAMP}`;

let seeded: SeededContest;
let admin: ContestApi;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();
  admin = new ContestApi(await playwright.request.newContext(), seeded.contestId);
  await admin.adminLogin(ADMIN_PASSCODE);

  const intermediate = seeded.divisionIds.get("intermediate") ?? null;
  const ottersId = seeded.teamIds.get("otters") ?? null;
  const panthersId = seeded.teamIds.get("panthers") ?? null;
  expect(ottersId, "the fixture has no Otters team").not.toBeNull();
  expect(panthersId, "the fixture has no Panthers team").not.toBeNull();

  // The teammate and the rival never sign in; they only have to be on the roster.
  await testDb().participant.createMany({
    data: [
      { contestId: seeded.contestId, displayName: TEAMMATE, divisionId: intermediate, teamId: ottersId },
      { contestId: seeded.contestId, displayName: RIVAL, divisionId: intermediate, teamId: panthersId },
    ],
  });
});

test.afterAll(async () => {
  // The reveal ends the shared fixture contest; put it back for specs that join it unseeded.
  await seedE2EContest();
  await closeTestDb();
});

let signIns = 0;

/** A display name is unique within a contest, so every sign-in after the first gets a suffix. */
async function signInMe(page: Page): Promise<string> {
  signIns += 1;
  const me = await signInAsCompetitor(page, seeded.contestId, {
    displayName: signIns === 1 ? ME : `${ME} ${String(signIns)}`,
    divisionId: seeded.divisionIds.get("intermediate") ?? null,
  });
  await testDb().participant.update({
    where: { id: me.participantId },
    data: { teamId: seeded.teamIds.get("otters") ?? null },
  });
  return me.participantId;
}

async function freezeLabel(): Promise<string> {
  const contest = await testDb().contest.findUniqueOrThrow({
    where: { id: seeded.contestId },
    select: { freezeAt: true },
  });
  expect(contest.freezeAt, "a frozen contest has a freezeAt").not.toBeNull();
  return `Board frozen at ${formatEventTime(contest.freezeAt ?? new Date())}`;
}

test("the lobby shows my own team's players and nobody from another team", async ({ page }) => {
  await signInMe(page);
  await page.goto("/contest");

  const card = page.getByTestId("lobby-team-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByRole("heading", { name: "E2E Otters" })).toBeVisible();

  const rows = card.getByTestId("lobby-teammate");
  await expect(rows.filter({ hasText: ME })).toHaveCount(1);
  await expect(rows.filter({ hasText: TEAMMATE })).toHaveCount(1);
  // My row is the highlighted one, and it says so in words.
  await expect(rows.filter({ hasText: ME })).toHaveAttribute("data-you", "true");
  await expect(rows.filter({ hasText: TEAMMATE })).not.toHaveAttribute("data-you", "true");
  await expect(rows.filter({ hasText: ME })).toContainText("you");
  await expect(rows.filter({ hasText: ME })).toContainText("No submissions yet");

  // The rival is on another team, so their name appears nowhere on this screen.
  await expect(page.getByText(RIVAL)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Standings" })).toHaveCount(0);

  await card.getByRole("link", { name: "Full team standings" }).click();
  await expect(page).toHaveURL(/\/standings$/);
});

test("the individual board withholds every row from a signed-in student", async ({ page }) => {
  await signInMe(page);
  await page.goto("/contest");
  const body = await page.evaluate(async (contestId) => {
    const response = await fetch(`/api/contests/${contestId}/standings`);
    return (await response.json()) as { data: { divisions: { rows: unknown[] }[] } };
  }, seeded.contestId);
  expect(body.data.divisions.flatMap((division) => division.rows)).toEqual([]);

  // The projector's public read is unchanged: it still lists the rival.
  const wall = await admin.projectorStandings(true);
  expect(wall.divisions.flatMap((division) => division.rows).map((row) => row.displayName)).toContain(RIVAL);
});

test("a frozen board names the freeze time and explains it on every student screen", async ({ page }) => {
  await signInMe(page);
  await admin.freeze(true);
  const title = await freezeLabel();

  for (const path of ["/contest", "/standings", "/team"]) {
    await page.goto(path);
    const notice = page.getByTestId("board-frozen-notice");
    await expect(notice, path).toBeVisible({ timeout: 30_000 });
    await expect(notice.getByText(title, { exact: true }), path).toBeVisible();
    await expect(notice, path).toContainText(EXPLANATION);
    await expect(notice, path).not.toContainText("Submissions are closed.");
  }

  await page.goto(`/projector?contest=${seeded.contestId}`);
  await expect(page.getByTestId("frozen-plate-title")).toHaveText(title.toUpperCase(), {
    timeout: 30_000,
  });
  await expect(page.getByText(EXPLANATION)).toBeVisible();
});

test("after End on a frozen board the lobby says submissions are closed and frozen until the reveal", async ({
  page,
}) => {
  await signInMe(page);
  const title = await freezeLabel();
  // End, pressed the way the organizer presses it: submissions close and the board stays frozen.
  const ended = await readOk(
    await admin.setContestStateRaw(seeded.contestId, "ENDED", "E2E: end on a frozen board"),
  );
  expect(ended.status).toBe(200);
  expect(ended.data).toEqual({ state: "FROZEN", boardStaysFrozen: true });

  await page.goto("/contest");
  const line = page.getByTestId("ended-board-line");
  await expect(line).toBeVisible({ timeout: 30_000 });
  await expect(line).toHaveText(
    `The board froze at ${title.replace("Board frozen at ", "")} and stays frozen until the organizers reveal the final standings.`,
  );
  await expect(page.getByText("The standings beside this are final.")).toHaveCount(0);

  const notice = page.getByTestId("board-frozen-notice");
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await expect(notice).toContainText(title);
  // The board read is cached for a second on the server, so a page opened in that second can read
  // the window from before End; the next poll corrects it. Hence a poll's worth of patience.
  await expect(notice).toContainText("Submissions are closed.", { timeout: 30_000 });
  await expect(page.getByTestId("final-standings-notice")).toHaveCount(0);

  await page.goto("/standings");
  await expect(page.getByTestId("board-frozen-notice")).toContainText("Submissions are closed.", {
    timeout: 30_000,
  });

  await page.goto(`/projector?contest=${seeded.contestId}`);
  await expect(page.getByText(`Submissions are closed. ${EXPLANATION}`)).toBeVisible({
    timeout: 30_000,
  });
});

test("after the reveal the lobby says Final standings", async ({ page }) => {
  await signInMe(page);
  const revealed = await admin.freeze(false);
  expect(revealed.state).toBe("ENDED");

  await page.goto("/contest");
  await expect(page.getByTestId("final-standings-notice")).toHaveText("Final standings", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("ended-board-line")).toHaveText("These are the final standings.");
  await expect(page.getByTestId("board-frozen-notice")).toHaveCount(0);

  await page.goto("/team");
  await expect(page.getByTestId("final-standings-notice")).toBeVisible({ timeout: 30_000 });
});
