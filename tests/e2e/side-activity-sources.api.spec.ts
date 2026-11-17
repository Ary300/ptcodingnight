import { expect, test } from "@playwright/test";

import { ContestSideActivitiesSchema, TeamSideActivitiesSchema } from "@/lib/schemas/api";

import { ContestApi, readEnvelope, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb } from "./helpers/seed";

/**
 * G7 — typed puzzle and Kahoot awards say where their points came from.
 *
 * The night's puzzles are on paper, one per team member, and the organizers type the points, plus
 * the Kahoot placing after the contest. Their request: "identify the puzzle/Kahoot like where the
 * actual points came from". So a team of four holds four puzzle awards and a Kahoot placing, each
 * with its own source, each edited or removed on its own, a second award with the same source is
 * refused until confirmed, and the Puzzle total always equals the awards listed under it.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");

test.describe.configure({ mode: "serial" });

let contestId = "";
let admin: ContestApi;
let teamId = "";

async function teamAwards() {
  return TeamSideActivitiesSchema.parse((await readOk(await admin.sideActivitiesRaw(teamId))).data);
}

async function puzzleColumn(): Promise<number | undefined> {
  const standings = await admin.teamStandings();
  return standings.teams.find((team) => team.teamId === teamId)?.sideActivityPoints;
}

async function award(label: string, points: number): Promise<string> {
  const body = await readOk(await admin.addSideActivityRaw(teamId, { label, points }));
  return (body.data as { id: string }).id;
}

test.beforeAll(async ({ playwright }) => {
  await seedE2EContest();
  const bootstrap = new ContestApi(await playwright.request.newContext(), "unused");
  await bootstrap.adminLogin(ADMIN_PASSCODE);
  const created = await readOk(
    await bootstrap.createContestRaw({
      name: `E2E Award Sources ${String(Date.now())}`,
      startsAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      freezeAt: null,
      scoringPresetId: "classic",
      divisions: ["Open"],
    }),
  );
  contestId = (created.data as { contestId: string }).contestId;
  admin = new ContestApi(await playwright.request.newContext(), contestId);
  await admin.adminLogin(ADMIN_PASSCODE);

  const team = await readOk(await admin.createTeamAsAdminRaw({ name: "Paper Four" }));
  teamId = (team.data as { teamId: string }).teamId;
  for (const name of ["Ava One", "Ben Two", "Cy Three", "Di Four"]) {
    await readOk(await admin.addNamedParticipantRaw({ displayName: name, teamId }));
  }
});

test.afterAll(async () => {
  if (contestId !== "") {
    await testDb().contest.delete({ where: { id: contestId } }).catch(() => null);
  }
  await closeTestDb();
});

test("a team of four holds a puzzle award per member, each naming its source", async () => {
  await award("Sudoku, seat A, Ava One", 25);
  await award("Cipher, seat B, Ben Two", 20);
  await award("Sudoku, seat C, Cy Three", 25);
  await award("Logic grid, seat D, Di Four", 15);

  const awards = await teamAwards();
  expect(awards.activities.map((a) => a.label)).toEqual([
    "Sudoku, seat A, Ava One",
    "Cipher, seat B, Ben Two",
    "Sudoku, seat C, Cy Three",
    "Logic grid, seat D, Di Four",
  ]);
  expect(awards.total).toBe(85);
  expect(await puzzleColumn()).toBe(85);

  // The contest-wide breakdown the awards screen reads carries the same awards.
  const breakdown = ContestSideActivitiesSchema.parse(
    (await readOk(await admin.contestSideActivitiesRaw())).data,
  );
  const mine = breakdown.teams.find((team) => team.teamId === teamId);
  expect(mine?.activities.reduce((sum, a) => sum + a.points, 0)).toBe(85);
});

test("the same source twice is refused until confirmed, and the refusal names the first", async () => {
  const refusal = await readEnvelope(
    await admin.addSideActivityRaw(teamId, { label: "  sudoku, seat a, ava one ", points: 25 }),
  );
  expect(refusal.status).toBe(409);
  expect(refusal.message).toContain("Sudoku, seat A, Ava One");
  expect(await puzzleColumn()).toBe(85);

  const confirmed = await readOk(
    await admin.addSideActivityRaw(teamId, {
      label: "Sudoku, seat A, Ava One",
      points: 25,
      confirmDuplicate: true,
    }),
  );
  expect(await puzzleColumn()).toBe(110);

  // Fixable: the second one comes off on its own and the first stays.
  await readOk(
    await admin.removeSideActivityRaw(teamId, (confirmed.data as { id: string }).id),
  );
  expect(await puzzleColumn()).toBe(85);
  expect((await teamAwards()).activities.filter((a) => a.label.startsWith("Sudoku, seat A"))).toHaveLength(1);
});

test("one award is edited on its own, and the audit log keeps what it said before", async () => {
  const cipher = (await teamAwards()).activities.find((a) => a.label.startsWith("Cipher"));
  expect(cipher).toBeDefined();

  await readOk(
    await admin.editSideActivityRaw(teamId, cipher?.id ?? "", { points: 10, label: "Cipher, seat B, Ben Two" }),
  );
  expect(await puzzleColumn()).toBe(75);

  const audit = await testDb().auditLog.findFirst({
    where: { action: "team.side_activity_edited", entity: `team:${teamId}` },
    orderBy: { at: "desc" },
  });
  expect(JSON.stringify(audit?.before)).toContain("20");
  expect(JSON.stringify(audit?.after)).toContain("10");
});

test("one award is removed on its own", async () => {
  const logic = (await teamAwards()).activities.find((a) => a.label.startsWith("Logic grid"));
  await readOk(await admin.removeSideActivityRaw(teamId, logic?.id ?? ""));
  const awards = await teamAwards();
  expect(awards.activities).toHaveLength(3);
  expect(awards.total).toBe(60);
  expect(await puzzleColumn()).toBe(60);
});

test("while frozen, an award on the frozen board keeps its points; the Kahoot after it does not", async () => {
  await testDb().contest.update({ where: { id: contestId }, data: { state: "RUNNING" } });
  const sudoku = (await teamAwards()).activities.find((a) => a.label.startsWith("Sudoku, seat C"));
  await admin.freeze(true);

  const held = await readEnvelope(
    await admin.editSideActivityRaw(teamId, sudoku?.id ?? "", { points: 5 }),
  );
  expect(held.status).toBe(409);
  const removal = await readEnvelope(await admin.removeSideActivityRaw(teamId, sudoku?.id ?? ""));
  expect(removal.status).toBe(409);

  // A rename moves no total, so it is allowed.
  await readOk(
    await admin.editSideActivityRaw(teamId, sudoku?.id ?? "", { label: "Sudoku, seat C, Cy 3" }),
  );

  // The Kahoot is entered after the freeze, so it is not on the frozen board and stays fixable.
  const kahoot = await award("Kahoot", 60);
  await readOk(await admin.editSideActivityRaw(teamId, kahoot, { points: 40 }));
  expect(await puzzleColumn()).toBe(100);
});
