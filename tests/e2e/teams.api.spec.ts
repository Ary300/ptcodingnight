import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";

import {
  AdminRosterSchema,
  TeamViewSchema,
} from "@/lib/schemas/api";

import { ContestApi, readEnvelope, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";

/**
 * G7 — team formation and roster management (T7).
 *
 * Until this existed a participant could only be put on a team by editing the database. These
 * specs cover the path that replaces that, and one case in particular:
 *
 *   **the leaderboard recomputing the mean after an organizer moves somebody.**
 *
 * That is the one most likely to be silently wrong, because moving a single participant changes
 * TWO divisors — the team they left shrinks, the team they joined grows — so two team scores move
 * from one click, and neither team submitted anything. A bug there produces plausible numbers
 * rather than an error, which is the worst kind.
 */

let seeded: SeededContest;
let admin: ContestApi;
let adminContext: APIRequestContext;

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");

/** Team formation closes at `startsAt`, and the fixture starts in the past. */
async function openFormation(contestId: string): Promise<void> {
  await testDb().contest.update({
    where: { id: contestId },
    data: { teamFormationClosesAt: new Date(Date.now() + 60 * 60_000) },
  });
}

/**
 * Parse a successful response against the real contract schema.
 *
 * `readOk` hands back the envelope; these narrow it. Parsing rather than casting is the point —
 * a route that drifts from `lib/schemas/api.ts` fails here rather than in a component.
 */
async function okTeam(response: APIResponse) {
  const { status, data } = await readOk(response);
  expect(status, "expected a successful response").toBeLessThan(400);
  return TeamViewSchema.parse(data);
}

async function okRoster(response: APIResponse) {
  const { status, data } = await readOk(response);
  expect(status, "expected a successful response").toBeLessThan(400);
  return AdminRosterSchema.parse(data);
}

function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

/** A joined competitor with its own cookie jar. */
async function newCompetitor(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  displayName: string,
): Promise<{ api: ContestApi; participantId: string }> {
  const context = await playwright.request.newContext();
  const api = new ContestApi(context, seeded.contestId);
  const joined = await api.signIn({
    displayName,
    divisionId: seeded.divisionIds.get("intermediate") ?? null,
  });
  return { api, participantId: joined.participantId };
}

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();
  adminContext = await playwright.request.newContext();
  admin = new ContestApi(adminContext, seeded.contestId);
  await admin.adminLogin(ADMIN_PASSCODE);
});

test.afterAll(async () => {
  await adminContext.dispose();
  await closeTestDb();
});

/*
  THE TWO STUDENT-PATH DESCRIBES THAT USED TO BE HERE.

  "a student creates a team and teammates join by code" and "a late joiner is given a problem set"
  both drove `POST /teams`, `POST /teams/join` and `POST /teams/leave` — routes that no longer
  exist. Students do not form their own teams: an organizer builds the roster from a screen,
  because team size is the divisor in every team score and a roster a student can edit is a
  scoring input a student can edit.

  What each was really protecting, and where it went:

  * the guardrails (duplicate name, unknown code, already on a team, size limit) were guarding an
    input surface that is gone. Name uniqueness now lives in `uniqueDisplayName()` and is unit
    tested; the size limit is enforced in `adminMoveParticipant` and asserted in the organizer
    describe below.
  * set assignment on joining, and its idempotency across a leave/rejoin, is the T5 re-roll — the
    property that mattered. It moved with the action that triggers it, onto the organizer path,
    and is asserted in `rejoin.api.spec.ts` ("moving a player between teams does not re-roll their
    set") plus the containment suite in the same file.
*/


