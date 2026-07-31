import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";

import {
  AdminRosterSchema,
  TeamMembershipResponseSchema,
  TeamViewSchema,
} from "@/lib/schemas/api";

import { ContestApi, readEnvelope, readOk } from "./helpers/api";
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

const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE ?? "";

/** Team formation closes at `startsAt`, and the fixture starts in the past. */
async function openFormation(contestId: string): Promise<void> {
  await testDb().contest.update({
    where: { id: contestId },
    data: { teamFormationClosesAt: new Date(Date.now() + 60 * 60_000) },
  });
}

async function closeFormation(contestId: string): Promise<void> {
  await testDb().contest.update({
    where: { id: contestId },
    data: { teamFormationClosesAt: new Date(Date.now() - 60_000) },
  });
}

/**
 * Parse a successful response against the real contract schema.
 *
 * `readOk` hands back the envelope; these narrow it. Parsing rather than casting is the point —
 * a route that drifts from `lib/schemas/api.ts` fails here rather than in a component.
 */
async function okMembership(response: APIResponse) {
  const { status, data } = await readOk(response);
  expect(status, "expected a successful response").toBeLessThan(400);
  return TeamMembershipResponseSchema.parse(data);
}

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
  const joined = await api.joinOrThrow({
    joinCode: seeded.joinCode,
    displayName,
    divisionId: seeded.divisionIds.get("intermediate") ?? null,
  });
  return { api, participantId: joined.participantId };
}

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();
  adminContext = await playwright.request.newContext();
  admin = new ContestApi(adminContext, seeded.contestId);
  if (ADMIN_PASSCODE !== "") await admin.adminLogin(ADMIN_PASSCODE);
});

test.afterAll(async () => {
  await adminContext.dispose();
  await closeTestDb();
});

test.describe("a student creates a team and teammates join by code", () => {
  test("create, then join with the code typed messily", async ({ playwright }) => {
    await openFormation(seeded.contestId);

    const alice = await newCompetitor(playwright, uniqueName("Alice"));
    const created = await okMembership(await alice.api.createTeamRaw({ name: uniqueName("Alpha") }));

    expect(created.team.members).toHaveLength(1);
    expect(created.team.joinCode).toMatch(/^[A-Z0-9]{6}$/);
    // No O/0 or I/1 anywhere in the alphabet: these are read aloud across a room.
    expect(created.team.joinCode).not.toMatch(/[OI01]/);

    const bob = await newCompetitor(playwright, uniqueName("Bob"));
    const messy = `${created.team.joinCode.toLowerCase().slice(0, 3)}-${created.team.joinCode
      .toLowerCase()
      .slice(3)}`;

    const joined = await okMembership(await bob.api.joinTeamRaw({ code: messy }));
    expect(joined.team.teamId).toBe(created.team.teamId);
    expect(joined.team.members).toHaveLength(2);
  });

  test("a second join with the same code is a no-op, not a second membership", async ({
    playwright,
  }) => {
    await openFormation(seeded.contestId);

    const alice = await newCompetitor(playwright, uniqueName("Idem"));
    const created = await okMembership(await alice.api.createTeamRaw({ name: uniqueName("Idem") }));

    const again = await okMembership(await alice.api.joinTeamRaw({ code: created.team.joinCode }));
    expect(again.alreadyMember).toBe(true);
    expect(again.team.members).toHaveLength(1);
  });

  test("guardrails: duplicate name, unknown code, already on a team, and the size limit", async ({
    playwright,
  }) => {
    await openFormation(seeded.contestId);

    const name = uniqueName("Guard");
    const alice = await newCompetitor(playwright, uniqueName("GuardAlice"));
    const created = await okMembership(await alice.api.createTeamRaw({ name }));

    const bob = await newCompetitor(playwright, uniqueName("GuardBob"));

    expect((await readEnvelope(await bob.api.createTeamRaw({ name }))).status).toBe(409);
    expect((await readEnvelope(await bob.api.joinTeamRaw({ code: "ZZZZZZ" }))).status).toBe(404);

    await okMembership(await bob.api.joinTeamRaw({ code: created.team.joinCode }));
    // Already on one: creating another must not silently abandon the team somebody is counting on.
    expect(
      (await readEnvelope(await bob.api.createTeamRaw({ name: uniqueName("Second") }))).status,
    ).toBe(409);

    // Size limit. Team size is the DIVISOR, so an oversized team dilutes every member's
    // contribution — refused at the door, where a student can still act on it.
    await testDb().contest.update({
      where: { id: seeded.contestId },
      data: { maxTeamSize: 2 },
    });
    const carol = await newCompetitor(playwright, uniqueName("GuardCarol"));
    const refused = await readEnvelope(
      await carol.api.joinTeamRaw({ code: created.team.joinCode }),
    );
    expect(refused.status).toBe(409);

    await testDb().contest.update({
      where: { id: seeded.contestId },
      data: { maxTeamSize: 4 },
    });
  });

  test("formation closes when the contest starts", async ({ playwright }) => {
    await openFormation(seeded.contestId);
    const late = await newCompetitor(playwright, uniqueName("Late"));

    await closeFormation(seeded.contestId);

    const refused = await readEnvelope(
      await late.api.createTeamRaw({ name: uniqueName("TooLate") }),
    );
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(refused.status).toBeLessThan(500);

    await openFormation(seeded.contestId);
  });
});

