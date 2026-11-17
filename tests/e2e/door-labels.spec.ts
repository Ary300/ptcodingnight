import { expect, test, type Page } from "@playwright/test";

import { mintJoinCode } from "@/lib/contest/join-code";

import { requiredEnv } from "./helpers/env";
import { pauseLiveContests, restoreContests, type PausedContest } from "./helpers/live-contests";
import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7, in a browser: the front door's buttons keep their names for whoever comes back to them.
 *
 * The organizer's report: once a student started practice or typed a code, every button on `/`
 * turned into "Open the contest", and a practice guest who came back to press Practice found it
 * gone. Each viewer kind now gets its own door:
 *
 *  - anonymous: Practice and "Enter your join code";
 *  - a practice guest: the same two, with Practice taking them back to THEIR problems and no
 *    second guest made, and `/join` still taking a code;
 *  - a seat: "Continue as <first name>" with their mark and "Not you? Sign out", on `/` and
 *    `/join`, and no Practice, which would replace the seat's session;
 *  - an organizer: "Open the organizer console".
 *
 * Copy is checked as RENDERED text (`innerText`), because a space lost between JSX elements is
 * invisible in the source.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
const CONTEST_NAME = "E2E Door Labels Night";

let paused: PausedContest[] = [];
let contestId = "";
let arenaId = "";

test.beforeAll(async () => {
  // Practice is closed while a real contest is live; the e2e database always has one.
  paused = await pauseLiveContests();
  const arena = await testDb().contest.findFirst({
    where: { isPractice: true, state: "RUNNING" },
    select: { id: true },
  });
  expect(arena, "no practice arena: run `npx tsx scripts/seed-practice.ts` first").not.toBeNull();
  arenaId = arena?.id ?? "";

  // A seat's contest that does not close practice: scheduled for tomorrow, which a code can join.
  await testDb().contest.deleteMany({ where: { name: CONTEST_NAME } });
  const tomorrow = Date.now() + 24 * 60 * 60_000;
  const contest = await testDb().contest.create({
    data: {
      name: CONTEST_NAME,
      joinCode: "NFMDOORLB",
      state: "SCHEDULED",
      startsAt: new Date(tomorrow),
      endsAt: new Date(tomorrow + 75 * 60_000),
    },
    select: { id: true },
  });
  contestId = contest.id;
});

test.afterAll(async () => {
  await testDb().contest.deleteMany({ where: { name: CONTEST_NAME } });
  await restoreContests(paused);
  await closeTestDb();
});

/** A roster seat with a printed code, the way an organizer's roster makes one. */
async function seat(firstName: string): Promise<{ displayName: string; joinCode: string }> {
  const displayName = `${firstName} Door${String(Date.now()).slice(-6)}`;
  const participant = await testDb().participant.create({
    data: { contestId, displayName },
    select: { id: true },
  });
  return { displayName, joinCode: await mintJoinCode(participant.id) };
}

async function joinWithCode(page: Page, joinCode: string): Promise<void> {
  await page.goto("/join");
  await page.getByLabel("Your join code").fill(joinCode);
  await page.getByRole("button", { name: "Join the contest" }).click();
  await page.waitForURL("**/contest", { timeout: 30_000 });
}

interface SessionRead {
  readonly signedIn: boolean;
  readonly displayName: string | null;
  readonly participantId: string | null;
}

async function sessionOf(page: Page): Promise<SessionRead> {
  const body = (await (await page.request.get("/api/auth/session")).json()) as { data: SessionRead };
  return body.data;
}

function arenaGuests(): Promise<number> {
  return testDb().participant.count({ where: { contestId: arenaId } });
}

test("anonymous: Practice and the join code, and nobody is recognised", async ({ page }) => {
  await page.goto("/");
  const bar = page.getByRole("navigation", { name: "Site" });
  await expect(bar.getByRole("button", { name: "Practice" })).toBeVisible();
  await expect(bar.getByRole("link", { name: "Enter your join code" })).toHaveAttribute(
    "href",
    "/join",
  );
  await expect(page.getByRole("region", { name: "Signed in" })).toHaveCount(0);
  const text = await page.evaluate(() => document.body.innerText);
  expect(text).not.toContain("Continue as");
  expect(text).not.toContain("Open the contest");
});