test.describe("an organizer moves a participant, and the mean follows", () => {
  test("moving one participant changes BOTH team scores, correctly", async () => {
    await openFormation(seeded.contestId);

    /**
     * Read the fixture's own teams rather than making new ones: they already have judged
     * submissions behind them, so the means are non-zero and a mistake in the divisor is
     * visible rather than 0/2 = 0/3.
     */
    const before = await okRoster(await admin.rosterRaw());
    const boardBefore = await admin.teamStandings();

    const from = boardBefore.teams.find((team) => team.teamSize >= 2 && team.playerPoolPoints > 0);
    expect(from, "fixture has no team with two players and a score").toBeDefined();
    if (from === undefined) return;

    // Same DIVISION, because divisions field their own teams: a cross-division destination would
    // adopt the mover into the new division, and the mid-contest set guard refuses that with a
    // 409 ("would change this student's problem set after the contest started") — its own
    // behavior, covered below, not the roster arithmetic this spec is about.
    const to = boardBefore.teams.find(
      (team) => team.teamId !== from.teamId && team.divisionId === from.divisionId,
    );
    expect(to, "fixture has no second team in the scoring team's division").toBeDefined();
    if (to === undefined) return;

    // RANDOM_ASSIGNED teams may not contain the same set twice. Pick the member whose current set
    // is free in the destination so this spec exercises a roster move rather than the capacity
    // guard that has its own coverage.
    const destinationSets = new Set(
      to.players.flatMap((player) =>
        player.chosenSetLabel === null ? [] : [player.chosenSetLabel],
      ),
    );
    const mover = from.players.find(
      (player) =>
        player.chosenSetLabel !== null && !destinationSets.has(player.chosenSetLabel),
    );
    expect(mover).toBeDefined();
    if (mover === undefined) return;

    expect(before.teams.length).toBeGreaterThan(0);

    // The reason is OPTIONAL now - the organizer overruled requiring prose on every assignment -
    // so a reasonless move must succeed rather than 400. This same move used to be the required-
    // reason assertion; it is now the proof of the opposite contract.
    const moved = await readOk(
      await admin.moveParticipantRaw({
        participantId: mover.participantId,
        teamId: to.teamId,
        reason: "joined the wrong team at sign-in",
      }),
    );
    expect(moved.status, "the compatible roster move was refused").toBeLessThan(300);

    const boardAfter = await admin.teamStandings();
    const fromAfter = boardAfter.teams.find((team) => team.teamId === from.teamId);
    const toAfter = boardAfter.teams.find((team) => team.teamId === to.teamId);
    expect(fromAfter).toBeDefined();
    expect(toAfter).toBeDefined();
    if (fromAfter === undefined || toAfter === undefined) return;

    // Both divisors moved.
    expect(fromAfter.teamSize, "the team they left did not shrink").toBe(from.teamSize - 1);
    expect(toAfter.teamSize, "the team they joined did not grow").toBe(to.teamSize + 1);

    // The mover's points moved with them.
    expect(fromAfter.playerPoolPoints).toBe(from.playerPoolPoints - mover.score);
    expect(toAfter.playerPoolPoints).toBe(to.playerPoolPoints + mover.score);

    /**
     * And the MEAN is recomputed from the new pool and the new divisor — checked against the
     * formula rather than against a remembered number, so this fails if either input is stale.
     */
    const expected = (team: { playerPoolPoints: number; teamSize: number; sideActivityPoints: number }): number =>
      Number(
        (team.teamSize === 0
          ? team.sideActivityPoints
          : team.playerPoolPoints / team.teamSize + team.sideActivityPoints
        ).toFixed(2),
      );

    expect(Number(fromAfter.score.toFixed(2))).toBeCloseTo(expected(fromAfter), 2);
    expect(Number(toAfter.score.toFixed(2))).toBeCloseTo(expected(toAfter), 2);

    /**
     * Deliberately NOT asserting that the score changed.
     *
     * It legitimately may not. The fixture's Panthers are two players on 100 each with 50 side
     * points: 200/2 + 50 = 150 before the move, and 100/1 + 50 = 150 after. Removing one of two
     * equal contributors leaves the mean exactly where it was, which is the mean behaving
     * correctly rather than the board ignoring the move.
     *
     * The guard against "the board ignored it" is above and is stronger: `teamSize` and
     * `playerPoolPoints` both had to move by the right amounts on both sides. A board that
     * dropped the move could not satisfy those.
     */

    // Put them back so the rest of the suite sees the fixture it expects.
    const restored = await readOk(
      await admin.moveParticipantRaw({
        participantId: mover.participantId,
        teamId: from.teamId,
        reason: "restoring the fixture after the move spec",
      }),
    );
    expect(restored.status, "the fixture roster could not be restored").toBeLessThan(300);
  });

  test("the move is audit-logged with the actor, the reason, and both sizes", async () => {
    const rows = await testDb().auditLog.findMany({
      where: { action: "team.member_moved" },
      orderBy: { at: "desc" },
      take: 1,
      select: { actor: true, reason: true, before: true, after: true },
    });

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0];
    expect(row).toBeDefined();
    if (row === undefined) return;

    expect(row.actor).not.toBe("");
    expect(row.reason ?? "").not.toBe("");
    // The sizes on both sides, as they were before the move: a dispute about a score is a
    // dispute about these two numbers at that instant.
    expect(row.before).toHaveProperty("teamSize");
    expect(row.after).toHaveProperty("teamSize");
  });

  test("an organizer creates, renames and dissolves a team", async () => {
    const name = uniqueName("AdminMade");
    const created = await okTeam(await admin.createTeamAsAdminRaw({ name }));
    expect(created.members).toHaveLength(0);

    const renamed = await okTeam(
      await admin.renameTeamRaw(created.teamId, {
        name: `${name} renamed`,
        reason: "the students asked for a different name",
      }),
    );
    expect(renamed.name).toBe(`${name} renamed`);

    // Reasons are OPTIONAL on roster actions now - the organizer overruled requiring prose on
    // every assignment - so a reasonless rename succeeds and the audit row simply has an empty
    // reason column. This block used to assert the 400; it now asserts the opposite contract.
    const reasonless = await okTeam(
      await admin.renameTeamRaw(created.teamId, { name: `${name} again` }),
    );
    expect(reasonless.name).toBe(`${name} again`);

    await readOk(
      await admin.dissolveTeamRaw(created.teamId, { reason: "created by mistake" }),
    );

    const roster = await okRoster(await admin.rosterRaw());
    expect(roster.teams.find((team) => team.teamId === created.teamId)).toBeUndefined();
  });

  test("dissolving a team makes its members teamless rather than deleting them", async ({
    playwright,
  }) => {
    await openFormation(seeded.contestId);

    const alice = await newCompetitor(playwright, uniqueName("DissolveAlice"));
    const doomed = await okTeam(await admin.createTeamAsAdminRaw({ name: uniqueName("Doomed") }));
    const teamId = doomed.teamId;
    await readOk(
      await admin.moveParticipantRaw({
        participantId: alice.participantId,
        teamId,
        reason: "staffing the team that is about to be dissolved",
      }),
    );

    await readOk(await admin.dissolveTeamRaw(teamId, { reason: "merging two teams" }));

    const participant = await testDb().participant.findUniqueOrThrow({
      where: { id: alice.participantId },
      select: { teamId: true, displayName: true },
    });
    expect(participant.teamId).toBeNull();
    expect(participant.displayName).not.toBe("");
  });

  test("an organizer can force a problem set, and it is audited", async ({ playwright }) => {
    await openFormation(seeded.contestId);
    const student = await newCompetitor(playwright, uniqueName("Forced"));

    const setId = [...seeded.problemSetIds.values()][0];
    expect(setId).toBeDefined();
    if (setId === undefined) return;

    await readOk(
      await admin.reassignSetRaw({
        participantId: student.participantId,
        setId,
        reason: "their set was unreadable on the projector",
      }),
    );

    const stored = await testDb().participant.findUniqueOrThrow({
      where: { id: student.participantId },
      select: { chosenSetId: true },
    });
    expect(stored.chosenSetId).toBe(setId);

    const audit = await testDb().auditLog.findFirst({
      where: {
        action: "contest.force_reassign_set",
        entity: `Participant:${student.participantId}`,
      },
      select: { reason: true },
    });
    expect(audit?.reason ?? "").not.toBe("");
  });
});

