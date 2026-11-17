import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { ContestApi, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7 — every team on the board, and a breakdown that never covers its neighbours.
 *
 * The organizers reported three things on the team boards: the projector showed "top 7 of N" and
 * dropped teams to pay for an open breakdown, an open breakdown was drawn over the teams around
 * it, and there was no way to open or close every team at once. Fixture: two divisions, FIFTEEN
 * teams, twelve of them in Intermediate (one a team of five) and three in Advanced.
 *
 * The overlap check measures the very first frame after the click as well as the settled one,
 * because the reported overlap was a slide: rows were snapped up over the new panel and travelled
 * down across it, which a settled-only measurement never sees.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
const FIVE = ["Ana Five", "Bo Five", "Cal Five", "Dee Five", "Eve Five"];
const INTERMEDIATE_TEAMS = 12;
const ADVANCED_TEAMS = 3;
const SHOTS_DIR = join(process.cwd(), ".judge-tmp", "board");

test.describe.configure({ mode: "serial" });

let contestId = "";

test.beforeAll(async ({ playwright }) => {
  const bootstrap = new ContestApi(await playwright.request.newContext(), "unused");
  await bootstrap.adminLogin(ADMIN_PASSCODE);
  const created = await readOk(
    await bootstrap.createContestRaw({
      name: `E2E Board Expand All ${String(Date.now())}`,
      startsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
      freezeAt: null,
      scoringPresetId: "classic",
      divisions: ["Intermediate", "Advanced"],
    }),
  );
  contestId = (created.data as { contestId: string }).contestId;
  const admin = new ContestApi(await playwright.request.newContext(), contestId);
  await admin.adminLogin(ADMIN_PASSCODE);

  const roster = await readOk(await admin.rosterRaw());
  const divisions = (roster.data as { divisions: { divisionId: string; name: string }[] })
    .divisions;
  const idOf = (name: string): string => {
    const found = divisions.find((division) => division.name === name);
    if (found === undefined) throw new Error(`no division ${name}`);
    return found.divisionId;
  };

  const addTeam = async (name: string, divisionId: string, players: readonly string[]) => {
    const team = await readOk(await admin.createTeamAsAdminRaw({ name, divisionId }));
    const teamId = (team.data as { teamId: string }).teamId;
    for (const displayName of players) {
      await readOk(await admin.addNamedParticipantRaw({ displayName, teamId }));
    }
  };

  await addTeam("Fivefold", idOf("Intermediate"), FIVE);
  for (let index = 2; index <= INTERMEDIATE_TEAMS; index += 1) {
    const size = 2 + (index % 3);
    await addTeam(
      `Inter ${String(index)}`,
      idOf("Intermediate"),
      Array.from({ length: size }, (_, at) => `I${String(index)} Player ${String(at + 1)}`),
    );
  }
  for (let index = 1; index <= ADVANCED_TEAMS; index += 1) {
    await addTeam(`Upper ${String(index)}`, idOf("Advanced"), [
      `U${String(index)} One`,
      `U${String(index)} Two`,
    ]);
  }

  const now = Date.now();
  await testDb().contest.update({
    where: { id: contestId },
    data: {
      state: "RUNNING",
      startsAt: new Date(now - 10 * 60_000),
      endsAt: new Date(now + 65 * 60_000),
    },
  });
});

test.afterAll(async () => {
  if (contestId !== "") {
    await testDb().contest.delete({ where: { id: contestId } }).catch(() => null);
  }
  await closeTestDb();
});

interface Overlap {
  readonly team: string;
  readonly panelBottom: number;
  readonly nextTop: number;
}

/**
 * Every OPEN breakdown against the next team's row, and against its own team row above it.
 * Rects include transforms, so a row mid-slide over a panel is caught.
 */
async function overlaps(page: Page): Promise<Overlap[]> {
  return page.evaluate(() => {
    const rows = [
      ...document.querySelectorAll<HTMLElement>('tbody[data-flip-part="row"]'),
    ];
    const found: { team: string; panelBottom: number; nextTop: number }[] = [];
    rows.forEach((row, index) => {
      const teamId = row.dataset.flipTeam ?? "";
      const panel = document.getElementById(`team-roster-${teamId}`);
      if (panel === null || panel.getAttribute("aria-hidden") === "true") return;
      const panelRect = panel.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      if (panelRect.top < rowRect.bottom - 1) {
        found.push({ team: teamId, panelBottom: rowRect.bottom, nextTop: panelRect.top });
      }
      const next = rows[index + 1];
      if (next === undefined) return;
      const nextRect = next.getBoundingClientRect();
      if (panelRect.bottom > nextRect.top + 1) {
        found.push({ team: teamId, panelBottom: panelRect.bottom, nextTop: nextRect.top });
      }
    });
    return found;
  });
}

/** Clicks a disclosure and measures in the same task, before any slide could finish. */
async function clickAndMeasureFirstFrame(page: Page, label: RegExp): Promise<Overlap[]> {
  const button = page.getByRole("button", { name: label });
  await button.scrollIntoViewIfNeeded();
  await button.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  return overlaps(page);
}

async function disclosureStates(page: Page): Promise<string[]> {
  return page
    .locator("tbody[data-flip-part='row'] button[aria-expanded]")
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-expanded") ?? ""));
}

async function signInAsOrganizer(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.locator('input[name="signin-passcode"]').fill(ADMIN_PASSCODE);
  await page.getByRole("button", { name: /Open the organizer console/ }).click();
  await page.waitForURL(/\/admin/, { timeout: 60_000 });
}

test.describe("the projector", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const roster = await testDb().division.findFirst({
      where: { contestId, name: "Intermediate" },
    });
    await page.goto(`/projector?contest=${contestId}&division=${roster?.id ?? ""}`);
    await expect(page.getByRole("table")).toBeVisible({ timeout: 30_000 });
  });

  test("draws all twelve teams with no cap, each reachable by scrolling", async ({ page }) => {
    await expect(page.locator("tbody[data-flip-part='row']")).toHaveCount(INTERMEDIATE_TEAMS);
    await expect(page.getByText(/Showing top|more teams|fewer teams fit/)).toHaveCount(0);
    await expect(page.getByText(`${String(INTERMEDIATE_TEAMS)} teams`)).toBeVisible();

    const last = page.locator("tbody[data-flip-part='row']").last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    // The header row stays on screen while the board is scrolled to its foot.
    await expect(page.getByRole("columnheader", { name: "Team", exact: true })).toBeInViewport();
  });

  test("Expand all opens every team, the team of five shows five players, nothing overlaps", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Expand all" }).click();
    expect(new Set(await disclosureStates(page))).toEqual(new Set(["true"]));
    for (const name of FIVE) {
      await expect(page.locator("#team-roster-" + (await fivefoldId())).getByText(name)).toBeVisible();
    }
    await page.waitForTimeout(600);
    expect(await overlaps(page)).toEqual([]);

    mkdirSync(SHOTS_DIR, { recursive: true });
    await page.screenshot({ path: join(SHOTS_DIR, "projector-expanded-1920x1080.png") });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(300);
    expect(await overlaps(page)).toEqual([]);
    // Only the board scrolls. The stage once scrolled itself on this click and hid the title.
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: join(SHOTS_DIR, "projector-expanded-1280x720.png") });

    await page.getByRole("button", { name: "Collapse all" }).click();
    expect(new Set(await disclosureStates(page))).toEqual(new Set(["false"]));
    await page.screenshot({ path: join(SHOTS_DIR, "projector-collapsed-1280x720.png") });
  });

  test("one team's breakdown pushes the rows below it down from the first frame", async ({
    page,
  }) => {
    expect(await clickAndMeasureFirstFrame(page, /^Show 5 players for Fivefold$/)).toEqual([]);
    expect(await clickAndMeasureFirstFrame(page, /^Show \d players for Inter 7$/)).toEqual([]);
    await page.waitForTimeout(600);
    expect(await overlaps(page)).toEqual([]);
    // Independent: opening Inter 7 left Fivefold open, and closing it leaves Inter 7 open.
    await page.getByRole("button", { name: "Hide players for Fivefold" }).click();
    await expect(page.getByRole("button", { name: "Hide players for Inter 7" })).toBeVisible();
  });
});

