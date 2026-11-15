import { expect, test } from "@playwright/test";

import { ContestApi, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";

/**
 * G7, in a browser: the walk a student takes on the night, from the front door to the lobby.
 *
 * `/` -> the primary call to action -> `/join` -> type the code on the slip -> `/contest`, with
 * the student's own name and team in the header and the problem list on the page.
 *
 * ## Why this is a browser spec and not an API one
 *
 * `join-code.api.spec.ts` already proves that `POST /api/auth/join-code` signs the seat in. What
 * it cannot prove is that a student can FIND that route from the page they land on. This project
 * has shipped a signed-in student who could never enter the contest, a screen that performed none
 * of its actions, and a join link that nothing on the site pointed at, and every one of them
 * passed the API specs. The organizer's decision ("the join code system, not login") is a
 * decision about what a student sees, so the test has to see it too.
 *
 * Since 2026-11-15 the join code is the ONLY student door. The organizer's instruction was "just
 * remove the sign in option since we dont need it anymore", so the landing page offers no account
 * sign-in, `/sign-up` is a redirect to `/join`, and the one link to the organizer passcode page
 * is in the footer. The last two tests here pin that.
 *
 * The seat is minted the way an organizer mints one, through the roster route, and then placed
 * in the division and set that hold a live problem. That placement is a precondition rather than
 * a shortcut: every fixture problem carries a division and a set, so an unplaced seat sees an
 * empty list, and this spec is about reaching the list rather than about scoping, which
 * `wiring.api.spec.ts` covers.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");

let seeded: SeededContest;
let admin: ContestApi;

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();
  admin = new ContestApi(await playwright.request.newContext(), seeded.contestId);
  await admin.adminLogin(ADMIN_PASSCODE);
});

test.afterAll(async () => {
  await closeTestDb();
});

/** A team, a seat on it with a code, and the seat placed where a live problem is. */
async function seatWithCode(): Promise<{
  displayName: string;
  teamName: string;
  joinCode: string;
}> {
  const db = testDb();
  const stamp = `${String(Date.now())}-${String(Math.random()).slice(2, 6)}`;

  const target = await db.contestProblem.findFirst({
    where: { contestId: seeded.contestId, problem: { state: "PUBLISHED" } },
    select: { divisionId: true, setId: true },
  });
  expect(target, "the fixture has no PUBLISHED contest problem to list").not.toBeNull();

  const team = await db.team.create({
    data: {
      contestId: seeded.contestId,
      name: `E2E Door Team ${stamp}`,
      joinCode: `D${stamp.slice(-5)}`,
      divisionId: target?.divisionId ?? null,
    },
    select: { id: true, name: true },
  });

  const displayName = `E2E Door Student ${stamp}`;
  const { data } = await readOk(
    await admin.addNamedParticipantRaw({
      displayName,
      teamId: team.id,
      divisionId: target?.divisionId ?? null,
    }),
  );
  const seat = data as { participantId: string; joinCode: string };

  // Sets are dealt by an organizer (PRD §6.2), and the lobby lists only the student's own set.
  await db.participant.update({
    where: { id: seat.participantId },
    data: { chosenSetId: target?.setId ?? null },
  });

  return { displayName, teamName: team.name, joinCode: seat.joinCode };
}

test("a student follows the front door to /join, types their code, and is in", async ({ page }) => {
  const seat = await seatWithCode();

  await page.goto("/");

  // The primary action on the landing page goes to the join form and says so. `.first()`: the
  // same label is in the bar, the hero and the closing band, on purpose.
  const door = page.getByRole("link", { name: "Enter your join code" }).first();
  await expect(door).toBeVisible();
  await door.click();
  await page.waitForURL("**/join");
  await expect(
    page.getByRole("heading", { name: "Enter your join code", level: 1 }),
  ).toBeVisible();

  // Typed the way it is printed. The form uppercases as you type; the server strips the dash.
  await page
    .getByLabel("Your join code")
    .fill(`${seat.joinCode.slice(0, 3)}-${seat.joinCode.slice(3)}`);
  await page.getByRole("button", { name: "Join the contest" }).click();

  // A document navigation, so every server layer sees the new cookie.
  await page.waitForURL("**/contest", { timeout: 30_000 });

  /*
    The header names the student AND the team the code put them on. Both in the bar, because the
    one question a student asks on arrival is "did it put me on the right team", and that answer
    must not be behind a click. The account button carries both in its accessible name as well,
    so the check holds at a width where the visible text is hidden.
  */
  const header = page.getByRole("banner");
  await expect(header.getByText(seat.displayName)).toBeVisible({ timeout: 30_000 });
  await expect(header.getByText(seat.teamName)).toBeVisible();
  await expect(header.locator('button[aria-haspopup="menu"]')).toHaveAttribute(
    "aria-label",
    `Account: ${seat.displayName}, ${seat.teamName}`,
  );

  // And the lobby is the lobby: the problem list arrives, with at least the live problem on it.
  await expect(page.getByRole("heading", { name: "Problems", level: 1 })).toBeVisible();
  const rows = page.getByRole("list", { name: "Problems" }).getByRole("listitem");
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  expect(await rows.count()).toBeGreaterThan(0);

  // Nothing on the signed-in page asks the student to sign in or to enter a code again.
  await expect(page.getByText(/You are not signed in/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Enter your join code" })).toHaveCount(0);
});

test("the account menu of a join-code seat offers no Settings, and says why", async ({ page }) => {
  const seat = await seatWithCode();

  await page.goto("/join");
  await page.getByLabel("Your join code").fill(seat.joinCode);
  await page.getByRole("button", { name: "Join the contest" }).click();
  await page.waitForURL("**/contest", { timeout: 30_000 });

  const trigger = page.locator('header button[aria-haspopup="menu"]');
  await expect(trigger).toBeVisible({ timeout: 30_000 });

  /*
    Wait for the session read the chrome performs, which is what decides whether this seat has an
    account. Asserting the menu's contents before that answer would pass against the "not loaded
    yet" state, which also shows no Settings row, and prove nothing about the join-code case.
  */
  await expect(trigger).toHaveAttribute(
    "aria-label",
    `Account: ${seat.displayName}, ${seat.teamName}`,
    { timeout: 30_000 },
  );
  await trigger.click();

  const menu = page.getByRole("menu", { name: "Account" });
  await expect(menu).toBeVisible();
  for (const label of ["Problems", "My team", "My submissions", "Live standings"]) {
    await expect(menu.getByRole("menuitem", { name: label })).toBeVisible();
  }
  // `/settings` reads a `User` row, and a join-code seat has none: `/api/me` answers 403. A menu
  // item that opens onto a refusal is not offered, and its absence is explained in prose beside
  // the menu rather than left for the student to wonder about.
  await expect(menu.getByRole("menuitem", { name: "Settings" })).toHaveCount(0);
  await expect(page.getByText(/Signed in with a join code/)).toBeVisible();
  // Sign out stays: it clears the session, which a shared classroom laptop needs. It is the only
  // action in the menu that is not a destination.
  await expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveCount(5);
});

test("the landing page offers the join code and no account sign-in", async ({ page }) => {
  await page.goto("/");

  // The header and the hero carry the join code. Neither carries an account link.
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Enter your join code" })).toBeVisible();
  await expect(header.getByRole("link", { name: /Sign in/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Sign in/ })).toHaveCount(0);
  await expect(page.locator('a[href="/sign-up"]')).toHaveCount(0);

  const text = await page.evaluate(() => document.body.innerText);
  expect(text).not.toContain("practice account");
  expect(text).not.toContain("Create your account");

  // The organizer page exists, once, in the footer, and does not compete with the door.
  const organizers = page.getByRole("contentinfo").getByRole("link", { name: "Organizers" });
  await expect(organizers).toBeVisible();
  await expect(organizers).toHaveAttribute("href", "/sign-in");
  await expect(page.locator('a[href="/sign-in"]')).toHaveCount(1);
});

test("/sign-up is gone: it lands on /join", async ({ page }) => {
  await page.goto("/sign-up");
  await page.waitForURL((url) => url.pathname === "/join");
  await expect(page.getByRole("heading", { name: "Enter your join code", level: 1 })).toBeVisible();
  await expect(page.getByLabel("Your join code")).toBeVisible();
});