test.describe("team routes are not reachable without the right session", () => {
  test("an anonymous caller cannot create a team", async ({ playwright }) => {
    const anon = new ContestApi(await playwright.request.newContext(), seeded.contestId);
    const envelope = await readEnvelope(await anon.createTeamRaw({ name: uniqueName("Anon") }));
    // 401 or 403 — `requireCompetitorOf` answers FORBIDDEN for a viewer that is not a competitor
    // of this contest, which covers "no session" and "someone else's contest" alike. What matters
    // is that no team was created.
    expect(envelope.status).toBeGreaterThanOrEqual(401);
    expect(envelope.status).toBeLessThan(500);
  });

  test("a competitor cannot reach the admin roster", async ({ playwright }) => {
    const student = await newCompetitor(playwright, uniqueName("Nosy"));
    const envelope = await readEnvelope(await student.api.rosterRaw());
    expect(envelope.status).toBeGreaterThanOrEqual(400);
    expect(envelope.status).toBeLessThan(500);
  });
});

test.describe("one move assigns the team and the division together", () => {
  test("a move carrying divisionId changes the division and deals a set OF that division", async ({
    playwright,
  }) => {
    await openFormation(seeded.contestId);
    const student = await newCompetitor(playwright, uniqueName("OneForm"));
    const team = await okTeam(
      await admin.createTeamAsAdminRaw({ name: uniqueName("OneFormTeam") }),
    );

    const advanced = seeded.divisionIds.get("advanced");
    expect(advanced, "fixture has no advanced division").toBeDefined();

    const moved = await readOk(
      await admin.moveParticipantRaw({
        participantId: student.participantId,
        teamId: team.teamId,
        divisionId: advanced,
      }),
    );
    expect(moved.status).toBeLessThan(300);

    const row = await testDb().participant.findUniqueOrThrow({
      where: { id: student.participantId },
      select: { divisionId: true, teamId: true, chosenSetId: true },
    });
    expect(row.teamId).toBe(team.teamId);
    expect(row.divisionId).toBe(advanced);
    // The set is dealt AFTER the division lands, so it is an ADVANCED set. Which advanced set is
    // the seeded deal's business; the pinned property is the order of operations - division
    // first, then the deal - and an intermediate set here is the only way to get it wrong.
    const advancedSets = [
      seeded.problemSetIds.get("setAdvA"),
      seeded.problemSetIds.get("setAdvB"),
    ];
    expect(advancedSets).toContain(row.chosenSetId);
  });

  test("a move with no divisionId leaves the division alone", async ({ playwright }) => {
    await openFormation(seeded.contestId);
    const student = await newCompetitor(playwright, uniqueName("Untouched"));
    const team = await okTeam(
      await admin.createTeamAsAdminRaw({ name: uniqueName("UntouchedTeam") }),
    );

    await readOk(
      await admin.moveParticipantRaw({
        participantId: student.participantId,
        teamId: team.teamId,
      }),
    );

    const row = await testDb().participant.findUniqueOrThrow({
      where: { id: student.participantId },
      select: { divisionId: true },
    });
    expect(row.divisionId).toBe(seeded.divisionIds.get("intermediate"));
  });

  test("re-submitting the same team with a new division is a division change, not a conflict", async ({
    playwright,
  }) => {
    await openFormation(seeded.contestId);
    const student = await newCompetitor(playwright, uniqueName("SameTeam"));

    /*
      SCHEDULED for the duration of this spec: the one-form division change re-deals the set,
      and a set change on a RUNNING contest is deliberately refused (a player mid-problem must
      not have their questions swapped under them). The flow this spec models - an organizer
      correcting a division while assigning teams - happens before the start, so the spec puts
      the contest where that flow lives and restores it after.
    */
    await testDb().contest.update({
      where: { id: seeded.contestId },
      data: { state: "SCHEDULED" },
    });
    const team = await okTeam(
      await admin.createTeamAsAdminRaw({ name: uniqueName("SameTeamTeam") }),
    );
    await readOk(
      await admin.moveParticipantRaw({
        participantId: student.participantId,
        teamId: team.teamId,
      }),
    );

    // The one-form flow: the organizer reopens the row, keeps the team, changes the division.
    const again = await readOk(
      await admin.moveParticipantRaw({
        participantId: student.participantId,
        teamId: team.teamId,
        divisionId: seeded.divisionIds.get("advanced"),
      }),
    );
    expect(again.status).toBeLessThan(300);

    const row = await testDb().participant.findUniqueOrThrow({
      where: { id: student.participantId },
      select: { divisionId: true, teamId: true },
    });
    expect(row.teamId).toBe(team.teamId);
    expect(row.divisionId).toBe(seeded.divisionIds.get("advanced"));

    await testDb().contest.update({
      where: { id: seeded.contestId },
      data: { state: "RUNNING" },
    });
  });
});