test.describe("the rotating projector", () => {
  /*
    The wall with no `?division=` rotates through the division tabs. Expand all opened only the
    division on the wall, so a hand-picked or rotated-in division arrived collapsed.
  */
  test("Expand all and Collapse all apply to every division tab", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/projector?contest=${contestId}`);
    await expect(page.getByRole("table")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Expand all" }).click();
    expect(new Set(await disclosureStates(page))).toEqual(new Set(["true"]));

    await page.getByRole("tab", { name: "Advanced" }).click();
    await expect(page.locator("tbody[data-flip-part='row']")).toHaveCount(ADVANCED_TEAMS);
    expect(new Set(await disclosureStates(page))).toEqual(new Set(["true"]));

    await page.getByRole("button", { name: "Collapse all" }).click();
    await page.getByRole("tab", { name: "Intermediate" }).click();
    await expect(page.locator("tbody[data-flip-part='row']")).toHaveCount(INTERMEDIATE_TEAMS);
    expect(new Set(await disclosureStates(page))).toEqual(new Set(["false"]));
  });
});

async function fivefoldId(): Promise<string> {
  const team = await testDb().team.findFirst({ where: { contestId, name: "Fivefold" } });
  return team?.id ?? "";
}

test.describe("the organizer awards board", () => {
  test("every team on both tabs, Expand all and Collapse all, and no overlap", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await signInAsOrganizer(page);
    await page.goto(`/admin/contests/${contestId}/awards`);
    const table = page.getByRole("table", { name: "Team standings" });
    await expect(table).toBeVisible({ timeout: 30_000 });

    await page.getByRole("tab", { name: "Intermediate" }).click();
    await expect(table.locator("tbody[data-flip-part='row']")).toHaveCount(INTERMEDIATE_TEAMS);
    expect(await clickAndMeasureFirstFrame(page, /^Show 5 players for Fivefold$/)).toEqual([]);

    await page.getByRole("button", { name: "Expand all" }).click();
    expect(new Set(await disclosureStates(page))).toEqual(new Set(["true"]));
    await page.waitForTimeout(600);
    expect(await overlaps(page)).toEqual([]);
    const last = table.locator("tbody[data-flip-part='row']").last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();

    mkdirSync(SHOTS_DIR, { recursive: true });
    await table.screenshot({ path: join(SHOTS_DIR, "awards-expanded-1280x720.png") });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(300);
    expect(await overlaps(page)).toEqual([]);
    await table.screenshot({ path: join(SHOTS_DIR, "awards-expanded-1920x1080.png") });

    await page.getByRole("button", { name: "Collapse all" }).click();
    expect(new Set(await disclosureStates(page))).toEqual(new Set(["false"]));

    await page.getByRole("tab", { name: "Advanced" }).click();
    await expect(table.locator("tbody[data-flip-part='row']")).toHaveCount(ADVANCED_TEAMS);
  });

  test("Expand all and Collapse all apply to every division tab, not only the one showing", async ({
    page,
  }) => {
    await signInAsOrganizer(page);
    await page.goto(`/admin/contests/${contestId}/awards`);
    const table = page.getByRole("table", { name: "Team standings" });
    await expect(table).toBeVisible({ timeout: 30_000 });

    await page.getByRole("tab", { name: "Intermediate" }).click();
    await page.getByRole("button", { name: "Expand all" }).click();
    expect(new Set(await disclosureStates(page))).toEqual(new Set(["true"]));

    await page.getByRole("tab", { name: "Advanced" }).click();
    await expect(table.locator("tbody[data-flip-part='row']")).toHaveCount(ADVANCED_TEAMS);
    expect(new Set(await disclosureStates(page))).toEqual(new Set(["true"]));

    await page.getByRole("button", { name: "Collapse all" }).click();
    await page.getByRole("tab", { name: "Intermediate" }).click();
    await expect(table.locator("tbody[data-flip-part='row']")).toHaveCount(INTERMEDIATE_TEAMS);
    expect(new Set(await disclosureStates(page))).toEqual(new Set(["false"]));
  });

  test("Expand all and Collapse all work from the keyboard", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await signInAsOrganizer(page);
    await page.goto(`/admin/contests/${contestId}/awards`);
    await expect(page.getByRole("table", { name: "Team standings" })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("tab", { name: "Intermediate" }).click();
    await page.getByRole("button", { name: "Expand all" }).focus();
    await page.keyboard.press("Enter");
    expect(new Set(await disclosureStates(page))).toEqual(new Set(["true"]));
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Collapse all" })).toBeFocused();
    await page.keyboard.press("Space");
    expect(new Set(await disclosureStates(page))).toEqual(new Set(["false"]));
  });
});
