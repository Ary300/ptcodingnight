import { expect, test, type Page } from "@playwright/test";

import { testDb } from "../e2e/helpers/seed";
import { signInAsCompetitor } from "../e2e/helpers/session";
import { auditPage } from "./helpers/audit";

/**
 * G9 — the per-player, per-problem panel on `/team`.
 *
 * `team-screens.spec.ts` audits level one of the team expander: the roster and the arithmetic.
 * This audits **level two**, which is a different DOM and a riskier one — it is dense, muted,
 * secondary text at `--text-xs`, which is exactly where a contrast mistake hides. DESIGN.md §7
 * puts the floor for ink on paper at 57%, so the panel's muted runs sit on `text-ink/60`.
 *
 * Level two only renders when the API entitled the viewer to it, and it entitles a competitor to
 * their OWN team only. `joinContest` leaves a student teamless — an organizer is the only thing
 * that puts anybody on a team — so this spec places them, the way the roster screen does, before
 * the control it is auditing can exist at all. Without that step the spec would pass by auditing a
 * panel that never opened, which is the worst outcome available here.
 */

/** See the note at the first use: the board arrives over a round trip on a shared dev server. */
const BOARD_TIMEOUT_MS = 45_000;

/**
 * Sign the page in as a member of a team that already has scored submissions, and open `/team`.
 *
 * Deliberately NOT `joinContest`. That helper resolves "the running contest" through
 * `/api/standings`, which answers with whichever contest started most recently — and on a machine
 * where anyone has created a second contest, that is a contest with no teams, so `/team` renders
 * no board and this spec would pass by auditing an empty page. The contest is chosen here by the
 * property the spec actually needs: it has a team, and that team has judged submissions.
 *
 * The placement is written through the database rather than the admin API for the same reason
 * `placeInDivisionAndSet` is: it is a precondition, not the thing under test. The admin route and
 * the entitlement itself are covered by `tests/e2e/team-player-detail.api.spec.ts` over real HTTP.
 */
async function openMyTeamAsATeamMember(page: Page): Promise<void> {
  const db = testDb();
  const now = new Date();

  const scoring = await db.participant.findFirst({
    where: {
      teamId: { not: null },
      submissions: { some: { verdict: { not: null } } },
      contest: { startsAt: { lte: now }, endsAt: { gt: now } },
    },
    select: { teamId: true, contestId: true },
    orderBy: { id: "asc" },
  });

  expect(
    scoring,
    "no running contest has a team with a judged submission — run `npx tsx scripts/seed-demo.ts`",
  ).not.toBeNull();
  if (scoring === null) throw new Error("unreachable");

  const session = await signInAsCompetitor(page, scoring.contestId, {
    displayName: `A11y Detail ${String(Date.now())}`,
  });

  await db.participant.update({
    where: { id: session.participantId },
    data: { teamId: scoring.teamId },
  });

  await page.goto("/team");
}

/**
 * Open the level-one roster on EVERY team.
 *
 * Not just the first: the viewer's own team is wherever it ranks, and the level-two control only
 * exists on their own rows. An earlier version clicked `.first()` and passed or failed depending on
 * whether the probe's team happened to be leading, which is a coin toss dressed as a test.
 *
 * The accessible name changes from "Show players" to "Hide players" once open, so the loop drains
 * the list rather than indexing into a set that is changing underneath it.
 */
async function expandEveryTeam(page: Page): Promise<void> {
  const closed = page.getByRole("button", { name: /^Show \d+ players? for .+$/ });
  for (let guard = 0; guard < 20; guard += 1) {
    if ((await closed.count()) === 0) return;
    await closed.first().click();
  }
}

test("my team, with a PLAYER expanded", async ({ page }) => {
  await openMyTeamAsATeamMember(page);

  // Wait for the BOARD, not the heading: the heading renders in every state, so checking it would
  // race the fetch and this spec would silently audit an empty page.
  //
  // The generous timeout is not a flake patch. `/team` renders its shell first and fetches the
  // board from a client effect, so "visible" here is gated on a round trip — and this suite shares
  // one dev server with whatever else is running on the machine. The default 15 s is a measurement
  // of the host, not of the page.
  await expect(page.getByRole("table", { name: /team standings/i })).toBeVisible({
    timeout: BOARD_TIMEOUT_MS,
  });

  await expandEveryTeam(page);

  // Level two: a player line that became a button because this viewer is entitled to it. The
  // roster lines that are NOT buttons are the ones on other teams, which is the point.
  const playerExpander = page.getByRole("button", { name: /problem by problem$/ }).first();
  await expect(
    playerExpander,
    "no player line offered a disclosure — either the placement did not take or the payload " +
      "withheld the breakdown from a student's own team",
  ).toBeVisible();

  await expect(playerExpander).toHaveAttribute("aria-expanded", "false");
  await playerExpander.click();
  await expect(playerExpander).toHaveAttribute("aria-expanded", "true");

  // The panel is per problem, labelled by slot and title.
  await expect(page.getByRole("list", { name: /problem by problem/ }).first()).toBeVisible();

  await auditPage(page, "/team (player breakdown expanded)");
});

test("opening the player panel makes the page no wider at 360px", async ({ page }) => {
  /*
    Students are on phones and horizontal DOCUMENT scroll is a DESIGN.md §7 defect. The panel is
    the densest thing on the screen and therefore the likeliest to push the page wide — which is
    why its problem lines wrap as phrases rather than sitting in a grid.

    The assertion is a DELTA rather than an absolute, deliberately. `/team` already overflows at
    360 before anything is expanded: `MyTeamView` puts the board in a flex column with no
    `min-w-0`, so a flex item's default `min-width: auto` lets the table's intrinsic width defeat
    the board's own `overflow-x-auto`. That defect is real, it is outside this change, and it is
    reported rather than fixed here. Asserting an absolute would make this spec fail for somebody
    else's bug, and asserting nothing would let the panel add a second one invisibly.
  */
  await page.setViewportSize({ width: 360, height: 780 });
  await openMyTeamAsATeamMember(page);

  await expect(page.getByRole("table", { name: /team standings/i })).toBeVisible({
    timeout: BOARD_TIMEOUT_MS,
  });
  await expandEveryTeam(page);

  const before = await page.evaluate(() => document.documentElement.scrollWidth);

  await page.getByRole("button", { name: /problem by problem$/ }).first().click();
  await expect(page.getByRole("list", { name: /problem by problem/ }).first()).toBeVisible();

  const after = await page.evaluate(() => document.documentElement.scrollWidth);

  expect(
    after,
    `opening the per-problem panel widened the document from ${String(before)}px to ` +
      `${String(after)}px on a 360px screen`,
  ).toBeLessThanOrEqual(before);
});