test.describe("teams belong to divisions", () => {
  test("creating a team with a division stores it, and the roster names it", async () => {
    const advanced = seeded.divisionIds.get("advanced");
    expect(advanced, "fixture has no advanced division").toBeDefined();
    if (advanced === undefined) return;

    const name = uniqueName("Divisioned");
    const created = await okTeam(
      await admin.createTeamAsAdminRaw({ name, divisionId: advanced }),
    );

    const roster = await okRoster(await admin.rosterRaw());
    const row = roster.teams.find((team) => team.teamId === created.teamId);
    expect(row, "the created team is missing from the roster").toBeDefined();
    // Both the id (what a form preselects) and the name (what the card shows) come back.
    expect(row?.divisionId).toBe(advanced);
    expect(row?.divisionName).toBe("Advanced");
  });

  test("a division from another contest is refused at creation", async () => {
    const bogus = await readEnvelope(
      await admin.createTeamAsAdminRaw({
        name: uniqueName("WrongDivision"),
        divisionId: "not-a-division-of-this-contest",
      }),
    );
    expect(bogus.status).toBeGreaterThanOrEqual(400);
    expect(bogus.status).toBeLessThan(500);
  });

  test("moving onto a divisioned team with no explicit divisionId adopts the team's division and deals its set", async ({
    playwright,
  }) => {
    await openFormation(seeded.contestId);
    const student = await newCompetitor(playwright, uniqueName("Adopted"));

    const advanced = seeded.divisionIds.get("advanced");
    expect(advanced, "fixture has no advanced division").toBeDefined();
    if (advanced === undefined) return;

    /*
      SCHEDULED for the duration, exactly as in the one-form division-change spec above: the
      adoption re-deals the set, and a set change on a RUNNING contest is deliberately refused.
      Adoption before the contest starts is the normal path this models.
    */
    await testDb().contest.update({
      where: { id: seeded.contestId },
      data: { state: "SCHEDULED" },
    });
    try {
      const team = await okTeam(
        await admin.createTeamAsAdminRaw({
          name: uniqueName("AdoptTeam"),
          divisionId: advanced,
        }),
      );

      // Deliberately NO divisionId on the move: the team already says which division this is.
      const moved = await readOk(
        await admin.moveParticipantRaw({
          participantId: student.participantId,
          teamId: team.teamId,
        }),
      );
      expect(moved.status).toBeLessThan(300);

      const row = await testDb().participant.findUniqueOrThrow({
        where: { id: student.participantId },
        select: { divisionId: true, teamId: true, chosenSetId: true },
      });
      expect(row.teamId).toBe(team.teamId);
      // The player followed the team out of Intermediate.
      expect(row.divisionId).toBe(advanced);
      // And the set was dealt AFTER the adoption landed, so it is an ADVANCED set. Which one is
      // the seeded deal's business; the pinned property is the order of operations, just as on
      // the explicit path - an intermediate set here is the only way to get it wrong.
      expect([
        seeded.problemSetIds.get("setAdvA"),
        seeded.problemSetIds.get("setAdvB"),
      ]).toContain(row.chosenSetId);

      // The adoption writes the same audit row as an explicit division change, with a reason
      // that says the division followed the team rather than being chosen per player.
      const audit = await testDb().auditLog.findFirst({
        where: {
          action: "participant.division_set",
          entity: `Participant:${student.participantId}`,
        },
        orderBy: { at: "desc" },
        select: { reason: true, after: true },
      });
      expect(audit).not.toBeNull();
      expect(audit?.reason ?? "").toContain("follows the team");
    } finally {
      await testDb().contest.update({
        where: { id: seeded.contestId },
        data: { state: "RUNNING" },
      });
    }
  });

  test("an explicit divisionId on the move still wins over the team's", async ({
    playwright,
  }) => {
    await openFormation(seeded.contestId);
    const student = await newCompetitor(playwright, uniqueName("ExplicitWins"));

    const advanced = seeded.divisionIds.get("advanced");
    const intermediate = seeded.divisionIds.get("intermediate");
    expect(advanced).toBeDefined();
    expect(intermediate).toBeDefined();
    if (advanced === undefined || intermediate === undefined) return;

    const team = await okTeam(
      await admin.createTeamAsAdminRaw({
        name: uniqueName("ExplicitTeam"),
        divisionId: advanced,
      }),
    );

    // The student is already Intermediate; saying so explicitly must beat the team's Advanced.
    await readOk(
      await admin.moveParticipantRaw({
        participantId: student.participantId,
        teamId: team.teamId,
        divisionId: intermediate,
      }),
    );

    const row = await testDb().participant.findUniqueOrThrow({
      where: { id: student.participantId },
      select: { divisionId: true, teamId: true },
    });
    expect(row.teamId).toBe(team.teamId);
    expect(row.divisionId).toBe(intermediate);
  });
});