test("practice guest: Practice stays, returns to the same guest, and the code form still works", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Site" }).getByRole("button", { name: "Practice" }).click();
  await page.waitForURL("**/contest", { timeout: 30_000 });
  const guest = await sessionOf(page);
  expect(guest.signedIn).toBe(true);
  expect(guest.displayName).toMatch(/^Guest \d+$/);
  const guestsBefore = await arenaGuests();

  // Back at the front door, the page is the one they first saw.
  await page.goto("/");
  const bar = page.getByRole("navigation", { name: "Site" });
  const practice = bar.getByRole("link", { name: "Practice", exact: true });
  await expect(practice).toBeVisible();
  await expect(practice).toHaveAttribute("href", "/contest");
  await expect(bar.getByRole("link", { name: "Enter your join code" })).toBeVisible();
  const text = await page.evaluate(() => document.body.innerText);
  expect(text).not.toContain("Open the contest");
  expect(text).not.toContain("Continue as");

  // Practice takes them straight back: the same participant, so the same progress.
  await practice.click();
  await page.waitForURL("**/contest", { timeout: 30_000 });
  await expect(page.locator("header").getByText("Practice", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  const after = await sessionOf(page);
  expect(after.participantId).toBe(guest.participantId);
  expect(after.displayName).toBe(guest.displayName);
  expect(await arenaGuests()).toBe(guestsBefore);

  // `/join` says which guest this is, with a way back, and keeps the form.
  await page.goto("/join");
  const line = page.getByText(/^You are practicing as Guest \d+\./);
  await expect(line).toBeVisible();
  expect(await line.innerText()).toBe(`You are practicing as ${String(guest.displayName)}. Back to practice`);
  await expect(page.getByRole("link", { name: "Back to practice" })).toHaveAttribute(
    "href",
    "/contest",
  );
  await expect(page.getByRole("region", { name: "Signed in" })).toHaveCount(0);

  // A slip arrives: the code signs this browser in as the seat.
  const slip = await seat("Riley");
  await joinWithCode(page, slip.joinCode);
  const seated = await sessionOf(page);
  expect(seated.displayName).toBe(slip.displayName);
  expect(seated.participantId).not.toBe(guest.participantId);
  await expect(page.getByRole("banner").getByText(slip.displayName)).toBeVisible({
    timeout: 30_000,
  });
});

test("seat: / and /join say Continue as the first name, with no Practice, and sign out works", async ({
  page,
}) => {
  const slip = await seat("Jordan");
  await joinWithCode(page, slip.joinCode);

  await page.goto("/");
  const bar = page.getByRole("navigation", { name: "Site" });
  await expect(bar.getByRole("link", { name: "Continue as Jordan" })).toHaveAttribute(
    "href",
    "/contest",
  );
  await expect(bar.getByRole("button", { name: "Practice" })).toHaveCount(0);
  await expect(bar.getByRole("link", { name: "Practice", exact: true })).toHaveCount(0);

  const card = page.getByRole("region", { name: "Signed in" });
  await expect(card).toBeVisible();
  await expect(card.locator("svg[data-guest-avatar]")).toHaveCount(1);
  const cardText = await card.innerText();
  expect(cardText).toContain(slip.displayName);
  expect(cardText).toContain(CONTEST_NAME);
  expect(cardText).toContain("Continue as Jordan");
  expect(cardText.replace(/\s+/g, " ")).toContain("Not you? Sign out");
  const pageText = await page.evaluate(() => document.body.innerText);
  expect(pageText).not.toContain("Open the contest");

  // The card's button goes in.
  await card.getByRole("link", { name: "Continue as Jordan" }).click();
  await page.waitForURL("**/contest", { timeout: 30_000 });

  // `/join` shows the same card, and no Practice to replace the seat with.
  await page.goto("/join");
  const joinCard = page.getByRole("region", { name: "Signed in" });
  await expect(joinCard.getByRole("link", { name: "Continue as Jordan" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Practice" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Enter your join code" })).toBeVisible();

  await joinCard.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("region", { name: "Signed in" })).toHaveCount(0, {
    timeout: 30_000,
  });
  expect((await sessionOf(page)).signedIn).toBe(false);
  await expect(page.getByRole("button", { name: "Practice" })).toBeVisible();
});

test("seat: Not you? Sign out on the home page returns the stranger's page", async ({ page }) => {
  const slip = await seat("Avery");
  await joinWithCode(page, slip.joinCode);

  await page.goto("/");
  const card = page.getByRole("region", { name: "Signed in" });
  await card.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Enter your join code" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Signed in" })).toHaveCount(0);
  expect((await sessionOf(page)).signedIn).toBe(false);
});

test("organizer: the bar keeps Open the organizer console", async ({ page }) => {
  const login = await page.request.post("/api/admin/session", { data: { passcode: ADMIN_PASSCODE } });
  expect(login.ok()).toBe(true);

  await page.goto("/");
  const bar = page.getByRole("navigation", { name: "Site" });
  await expect(bar.getByRole("link", { name: "Open the organizer console" })).toHaveAttribute(
    "href",
    "/admin",
  );
  await expect(bar.getByRole("button", { name: "Practice" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Signed in" })).toHaveCount(0);
  const text = await page.evaluate(() => document.body.innerText);
  expect(text).not.toContain("Continue as");
});
