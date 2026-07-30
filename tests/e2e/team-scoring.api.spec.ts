import { expect, test } from "@playwright/test";

import { ContestApi, readEnvelope, readOk } from "./helpers/api";
import { closeTestDb, seedE2EContest, type SeededContest } from "./helpers/seed";

/**
 * G7 — team scoring through the HTTP routes, against a real Postgres.
 *
 * The contest is team-based, and the team formula is the whole reason this platform exists (PRD §6.1):
 *
 *     teamScore = (sum of all player points, group problems included) / teamSize
 *                 + sideActivityPoints
 *
 * `lib/scoring/team.test.ts` proves the arithmetic against a hand-computed fixture. This proves the
 * arithmetic **survives the route**: the query, the config flags read off the contest row, the
 * serialization, and the freeze. A scoring engine that is right in a unit test and wrong over HTTP
 * is wrong.
 *
 * Fixture rosters (fixtures/e2e/contest.json):
 *
 *   Panthers  Ada 100, Grace 100 (after one WA)  size 2  side 20 + 30
 *   Cubs      Hopper 100                          size 1  side none
 *   Nomad     100, NO TEAM
 *
 *   Panthers = 200 / 2 + 50 = 150.00
 *   Cubs     = 100 / 1      = 100.00
 */

let seeded: SeededContest;
let anon: ContestApi;
let admin: ContestApi;

const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE ?? "";

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();

  const anonContext = await playwright.request.newContext();
  const adminContext = await playwright.request.newContext();

  anon = new ContestApi(anonContext, seeded.contestId);
  admin = new ContestApi(adminContext, seeded.contestId);

  if (ADMIN_PASSCODE !== "") await admin.adminLogin(ADMIN_PASSCODE);
});

test.afterAll(async () => {
  await closeTestDb();
});

test.describe("the team board", () => {
  test("computes the team score from the confirmed formula", async () => {
    const board = await anon.teamStandings();

    const panthers = board.teams.find((team) => team.name === "E2E Panthers");
    expect(panthers, "no Panthers row on the board").toBeDefined();
    if (panthers === undefined) return;

    // 200 / 2 + 50. Asserted on scoreHundredths as well as score: the hundredths are what the
    // engine ranks by, and a float bug would show up there first.
    expect(panthers.scoreHundredths).toBe(15_000);
    expect(panthers.score).toBe(150);
    expect(panthers.teamSize).toBe(2);
    expect(panthers.playerPoolPoints).toBe(200);
    expect(panthers.sideActivityPoints).toBe(50);
  });

  test("divides by the team's actual size, so a team of one is not flattered", async () => {
    const board = await anon.teamStandings();
    const cubs = board.teams.find((team) => team.name === "E2E Cubs");

    expect(cubs?.teamSize).toBe(1);
    expect(cubs?.score).toBe(100);
  });

  test("ranks the higher team first and never ties them arbitrarily", async () => {
    const board = await anon.teamStandings();

    expect(board.teams[0]?.name).toBe("E2E Panthers");
    expect(board.teams[0]?.rank).toBe(1);
    expect(board.teams[1]?.name).toBe("E2E Cubs");
    expect(board.teams[1]?.rank).toBe(2);
    // Different scores, so neither is tied. A board that flagged these as tied would be hiding a
    // comparison bug behind a plausible-looking display.
    expect(board.teams.every((team) => !team.isTied)).toBe(true);
  });

  test("excludes a participant who is on no team", async () => {
    // Nomad scored 100 — as much as anyone — and must contribute to no team total. A null teamId is
    // the shape a mid-contest roster edit leaves behind, and silently folding them into some team
    // would change that team's divisor as well as its pool.
    const board = await anon.teamStandings();

    const total = board.teams.reduce((sum, team) => sum + team.scoreHundredths, 0);
    expect(total).toBe(15_000 + 10_000);

    for (const team of board.teams) {
      expect(team.players.map((player) => player.displayName)).not.toContain("E2E Nomad");
    }
  });

  test("sends the arithmetic, not just the total", async () => {
    // PRD §9.1: a student who can see how the mean was computed does not have to trust it, and the
    // spreadsheet this replaced got that arithmetic wrong by 31.25 points.
    const board = await anon.teamStandings();
    const panthers = board.teams.find((team) => team.name === "E2E Panthers");

    expect(panthers?.playerPoolPoints).toBeDefined();
    expect(panthers?.groupPoints).toBeDefined();
    expect(panthers?.sideActivityPoints).toBeDefined();
    expect(panthers?.teamSize).toBeDefined();

    // Each member's own line, with the set they were assigned.
    const names = panthers?.players.map((p) => p.displayName) ?? [];
    expect(names).toContain("E2E Ada");
    expect(names).toContain("E2E Grace");
    expect(panthers?.players.map((p) => p.chosenSetLabel).sort()).toEqual(["A", "B"]);
  });

  test("never reproduces the spreadsheet's dropped-group-points answer", async () => {
    // The historical error was `individualSum / size + side`, omitting group points. This fixture
    // has no group solves, so the two formulas agree here — which is exactly why this asserts the
    // FIELD is present and populated rather than asserting a number. If groupPoints vanished from
    // the payload, the UI could not show it and the error class would be invisible again.
    const board = await anon.teamStandings();
    const panthers = board.teams.find((team) => team.name === "E2E Panthers");

    expect(panthers?.groupPoints).toBe(0);
    expect(Object.keys(panthers ?? {})).toContain("groupPoints");
  });

  test("is readable with no login, because the projector has none", async () => {
    const envelope = await readEnvelope(await anon.teamStandingsRaw());
    expect(envelope.status).toBe(200);
  });
});

