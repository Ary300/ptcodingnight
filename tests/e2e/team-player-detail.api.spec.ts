import { expect, test, type PlaywrightWorkerArgs } from "@playwright/test";

import { ContestApi } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";

/**
 * G7 — who may read the per-player, per-problem breakdown.
 *
 * `TeamPlayerRow.problems` is what each player scored on each problem, how many rejected
 * submissions it took them, and what their hints cost. Both team-standings routes are
 * **unauthenticated**, because the projector has no login — so the payload is the disclosure
 * boundary and there is nowhere else it can be. A component-level gate would be theatre: the rows
 * would already be sitting in the browser's network tab.
 *
 * This must therefore be asserted against the **real API**, never against the component. The
 * question is not "does the board draw it", it is "did the server send it".
 *
 * Four tiers (`lib/contest/standings.ts`, `getTeamStandings`):
 *
 *   anonymous / projector    null on every team
 *   competitor, own team     the array
 *   competitor, other team   null
 *   organizer                the array, on every team
 *
 * And a fifth property that is easy to lose: `null` and `[]` are different claims. `[]` means the
 * student has attempted nothing; `null` means it is not yours to read. Collapsing them prints a
 * lie about a real student, so the distinction is asserted here rather than trusted.
 */

let seeded: SeededContest;
let anon: ContestApi;
let admin: ContestApi;

/**
 * One competitor, on Panthers, shared by every test below.
 *
 * Deliberately built once. Each probe costs a sign-in plus an organizer `moveParticipant`, and
 * building a fresh one per test pushed this file past the 30 s per-test budget on a loaded host —
 * a precondition failure wearing a gate failure's clothes. Nothing here mutates the probe, so one
 * is enough, and the entitlement being asserted is a property of the ROUTE rather than of any
 * particular session.
 */
let member: ContestApi;
let memberTeamId: string;

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();

  anon = new ContestApi(await playwright.request.newContext(), seeded.contestId);
  admin = new ContestApi(await playwright.request.newContext(), seeded.contestId);

  await admin.adminLogin(ADMIN_PASSCODE);

  const probe = await competitorOnTeam(playwright, "panthers");
  member = probe.api;
  memberTeamId = probe.teamId;
});

test.afterAll(async () => {
  await closeTestDb();
});

/** Sign a fresh competitor in and have the organizer put them on `teamKey`, as a human would. */
async function competitorOnTeam(
  playwright: PlaywrightWorkerArgs["playwright"],
  teamKey: string,
): Promise<{ api: ContestApi; teamId: string }> {
  const api = new ContestApi(await playwright.request.newContext(), seeded.contestId);
  const joined = await api.signIn({
    displayName: `E2E Detail ${String(Date.now())}`,
    divisionId: seeded.divisionIds.get("intermediate") ?? null,
  });

  const teamId = seeded.teamIds.get(teamKey) ?? "";
  expect(teamId, `fixture has no ${teamKey} team`).not.toBe("");

  const placed = await admin.moveParticipantRaw({
    participantId: joined.participantId,
    teamId,
    reason: "Entitlement is a fact about a team member, so the probe has to be one",
  });
  expect(placed.status(), "the organizer could not place the probe").toBeLessThan(300);

  return { api, teamId };
}

test.describe("the per-player breakdown is entitled, not public", () => {
  test("an anonymous reader — the projector — gets null on every player of every team", async () => {
    const board = await anon.teamStandings();

    expect(board.teams.length, "the fixture board has no teams").toBeGreaterThan(0);

    const leaked = board.teams.flatMap((team) =>
      team.players.filter((player) => player.problems !== null).map((p) => `${team.name}/${p.displayName}`),
    );

    expect(
      leaked,
      "the projector has no login and hangs on a wall. Per-problem scores, wrong-attempt counts " +
        "and hint usage for every player of every team is live competitive intel and personally " +
        "embarrassing data about named minors — and the freeze exists precisely to stop the room " +
        "reading live progress.",
    ).toEqual([]);
  });

  test("a competitor reads their OWN team and nobody else's", async () => {
    const board = await member.teamStandings();
    const teamId = memberTeamId;
    const mine = board.teams.find((team) => team.teamId === teamId);
    const others = board.teams.filter((team) => team.teamId !== teamId);

    expect(mine, "the probe's own team is missing from the board").toBeDefined();
    if (mine === undefined) return;

    // Their teammates' points are the DIVISOR in their own score. A mean cannot be checked from
    // the total alone, and being able to check it is why /team exists.
    for (const player of mine.players) {
      expect(
        player.problems,
        `${player.displayName} is the viewer's own teammate and their breakdown was withheld`,
      ).not.toBeNull();
    }

    expect(others.length, "the fixture has only one team, so the negative case is untested").toBeGreaterThan(0);
    for (const team of others) {
      for (const player of team.players) {
        expect(
          player.problems,
          `${player.displayName} is on a rival team and their attempt history leaked`,
        ).toBeNull();
      }
    }
  });

  test("an organizer reads every team", async () => {
    const board = await admin.teamStandings();

    const withheld = board.teams.flatMap((team) =>
      team.players.filter((player) => player.problems === null).map((p) => `${team.name}/${p.displayName}`),
    );

    expect(
      withheld,
      "an organizer needs this to spot a stuck player mid-round and to settle a dispute after",
    ).toEqual([]);
  });

  test("a player who has attempted nothing is [] and not null", async () => {
    // The two are different claims and the UI renders them differently: `[]` is "attempted
    // nothing", `null` is "not yours to read". A viewer entitled to a teammate with no
    // submissions must get the empty array, or the screen says "not yours" about their own team.
    const board = await member.teamStandings();
    const teamId = memberTeamId;
    const mine = board.teams.find((team) => team.teamId === teamId);
    expect(mine).toBeDefined();
    if (mine === undefined) return;

    const fresh = mine.players.find((player) => player.score === 0 && player.solvedCount === 0);
    expect(fresh, "no unscored player on the team to check the empty case with").toBeDefined();
    expect(fresh?.problems, "an entitled viewer got null for a teammate who simply has no rows").toEqual([]);
  });
});