test.describe("a late joiner is given a problem set", () => {
  test("joining a team assigns a set, and joining again does not move it", async ({
    playwright,
  }) => {
    await openFormation(seeded.contestId);

    const alice = await newCompetitor(playwright, uniqueName("SetAlice"));
    const created = await okMembership(await alice.api.createTeamRaw({ name: uniqueName("SetTeam") }));

    const bob = await newCompetitor(playwright, uniqueName("SetBob"));
    const joined = await okMembership(await bob.api.joinTeamRaw({ code: created.team.joinCode }));

    // The fixture seeds `setAssignmentSeed`, so a joiner must come away with something to solve.
    expect(joined.chosenSetId).not.toBeNull();

    const stored = await testDb().participant.findUniqueOrThrow({
      where: { id: bob.participantId },
      select: { chosenSetId: true },
    });
    expect(stored.chosenSetId).toBe(joined.chosenSetId);

    /**
     * Idempotent. Leaving and rejoining must not re-draw the set — that is the T5 re-roll
     * reached through the team door, and it would let a student shop for a set by hopping teams.
     */
    await readOk(await bob.api.leaveTeamRaw());
    const afterLeave = await testDb().participant.findUniqueOrThrow({
      where: { id: bob.participantId },
      select: { chosenSetId: true },
    });
    expect(afterLeave.chosenSetId, "leaving took the set away").toBe(stored.chosenSetId);

    await okMembership(await bob.api.joinTeamRaw({ code: created.team.joinCode }));
    const afterRejoin = await testDb().participant.findUniqueOrThrow({
      where: { id: bob.participantId },
      select: { chosenSetId: true },
    });
    expect(afterRejoin.chosenSetId, "rejoining re-rolled the set").toBe(stored.chosenSetId);
  });
});

test.describe("an organizer moves a participant, and the mean follows", () => {
  test.skip(ADMIN_PASSCODE === "", "ADMIN_PASSCODE is not set");

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

    const to = boardBefore.teams.find((team) => team.teamId !== from.teamId);
    expect(to).toBeDefined();
    if (to === undefined) return;

    const mover = from.players[0];
    expect(mover).toBeDefined();
    if (mover === undefined) return;

    expect(before.teams.length).toBeGreaterThan(0);

    // The reason is REQUIRED. A roster change is a score change with extra steps.
    const noReason = await readEnvelope(
      await admin.moveParticipantRaw({
        participantId: mover.participantId,
        teamId: to.teamId,
      }),
    );
    expect(noReason.status).toBe(400);

    await readOk(
      await admin.moveParticipantRaw({
        participantId: mover.participantId,
        teamId: to.teamId,
        reason: "joined the wrong team at sign-in",
      }),
    );

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
    await readOk(
      await admin.moveParticipantRaw({
        participantId: mover.participantId,
        teamId: from.teamId,
        reason: "restoring the fixture after the move spec",
      }),
    );
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

    // A rename needs a reason too: the name is what appears on the projector and in the export,
    // so changing it after the fact changes what the record says happened.
    expect(
      (await readEnvelope(await admin.renameTeamRaw(created.teamId, { name: "x" }))).status,
    ).toBe(400);

    expect(
      (await readEnvelope(await admin.dissolveTeamRaw(created.teamId, {}))).status,
    ).toBe(400);

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
    const created = await okMembership(await alice.api.createTeamRaw({ name: uniqueName("Doomed") }));

    await readOk(
      await admin.dissolveTeamRaw(created.team.teamId, { reason: "merging two teams" }),
    );

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