test.describe("problem sets are enforced by the API", () => {
  let ada: ContestApi;

  test.beforeAll(async ({ playwright }) => {
    // Join as a fresh competitor, WITH a division.
    //
    // Joining with `divisionId: null` puts every fixture problem out of scope, because they all
    // carry a division and `inScope` refuses a divisioned problem to a player with none. The first
    // version of this spec did that and read as "the set filter hides everything" when the division
    // filter was doing the hiding — two filters, one empty list, and no way to tell them apart.
    const context = await playwright.request.newContext();
    ada = new ContestApi(context, seeded.contestId);

    const divisionId = seeded.divisionIds.get("intermediate") ?? null;
    expect(divisionId, "fixture has no intermediate division").not.toBeNull();

    await ada.joinOrThrow({
      joinCode: seeded.joinCode,
      displayName: `E2E SetProbe ${Date.now()}`,
      divisionId,
    });
  });

  test("tells a joining player which set they were assigned", async ({ playwright }) => {
    const context = await playwright.request.newContext();
    const api = new ContestApi(context, seeded.contestId);

    const joined = await api.joinOrThrow({
      joinCode: seeded.joinCode,
      displayName: `E2E Told ${Date.now()}`,
      divisionId: seeded.divisionIds.get("intermediate") ?? null,
    });

    // Assigned, not chosen. The student is informed; there is no picker, because sets are never
    // previewed (PRD §6.2).
    expect(joined.chosenSetLabel).not.toBeNull();
    expect(["A", "B"]).toContain(joined.chosenSetLabel);
    // And they are told they have no team, because a teamless player scores for nobody.
    expect(joined.needsTeam).toBe(true);
  });

  test("lists only the player's own set, plus the group problem", async () => {
    const problems = await ada.listProblems();
    const slugs = problems.map((problem) => problem.slug);

    // The group problem belongs to no set, so everyone may see it. It is the control: if it were
    // also hidden, this suite would be measuring "everything is hidden" rather than the rule.
    expect(slugs).toContain("e2e-group-problem");

    // Exactly one of the two set problems, never both.
    const setProblems = slugs.filter((slug) =>
      ["e2e-panther-sum", "e2e-other-set"].includes(slug),
    );
    expect(setProblems).toHaveLength(1);
  });

  test("refuses the statement of a set the player was not assigned", async () => {
    const problems = await ada.listProblems();
    const visible = new Set(problems.map((problem) => problem.slug));

    const hidden = ["e2e-panther-sum", "e2e-other-set"].find((slug) => !visible.has(slug));
    expect(hidden, "the fixture gave this player both set problems").toBeDefined();
    if (hidden === undefined) return;

    // Absent from the list is not enough. This route returns a full statement and is callable
    // directly, so a set a competitor can read is a set they can practise on before their round.
    const envelope = await readEnvelope(await ada.getProblemRaw(hidden));
    expect(envelope.status).toBeGreaterThanOrEqual(400);
    expect(envelope.status).toBeLessThan(500);
  });

  test("refuses a submission to a set the player was not assigned", async () => {
    // Reading another set is a fairness problem; SCORING on it is a correctness one.
    const problems = await ada.listProblems();
    const visible = new Set(problems.map((problem) => problem.slug));
    const hidden = ["e2e-panther-sum", "e2e-other-set"].find((slug) => !visible.has(slug));
    if (hidden === undefined) return;

    const hiddenProblem = seeded.problems.get(hidden);
    expect(hiddenProblem).toBeDefined();
    if (hiddenProblem === undefined) return;

    for (const [label, response] of [
      ["submit", await ada.submitRaw({
        contestProblemId: hiddenProblem.contestProblemId,
        language: "PYTHON_312",
        sourceCode: "print(1)",
      })],
      ["run-samples", await ada.runSamplesRaw({
        contestProblemId: hiddenProblem.contestProblemId,
        language: "PYTHON_312",
        sourceCode: "print(1)",
      })],
    ] as const) {
      const envelope = await readEnvelope(response);
      expect(envelope.status, `${label} accepted a submission to an unassigned set`)
        .toBeGreaterThanOrEqual(400);
    }
  });
});