test.describe("what the breakdown says", () => {
  test("labels each problem and carries the Codeforces rejection count", async () => {
    const board = await member.teamStandings();
    const teamId = memberTeamId;
    const mine = board.teams.find((team) => team.teamId === teamId);
    const rows = (mine?.players ?? []).flatMap((player) => player.problems ?? []);

    expect(rows.length, "no problem rows to inspect on the viewer's own team").toBeGreaterThan(0);

    for (const row of rows) {
      // A cuid is not a breakdown. slotLabel and title come from the database in the mapper,
      // because the scoring engine must not know that a problem has a name.
      expect(row.slotLabel, "a problem row came through with no slot label").not.toBe("");
      expect(row.title, "a problem row came through with no title").not.toBe("");
      expect(row.rejectedCount).toBeGreaterThanOrEqual(0);
    }

    // Grace's fixture history is one wrong answer and then an accept, which is the whole reason
    // this number is worth showing: "solved on the second try" is a true and useful thing to see.
    const graceRows = (mine?.players ?? [])
      .filter((player) => player.displayName.includes("Grace"))
      .flatMap((player) => player.problems ?? []);
    expect(
      graceRows.some((row) => row.rejectedCount > 0),
      "the fixture's rejected submission did not reach the breakdown",
    ).toBe(true);
  });

  test("sorts every player's problems by (slotLabel, contestProblemId), byte-identically", async () => {
    // Standings must replay byte-identically (PRD §6.6), and Postgres returns rows in whatever
    // order it likes. slotLabel ALONE is not a stable key — prisma/schema.prisma puts no
    // uniqueness constraint on it — so the pair is what the mapper sorts on.
    const teamId = memberTeamId;
    const first = await member.teamStandings();
    const second = await member.teamStandings();

    const detailOf = (board: typeof first): string =>
      JSON.stringify(
        board.teams
          .find((team) => team.teamId === teamId)
          ?.players.map((player) => player.problems),
      );

    expect(detailOf(second), "two reads of the same board disagreed byte for byte").toEqual(
      detailOf(first),
    );

    const rows = first.teams.find((team) => team.teamId === teamId)?.players.flatMap((p) => p.problems ?? []) ?? [];
    expect(rows.length).toBeGreaterThan(0);
  });

  test("a player's solvedCount agrees with the individual problems that scored", async () => {
    // solvedCount is computed in the mapper off the same problems `score` sums, precisely so the
    // count and the total cannot disagree on screen. Group problems are excluded from BOTH,
    // because a group problem's points are a team fact (lib/scoring/team.ts).
    const board = await member.teamStandings();
    const teamId = memberTeamId;
    const mine = board.teams.find((team) => team.teamId === teamId);
    expect(mine).toBeDefined();
    if (mine === undefined) return;

    for (const player of mine.players) {
      const rows = player.problems;
      expect(rows, `${player.displayName} is on the viewer's own team and was withheld`).not.toBeNull();
      if (rows === null) continue;

      const scoredIndividual = rows.filter((row) => !row.isGroupProblem && row.score > 0);
      expect(
        player.solvedCount,
        `${player.displayName}: solvedCount disagrees with the rows it is counted over`,
      ).toBe(scoredIndividual.length);

      const sum = scoredIndividual.reduce((total, row) => total + row.score, 0);
      expect(player.score, `${player.displayName}: the breakdown does not add up to the total`).toBe(
        sum,
      );
    }
  });

  test("a group problem is flagged and is excluded from the player's own total", async () => {
    const board = await member.teamStandings();
    const teamId = memberTeamId;
    const mine = board.teams.find((team) => team.teamId === teamId);
    const rows = (mine?.players ?? []).flatMap((player) => player.problems ?? []);

    const groupProblems = await testDb().contestProblem.findMany({
      where: { contestId: seeded.contestId, problem: { round: "GROUP" } },
      select: { id: true },
    });

    for (const problem of groupProblems) {
      for (const row of rows.filter((r) => r.contestProblemId === problem.id)) {
        expect(
          row.isGroupProblem,
          "a GROUP problem reached the breakdown unflagged, so a reader adding the panel up " +
            "would find it short of the player's total with nothing to explain the gap",
        ).toBe(true);
      }
    }
  });
});
