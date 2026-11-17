import { expect, test, type Locator, type Page } from "@playwright/test";

import { AdminRosterSchema, type SetPlanResponse } from "@/lib/schemas/api";

import { ContestApi, readEnvelope, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb } from "./helpers/seed";

/**
 * G7 — a team is at most FOUR students, and a full team of four works with sets A to D.
 *
 * Organizer decision, 2026-11-17, reversing the day before's five. The audit that preceded it
 * found the roster API REPORTING `maxTeamSize` 4 while ACCEPTING a fifth member, because nothing
 * enforced the number it printed. So this file holds both halves to the same number:
 *
 *  - the roster reports 4, a team takes four members, and the fifth is refused on every door an
 *    organizer has (a seat added by name onto the team, a move from another team, a move of an
 *    unassigned student), with the sentence the organizer reads;
 *  - the four members are dealt sets A to D, the Teams tab reads "4 members, divisor 4", and the
 *    side-activity screen offers the four seats.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
const NAMES = ["Ana Four", "Bo Four", "Cal Four", "Dee Four"];
const REFUSAL = "A team has at most 4 students.";

test.describe.configure({ mode: "serial" });

let contestId = "";
let teamId = "";
let otherTeamId = "";
let admin: ContestApi;

async function signInAsOrganizer(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.locator('input[name="signin-passcode"]').fill(ADMIN_PASSCODE);
  await page.getByRole("button", { name: /Open the organizer console/ }).click();
  await page.waitForURL(/\/admin/, { timeout: 60_000 });
}

/** A fine pointer gets the listbox; a phone gets the native <select> (`useFinePointer`). */
async function choose(page: Page, select: Locator, option: RegExp, label: string): Promise<boolean> {
  const native = await select.evaluate((element) => element.tagName === "SELECT");
  if (native) {
    await select.selectOption({ label });
  } else {
    await select.click();
    await page.getByRole("option", { name: option }).click();
  }
  return native;
}

async function memberCount(id: string): Promise<number> {
  return testDb().participant.count({ where: { teamId: id } });
}

test.beforeAll(async ({ playwright }) => {
  await seedE2EContest();
  const bootstrap = new ContestApi(await playwright.request.newContext(), "unused");
  await bootstrap.adminLogin(ADMIN_PASSCODE);
  const created = await readOk(
    await bootstrap.createContestRaw({
      name: `E2E Team Of Four ${String(Date.now())}`,
      startsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
      freezeAt: null,
      scoringPresetId: "classic",
      divisions: ["Open"],
    }),
  );
  contestId = (created.data as { contestId: string }).contestId;
  admin = new ContestApi(await playwright.request.newContext(), contestId);
  await admin.adminLogin(ADMIN_PASSCODE);

  const roster = await readOk(await admin.rosterRaw());
  const divisionId = (roster.data as { divisions: { divisionId: string }[] }).divisions[0]
    ?.divisionId;
  const team = await readOk(await admin.createTeamAsAdminRaw({ name: "Fourfold", divisionId }));
  teamId = (team.data as { teamId: string }).teamId;
  const other = await readOk(await admin.createTeamAsAdminRaw({ name: "Spare Pair", divisionId }));
  otherTeamId = (other.data as { teamId: string }).teamId;
  for (const name of NAMES) {
    await readOk(await admin.addNamedParticipantRaw({ displayName: name, teamId }));
  }
});

test.afterAll(async () => {
  if (contestId !== "") {
    await testDb().contest.delete({ where: { id: contestId } }).catch(() => null);
  }
  await closeTestDb();
});

test("the roster reports 4, and a team of four was accepted whole", async () => {
  const roster = AdminRosterSchema.parse((await readOk(await admin.rosterRaw())).data);
  expect(roster.maxTeamSize).toBe(4);
  const fourfold = roster.teams.find((team) => team.teamId === teamId);
  expect(fourfold?.memberCount).toBe(4);
  expect(fourfold?.maxTeamSize).toBe(4);
  expect(await memberCount(teamId)).toBe(4);
});

test("a fifth seat added by name onto the team is refused, and no seat is created", async () => {
  const response = await admin.addNamedParticipantRaw({ displayName: "Eve Four", teamId });
  expect(response.status()).toBe(409);
  const envelope = await readEnvelope(response);
  expect(envelope.code).toBe("CONFLICT");
  expect(envelope.message).toContain(REFUSAL);

  expect(await memberCount(teamId)).toBe(4);
  const stray = await testDb().participant.findFirst({
    where: { contestId, displayName: "Eve Four" },
  });
  expect(stray).toBeNull();
});

