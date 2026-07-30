import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, type Page } from "@playwright/test";

import { testDb } from "../../e2e/helpers/seed";

/**
 * Getting a browser to each surface G9 audits.
 *
 * The competitor screens are behind the join step, so every a11y spec that wants the lobby or a
 * problem page has to walk through it. Kept here rather than repeated so that a change to the
 * join flow breaks one file.
 */

/**
 * Read from the fixture rather than duplicated, because it already drifted once: this file said
 * `E2E-PANTHER` while `fixtures/e2e/contest.json` said `E2E-PANTHERS`, so every a11y spec behind the
 * join step silently reached an unjoined page and audited the wrong DOM.
 */
export const JOIN_CODE: string = (
  JSON.parse(
    readFileSync(path.resolve(__dirname, "..", "..", "..", "fixtures", "e2e", "contest.json"), "utf8"),
  ) as { contest: { joinCode: string } }
).contest.joinCode;
/**
 * Unique per call, because `Participant` is unique on `(contestId, displayName)`.
 *
 * A fixed name worked for exactly one test per seeded contest; the second join hit a CONFLICT and
 * the helper then waited forever for a navigation that was never going to happen. Which reads as a
 * mysterious page.goto timeout rather than as "that name is taken".
 */
let joinCounter = 0;
export function nextDisplayName(): string {
  joinCounter += 1;
  return `A11y Student ${Date.now()}-${joinCounter}`;
}

/**
 * The id of the contest the API considers to be running.
 *
 * Read from `/api/standings`, which is the un-scoped resolution the projector itself relies on,
 * rather than hardcoded — a fixture id changes on every reseed, and a spec pinned to a stale one
 * fails as "no data" long after the real cause has scrolled away.
 */
export async function runningContestId(page: Page): Promise<string> {
  const response = await page.request.get("/api/standings");
  expect(response.ok(), "no contest is running — seed the E2E contest first").toBe(true);

  const body = (await response.json()) as { data?: { contestId?: string } };
  const contestId = body.data?.contestId;
  expect(contestId, "/api/standings returned no contestId").toBeTruthy();

  return contestId ?? "";
}

export async function joinContest(page: Page): Promise<void> {
  await page.goto("/join");
  await page.getByLabel("Join code").fill(JOIN_CODE);
  await page.locator("form").getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Display name").fill(nextDisplayName());
  await page.getByRole("button", { name: "Join the contest" }).click();
  await page.waitForURL("**/contest");
}

/**
 * The participant id the browser is holding, from the tab-local record the join wrote.
 *
 * Read out of `sessionStorage` rather than the database, because "which participant is THIS page"
 * is a fact only the browser has — two a11y specs run concurrently against the same contest.
 */
async function joinedParticipantId(page: Page): Promise<string> {
  const raw = await page.evaluate(() => window.sessionStorage.getItem("ptcn.participant"));
  expect(raw, "the join did not record a participant").not.toBeNull();

  const parsed = JSON.parse(raw ?? "{}") as { participantId?: string };
  expect(parsed.participantId, "no participantId in the stored participant").toBeTruthy();

  return parsed.participantId ?? "";
}

/**
 * Give the joined participant a division and a problem set, then reload.
 *
 * **A precondition, not a workaround.** The join form sends `divisionId: null` because a division
 * is an organizer's assignment (PRD §61), while every problem in the E2E fixture carries one — so
 * a UI join legitimately sees an empty problem list, and every screen behind the lobby had nothing
 * on it to audit.
 *
 * G7 has exactly this helper for exactly this reason (`pinParticipantToProblemSet`): a spec about
 * something *other* than scoping has to state the scope it needs instead of depending on a coin
 * flip. Division and set visibility are G7's subject and are covered there; this suite's subject
 * is whether the rendered screen is accessible, which requires a screen with content on it.
 */
export async function placeInDivisionAndSet(page: Page): Promise<void> {
  const participantId = await joinedParticipantId(page);
  const db = testDb();

  const participant = await db.participant.findUniqueOrThrow({
    where: { id: participantId },
    select: { contestId: true },
  });

  // The set that actually holds a live problem, so the lobby has a row to render.
  const target = await db.contestProblem.findFirst({
    where: {
      contestId: participant.contestId,
      problem: { state: "PUBLISHED" },
    },
    select: { divisionId: true, setId: true },
  });

  expect(target, "the fixture has no PUBLISHED contest problem to audit against").not.toBeNull();

  await db.participant.update({
    where: { id: participantId },
    data: { divisionId: target?.divisionId ?? null, chosenSetId: target?.setId ?? null },
  });

  await page.reload();
}

/** The lobby, joined, with the problem list loaded. */
export async function openLobby(page: Page): Promise<void> {
  await joinContest(page);
  await placeInDivisionAndSet(page);
  await expect(page.getByRole("heading", { name: "Problems", level: 1 })).toBeVisible();
  await expect(page.getByRole("listitem").getByRole("link").first()).toBeVisible();
}

/** The first problem's workspace, with the editor mounted. */
export async function openProblem(page: Page): Promise<void> {
  await openLobby(page);
  await page.getByRole("listitem").getByRole("link").first().click();
  await page.waitForURL(/\/contest\/[^/]+$/);
  await expect(page.getByRole("textbox", { name: /^Solution for / })).toBeVisible();
}
