import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { ContestApi, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7 — the projector rotates between divisions.
 *
 * The night has two divisions and one wall, and the wall sat on the first division's tab forever:
 * half the room never saw its own standings unless somebody walked to the laptop. Read as rendered
 * text, with the browser's clock driven by hand so 20 seconds of wall time costs nothing.
 *
 * Fixture: two divisions, a team of FIVE in the first beside two teams of two, and two teams of
 * two in the second. Screenshots at both projector resolutions, live and frozen, go to
 * `PROJECTOR_SHOTS_DIR` when it is set.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
const DIVISIONS = ["Intermediate", "Advanced"] as const;

test.describe.configure({ mode: "serial" });

let contestId = "";
let admin: ContestApi;

async function addTeam(
  api: ContestApi,
  name: string,
  divisionId: string,
  players: readonly string[],
): Promise<void> {
  const team = await readOk(await api.createTeamAsAdminRaw({ name, divisionId }));
  const teamId = (team.data as { teamId: string }).teamId;
  for (const displayName of players) {
    await readOk(await api.addNamedParticipantRaw({ displayName, teamId }));
  }
}

test.beforeAll(async ({ playwright }) => {
  const bootstrap = new ContestApi(await playwright.request.newContext(), "unused");
  await bootstrap.adminLogin(ADMIN_PASSCODE);
  const created = await readOk(
    await bootstrap.createContestRaw({
      name: `E2E Projector Rotation ${String(Date.now())}`,
      startsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
      freezeAt: null,
      scoringPresetId: "classic",
      divisions: [...DIVISIONS],
    }),
  );
  contestId = (created.data as { contestId: string }).contestId;
  admin = new ContestApi(await playwright.request.newContext(), contestId);
  await admin.adminLogin(ADMIN_PASSCODE);

  const roster = await readOk(await admin.rosterRaw());
  const divisions = (roster.data as { divisions: { divisionId: string; name: string }[] })
    .divisions;
  const idOf = (name: string): string => {
    const found = divisions.find((division) => division.name === name);
    if (found === undefined) throw new Error(`no division ${name}`);
    return found.divisionId;
  };

  await addTeam(admin, "Fivefold", idOf("Intermediate"), [
    "Ana Five",
    "Bo Five",
    "Cal Five",
    "Dee Five",
    "Eve Five",
  ]);
  await addTeam(admin, "Pair One", idOf("Intermediate"), ["Fay One", "Gus One"]);
  await addTeam(admin, "Pair Two", idOf("Intermediate"), ["Hal Two", "Ida Two"]);
  await addTeam(admin, "Upper One", idOf("Advanced"), ["Jo Upper", "Kit Upper"]);
  await addTeam(admin, "Upper Two", idOf("Advanced"), ["Lee Upper", "Max Upper"]);

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

/**
 * The division the wall says it is showing: the selected tab's name. `textContent`, because the
 * strip is uppercased in CSS and `innerText` returns the shouted form.
 */
async function selectedDivision(page: Page): Promise<string> {
  return ((await page.getByRole("tab", { selected: true }).textContent()) ?? "").trim();
}

async function openWall(page: Page, query = ""): Promise<void> {
  await page.clock.install();
  await page.goto(`/projector?contest=${contestId}${query}`);
  await expect(page.getByRole("tab", { selected: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("table")).toBeVisible({ timeout: 30_000 });
}

function heading(page: Page) {
  return page.getByRole("heading", { level: 1 });
}

test("the wall rotates between divisions every 20 seconds and says so", async ({ page }) => {
  await openWall(page);
  const first = await selectedDivision(page);
  const second = DIVISIONS.find((name) => name !== first) ?? "";

  // Which division is on screen is in the heading, and the rotation is stated in words.
  await expect(heading(page)).toContainText(`${first} team standings`, { ignoreCase: true });
  await expect(page.getByText("Divisions rotate every 20 seconds.")).toBeVisible();

  await page.clock.fastForward(19_000);
  expect(await selectedDivision(page)).toBe(first);

  await page.clock.fastForward(2_000);
  await expect(page.getByRole("tab", { selected: true })).toHaveText(second);
  await expect(heading(page)).toContainText(`${second} team standings`, { ignoreCase: true });

  // And back again: it wraps rather than stopping at the last division.
  await page.clock.fastForward(21_000);
  await expect(page.getByRole("tab", { selected: true })).toHaveText(first);
});

test("choosing a tab pauses the rotation, says so, and it resumes later", async ({ page }) => {
  await openWall(page);
  const first = await selectedDivision(page);
  const second = DIVISIONS.find((name) => name !== first) ?? "";

  await page.getByRole("tab", { name: second }).click();
  await expect(page.getByText(/^Rotation paused\./)).toBeVisible();

  await page.clock.fastForward(45_000);
  expect(await selectedDivision(page)).toBe(second);

  // A minute after the last choice the wall moves on by itself again.
  await page.clock.fastForward(20_000);
  await expect(page.getByText("Divisions rotate every 20 seconds.")).toBeVisible();
  await page.clock.fastForward(21_000);
  await expect(page.getByRole("tab", { selected: true })).toHaveText(first);
});

test("?division= pins one division and never rotates", async ({ page }) => {
  const roster = await readOk(await admin.rosterRaw());
  const advanced = (roster.data as { divisions: { divisionId: string; name: string }[] })
    .divisions.find((division) => division.name === "Advanced");
  await openWall(page, `&division=${advanced?.divisionId ?? ""}`);

  expect(await selectedDivision(page)).toBe("Advanced");
  await expect(page.getByText(/Divisions rotate|Rotation paused/)).toHaveCount(0);
  await page.clock.fastForward(65_000);
  expect(await selectedDivision(page)).toBe("Advanced");
});

test("under reduced motion the wall still switches, with nothing animated", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWall(page);
  const first = await selectedDivision(page);

  await page.clock.fastForward(21_000);
  await expect(page.getByRole("tab", { selected: true })).not.toHaveText(first);
  await expect(page.getByText("Divisions rotate every 20 seconds.")).toBeVisible();

  // No progress bar is drawn, and the board does not wipe in.
  const motion = await page.evaluate(() => ({
    bars: document.querySelectorAll("[class*='rotationFill']").length,
    wipe: getComputedStyle(document.getElementById("team-standings-panel") as Element)
      .animationName,
  }));
  expect(motion).toEqual({ bars: 0, wipe: "none" });
});

/** How far the wall and the standings panel overflow, which must be nothing at all. */
async function overflowOf(page: Page): Promise<{ panel: number; pageX: number; pageY: number }> {
  return page.evaluate(() => {
    const panel = document.getElementById("team-standings-panel");
    const doc = document.documentElement;
    return {
      panel: panel === null ? 0 : panel.scrollHeight - panel.clientHeight,
      pageX: doc.scrollWidth - doc.clientWidth,
      pageY: doc.scrollHeight - doc.clientHeight,
    };
  });
}

/*
  REAL time from here on. A fake clock also stops CSS animations and transitions where they
  stand, so a screenshot taken under one shows the board mid-wipe: blank. Each of these waits out
  one real 20-second turn, which is the honest cost of photographing a rotation.
*/
for (const frozen of [false, true]) {
  for (const size of [
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
  ]) {
    const label = `${String(size.width)}x${String(size.height)} ${frozen ? "frozen" : "live"}`;

    test(`both divisions fit the wall without scrolling at ${label}`, async ({ page }) => {
      test.setTimeout(90_000);
      await admin.freeze(frozen);
      await page.setViewportSize(size);
      await page.goto(`/projector?contest=${contestId}`);
      await expect(page.getByRole("table")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(frozen ? "Frozen standings" : /^Live standings/)).toBeVisible({
        timeout: 15_000,
      });

      const shotsDir = process.env.PROJECTOR_SHOTS_DIR ?? "";
      if (shotsDir !== "") mkdirSync(shotsDir, { recursive: true });
      const shoot = async (name: string): Promise<void> => {
        if (shotsDir === "") return;
        await page.screenshot({
          path: join(shotsDir, `projector-${label.replace(" ", "-")}-${name}.png`),
        });
      };

      for (let turn = 0; turn < DIVISIONS.length; turn += 1) {
        const division = await selectedDivision(page);
        // Let the wipe finish before measuring or photographing.
        await page.waitForTimeout(700);

        expect(await overflowOf(page), `${label}, ${division}`).toEqual({
          panel: 0,
          pageX: 0,
          pageY: 0,
        });
        await expect(page.getByRole("table")).toBeVisible();
        await shoot(division);

        await expect(page.getByRole("tab", { selected: true })).not.toHaveText(division, {
          timeout: 25_000,
        });
      }

      // The team of five, opened. That pauses the rotation, and the wall says so.
      await page.getByRole("tab", { name: "Intermediate" }).click();
      await page.getByRole("button", { name: /^Show 5 players for Fivefold$/ }).click();
      await expect(page.getByText("Ana Five")).toBeVisible();
      await expect(page.getByText(/^Rotation paused/)).toBeVisible();
      await page.waitForTimeout(700);
      expect(await overflowOf(page), `${label}, Fivefold open`).toEqual({
        panel: 0,
        pageX: 0,
        pageY: 0,
      });
      await shoot("Intermediate-team-of-five-open");
    });
  }
}