test.describe("set assignment is explainable", () => {
  test.skip(ADMIN_PASSCODE === "", "ADMIN_PASSCODE is not set");

  test("re-derives the stored assignment from the stored seed", async () => {
    // The property the whole design exists for: when a student disputes their set, an organizer
    // recomputes it from a seed fixed before anyone knew the rosters (PRD §6.2).
    const envelope = await readOk(await admin.reDeriveAssignmentRaw());
    expect(envelope.status).toBe(200);

    const body = envelope.data as { seed: string; matchesStored: boolean; derived: unknown[] };
    expect(body.seed.length).toBeGreaterThan(0);
    expect(Array.isArray(body.derived)).toBe(true);
  });

  test("refuses a competitor, because the response lists the whole room's sets", async () => {
    const envelope = await readEnvelope(await anon.reDeriveAssignmentRaw());
    expect(envelope.status).toBeGreaterThanOrEqual(400);
  });

  test("refuses a second assignment unless it is asked for explicitly", async () => {
    // Re-rolling moves students off problems they may already have started, so it must not be the
    // result of a double-clicked button.
    const envelope = await readEnvelope(await admin.assignSetsRaw({}));
    expect(envelope.status).toBeGreaterThanOrEqual(400);
    expect(envelope.status).toBeLessThan(500);
  });
});

test.describe("side activities", () => {
  test.skip(ADMIN_PASSCODE === "", "ADMIN_PASSCODE is not set");

  test("an organizer can award points and the team board moves", async () => {
    const teamId = seeded.teamIds.get("cubs");
    expect(teamId).toBeDefined();
    if (teamId === undefined) return;

    const before = await anon.teamStandings();
    const cubsBefore = before.teams.find((team) => team.teamId === teamId);
    expect(cubsBefore?.sideActivityPoints).toBe(0);

    const created = await readEnvelope(
      await admin.addSideActivityRaw(teamId, { label: "Connections", points: 40 }),
    );
    expect(created.status).toBe(200);

    const after = await anon.teamStandings();
    const cubsAfter = after.teams.find((team) => team.teamId === teamId);

    // Flat, not divided: Cubs are a team of one here, so flat and divided would agree — assert the
    // field as well as the total so the distinction is actually covered.
    expect(cubsAfter?.sideActivityPoints).toBe(40);
    expect(cubsAfter?.score).toBe((cubsBefore?.score ?? 0) + 40);
  });

  test("refuses a competitor", async () => {
    const teamId = seeded.teamIds.get("cubs");
    if (teamId === undefined) return;

    const envelope = await readEnvelope(
      await anon.addSideActivityRaw(teamId, { label: "Sneaky", points: 999 }),
    );
    expect(envelope.status).toBeGreaterThanOrEqual(400);
  });

  test("rejects an absurd point value rather than letting a typo decide the contest", async () => {
    // Side activity points are added flat, so they are not diluted by team size the way a problem
    // score is. A typo of 8000 for 80 would silently decide the night.
    const teamId = seeded.teamIds.get("cubs");
    if (teamId === undefined) return;

    const envelope = await readEnvelope(
      await admin.addSideActivityRaw(teamId, { label: "Typo", points: 100_000 }),
    );
    expect(envelope.status).toBeGreaterThanOrEqual(400);
    expect(envelope.status).toBeLessThan(500);
  });

  test("records who entered it, because nothing else proves it happened", async () => {
    const teamId = seeded.teamIds.get("panthers");
    if (teamId === undefined) return;

    const envelope = await readOk(await admin.sideActivitiesRaw(teamId));
    expect(envelope.status).toBe(200);

    const body = envelope.data as {
      activities: { label: string; points: number; enteredBy: string }[];
      total: number;
    };

    expect(body.total).toBe(50);
    for (const activity of body.activities) {
      expect(activity.enteredBy.length).toBeGreaterThan(0);
    }
  });
});
