import { expect, test } from "@playwright/test";

import { ContestApi, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, type SeededContest } from "./helpers/seed";

/**
 * G7 — the wall shows the frozen board even when an organizer's cookie rides along.
 *
 * The projector is opened on the organizer laptop that drives the wall, so every poll it makes
 * carries the organizer's session. The board routes keyed the freeze off that cookie alone and
 * handed the wall the LIVE board, which put post-freeze scores in front of the room. The wall now
 * asks for `?view=public`, and this spec asks the way the wall does, AS AN ORGANIZER, on all four
 * board routes.
 *
 * Post-freeze points come from a side activity, because it moves a team score without a judge.
 * The organizer's own view without the flag is the positive control: it must see the points, or
 * this spec could pass against a board that never moved.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
const POST_FREEZE_POINTS = 41;

let seeded: SeededContest;
let admin: ContestApi;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();
  admin = new ContestApi(await playwright.request.newContext(), seeded.contestId);
  await admin.adminLogin(ADMIN_PASSCODE);
});

test.afterAll(async () => {
  await closeTestDb();
});

test("an organizer session asking for the projector view gets the frozen board", async () => {
  const teamId = seeded.teamIds.get("cubs");
  expect(teamId, "the fixture has no Cubs team").toBeDefined();
  if (teamId === undefined) return;

  const before = await admin.teamStandings();
  const beforeTeam = before.teams.find((team) => team.teamId === teamId);
  expect(beforeTeam).toBeDefined();

  const frozen = await admin.freeze(true);
  expect(frozen.freezeAt).not.toBeNull();

  try {
    const created = await readOk(
      await admin.addSideActivityRaw(teamId, { label: "Projector freeze probe", points: POST_FREEZE_POINTS }),
    );
    expect(created.status).toBe(200);

    // Positive control: the organizer's own board sees through the freeze.
    const live = await admin.teamStandings();
    expect(live.frozen).toBe(false);
    expect(live.teams.find((team) => team.teamId === teamId)?.sideActivityPoints).toBe(
      (beforeTeam?.sideActivityPoints ?? 0) + POST_FREEZE_POINTS,
    );

    for (const scoped of [true, false]) {
      const wall = await admin.projectorTeamStandings(scoped);
      const wallTeam = wall.teams.find((team) => team.teamId === teamId);
      expect(wall.frozen, `team board (scoped=${String(scoped)}) is not frozen for the wall`).toBe(true);
      expect(wallTeam?.sideActivityPoints).toBe(beforeTeam?.sideActivityPoints);
      expect(wallTeam?.scoreHundredths).toBe(beforeTeam?.scoreHundredths);
      // The public view carries no per-player breakdown, whoever asks.
      for (const team of wall.teams) {
        for (const player of team.players) expect(player.problems ?? null).toBeNull();
      }

      const individual = await admin.projectorStandings(scoped);
      expect(individual.frozen, `individual board (scoped=${String(scoped)}) is not frozen for the wall`).toBe(
        true,
      );
    }

    // The organizer's individual board, without the flag, still sees through the freeze.
    expect((await admin.standings()).frozen).toBe(false);
  } finally {
    await admin.freeze(false);
  }
});