test("a fifth member moved in from another team, or from no team, is refused", async () => {
  const fromTeam = (
    await readOk(await admin.addNamedParticipantRaw({ displayName: "Fay Spare", teamId: otherTeamId }))
  ).data as { participantId: string };
  const fromNowhere = (
    await readOk(await admin.addNamedParticipantRaw({ displayName: "Gus Loose" }))
  ).data as { participantId: string };

  for (const participantId of [fromTeam.participantId, fromNowhere.participantId]) {
    const response = await admin.moveParticipantRaw({ participantId, teamId, reason: "" });
    expect(response.status()).toBe(409);
    expect((await readEnvelope(response)).message).toContain(REFUSAL);
  }

  expect(await memberCount(teamId)).toBe(4);
  // The refused move left both students where they were.
  const after = await testDb().participant.findMany({
    where: { id: { in: [fromTeam.participantId, fromNowhere.participantId] } },
    select: { id: true, teamId: true },
  });
  expect(after.find((p) => p.id === fromTeam.participantId)?.teamId).toBe(otherTeamId);
  expect(after.find((p) => p.id === fromNowhere.participantId)?.teamId).toBeNull();

  // The same cap does not stop a move onto a team with room: the limit is the team's, not a lock.
  await readOk(
    await admin.moveParticipantRaw({
      participantId: fromNowhere.participantId,
      teamId: otherTeamId,
      reason: "",
    }),
  );
  expect(await memberCount(otherTeamId)).toBe(2);
});

test("four sets are built and the team of four holds A, B, C and D", async () => {
  const preview = await readOk(
    await admin.planSetsRaw({
      mode: "preview",
      composition: [{ difficulty: "E", count: 1 }],
      setCount: 4,
      seed: "e2e-team-of-four",
    }),
  );
  const plan = preview.data as SetPlanResponse;
  await readOk(
    await admin.planSetsRaw({
      mode: "apply",
      composition: plan.composition,
      setCount: plan.setCount,
      seed: plan.seed ?? undefined,
      poolVersion: plan.poolVersion,
    }),
  );
  await readOk(await admin.assignSetsRaw({}));

  const members = await testDb().participant.findMany({
    where: { teamId },
    select: { chosenSet: { select: { label: true } } },
  });
  expect(members.map((m) => m.chosenSet?.label).sort()).toEqual(["A", "B", "C", "D"]);
});

test("the Teams tab shows the team of four as four members, divisor 4", async ({ page }) => {
  await signInAsOrganizer(page);
  await page.goto(`/admin/contests/${contestId}/teams`);
  await expect(page.locator("main")).toContainText("divisor 4", { timeout: 30_000 });

  const rendered = await page.locator("main").innerText();
  expect(rendered).toContain("4 members, divisor 4");
  expect(rendered).not.toContain("divisor 5");
});

test("the Teams tab says why a fifth student was refused", async ({ page }) => {
  await signInAsOrganizer(page);
  await page.goto(`/admin/contests/${contestId}/teams`);
  await expect(page.locator("main")).toContainText("divisor 4", { timeout: 30_000 });

  await page.getByLabel("Add a student by name").fill("Hal Four");
  const team = page.getByLabel(/^Team/).first();
  await choose(page, team, /^Fourfold$/, "Fourfold");
  await page.getByRole("button", { name: "Add and make a code" }).click();

  await expect(page.getByRole("alert").filter({ hasText: REFUSAL })).toBeVisible();
  expect(await memberCount(teamId)).toBe(4);
});

test("the side-activity screen offers the four seats, A to D, for the team of four", async ({
  page,
}) => {
  await signInAsOrganizer(page);
  await page.goto(`/admin/contests/${contestId}/side-activities`);

  const form = page.locator("form").first();
  await page.getByRole("button", { name: "Sudoku", exact: true }).click();

  const team = form.getByLabel(/^Team/).first();
  const native = await choose(page, team, /^Fourfold \(4 players\)/, "Fourfold (4 players)");

  const seat = form.getByLabel("Seat or student (optional)");
  let seats: string[];
  if (native) {
    seats = await seat.locator("option").allInnerTexts();
  } else {
    await seat.click();
    await expect(page.getByRole("option", { name: /Seat D,/ })).toBeVisible();
    seats = await page.getByRole("option").allInnerTexts();
  }
  const letters = seats
    .map((option) => /Seat ([A-Z]),/.exec(option)?.[1])
    .filter((letter): letter is string => letter !== undefined)
    .sort();
  expect(letters).toEqual(["A", "B", "C", "D"]);
});
