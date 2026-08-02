import { expect, test } from "@playwright/test";

import { ContestApi, readEnvelope, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";

/**
 * G7 — an organizer sets up a contest night from nothing, and a student can then compete in it.
 *
 * ## The gap this closes
 *
 * Contest creation was a dead end in three separate places, and each looked like it worked:
 *
 *  - `ContestBuilder` validated its draft and POSTed nowhere. Its success message read "Draft is
 *    valid. Wiring to the API lands with the admin routes."
 *  - Nothing anywhere wrote `ContestProblem`, so a created contest could never contain a problem.
 *    The problem bank's "Add to contest" button fired no request at all.
 *  - Nothing moved a contest out of `DRAFT`, so it could never start.
 *
 * The only runnable contests were the ones `scripts/seed-demo.ts` wrote. An organizer could press
 * every button on the setup screens and end up with nothing they could run.
 *
 * So this spec is the whole journey, in order, checked against the DATABASE at each step rather
 * than against a status code — a route that returns 200 and writes nothing is exactly the failure
 * being fixed.
 */

let seeded: SeededContest;
let admin: ContestApi;

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright }) => {
  // Seeded only for its PROBLEMS, which the new contest borrows. Problems are shared across
  // contests by design — the bank outlives any one night.
  seeded = await seedE2EContest();
  admin = new ContestApi(await playwright.request.newContext(), seeded.contestId);
  await admin.adminLogin(ADMIN_PASSCODE);
});

test.afterAll(async () => {
  await testDb().contest.deleteMany({ where: { name: { startsWith: "E2E Built " } } });
  await closeTestDb();
});

test.describe("an organizer builds a contest from nothing", () => {
  let builtId = "";

  test("creates it, and it is a DRAFT nobody can see yet", async () => {
    const name = `E2E Built ${Date.now()}`;
    const startsAt = new Date(Date.now() - 60_000);
    const endsAt = new Date(Date.now() + 3 * 60 * 60_000);

    const created = await readOk(
      await admin.createContestRaw({
        name,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        freezeAt: null,
        scoringPresetId: "classic",
        divisions: ["Intermediate", "Advanced"],
      }),
    );
    expect(created.status).toBe(200);
    builtId = (created.data as { contestId: string }).contestId;
    expect(builtId).not.toBe("");

    const row = await testDb().contest.findUniqueOrThrow({
      where: { id: builtId },
      select: { name: true, state: true, scoringPresetId: true, divisions: true },
    });
    expect(row.name).toBe(name);
    // DRAFT, not published. Creating and publishing in one step would put a contest with no
    // problems in front of students between two clicks.
    expect(row.state).toBe("DRAFT");
    // The ENGINE's preset id, not the form's short one. `lib/contest/standings.ts` maps anything
    // that is not "icpc" onto the classic preset, so writing "classic" here would silently score
    // an ICPC contest with classic rules.
    expect(row.scoringPresetId).toBe("coding-night-classic");
    expect(row.divisions).toHaveLength(2);
  });

  test("refuses to publish it while it has no problems", async () => {
    const envelope = await readEnvelope(
      await admin.setContestStateRaw(builtId, "SCHEDULED", "E2E: should be refused"),
    );
    expect(envelope.status).toBeGreaterThanOrEqual(400);
    expect(envelope.status).toBeLessThan(500);
    expect((envelope.message ?? "").toLowerCase()).toContain("no problems");

    // The refusal is the point: a published contest with an empty line-up is the failure that
    // looks most like success — students sign in, see nothing, and blame the platform.
    const state = await testDb().contest.findUniqueOrThrow({
      where: { id: builtId },
      select: { state: true },
    });
    expect(state.state).toBe("DRAFT");
  });

  test("refuses to publish a line-up containing an unfinished question", async () => {
    const problem = await testDb().problem.findFirstOrThrow({
      where: { state: "PUBLISHED" },
      orderBy: { slug: "asc" },
      select: { id: true, state: true },
    });
    await testDb().problem.update({ where: { id: problem.id }, data: { state: "DRAFT" } });

    try {
      await readOk(
        await admin.setContestProblemsRaw(builtId, {
          reason: "E2E: deliberately unfinished question",
          problems: [
            {
              problemId: problem.id,
              slotLabel: "A1",
              basePoints: 100,
              round: "INDIVIDUAL",
              setLabel: "A",
              divisionId: null,
            },
          ],
        }),
      );
      const response = await readEnvelope(
        await admin.setContestStateRaw(builtId, "SCHEDULED", "E2E: reject draft question"),
      );
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect((response.message ?? "").toLowerCase()).toContain("not published");
      expect(
        (await testDb().contest.findUniqueOrThrow({
          where: { id: builtId },
          select: { state: true },
        })).state,
      ).toBe("DRAFT");
    } finally {
      await testDb().problem.update({ where: { id: problem.id }, data: { state: problem.state } });
    }
  });

  test("takes a line-up, including a GROUP problem and two sets", async () => {
    const problems = await testDb().problem.findMany({
      where: { state: "PUBLISHED" },
      take: 3,
      orderBy: { slug: "asc" },
      select: { id: true, slug: true },
    });
    expect(problems.length, "the bank has too few problems to build a line-up").toBe(3);

    const response = await readOk(
      await admin.setContestProblemsRaw(builtId, {
        reason: "E2E: initial line-up",
        problems: [
          { problemId: problems[0]!.id, slotLabel: "A1", basePoints: 100, round: "INDIVIDUAL", setLabel: "A", divisionId: null },
          { problemId: problems[1]!.id, slotLabel: "B1", basePoints: 100, round: "INDIVIDUAL", setLabel: "B", divisionId: null },
          // Round is contest-scoped and explicit. The null set is the compatible visibility fact,
          // not a second hidden way to decide how scoring treats the question.
          { problemId: problems[2]!.id, slotLabel: "Group 1", basePoints: 150, round: "GROUP", setLabel: null, divisionId: null },
        ],
      }),
    );
    expect(response.status).toBe(200);

    const rows = await testDb().contestProblem.findMany({
      where: { contestId: builtId },
      select: { slotLabel: true, basePoints: true, round: true, setId: true, set: { select: { label: true } } },
      orderBy: { slotLabel: "asc" },
    });
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.setId === null)).toHaveLength(1);
    expect(rows.filter((r) => r.round === "GROUP")).toHaveLength(1);
    expect(new Set(rows.map((r) => r.set?.label).filter(Boolean))).toEqual(new Set(["A", "B"]));

    // The sets were created on demand and are contest-scoped.
    const sets = await testDb().problemSet.findMany({
      where: { contestId: builtId },
      select: { label: true },
    });
    expect(new Set(sets.map((s) => s.label))).toEqual(new Set(["A", "B"]));
  });

  test("scores the line-up's GROUP choice once for the team", async ({ playwright }) => {
    const db = testDb();
    const groupProblem = await db.contestProblem.findFirstOrThrow({
      where: { contestId: builtId, round: "GROUP" },
      select: { id: true, basePoints: true },
    });
    const sets = await db.problemSet.findMany({
      where: { contestId: builtId },
      orderBy: { label: "asc" },
      select: { id: true },
    });
    const team = await db.team.create({
      data: { contestId: builtId, name: "Round-trip team", joinCode: "ROUND1" },
      select: { id: true },
    });
    const players = await Promise.all(
      ["Round-trip one", "Round-trip two"].map((displayName, index) =>
        db.participant.create({
          data: {
            contestId: builtId,
            displayName,
            teamId: team.id,
            chosenSetId: sets[index]?.id ?? null,
          },
          select: { id: true },
        }),
      ),
    );

    // Both teammates may press Submit on shared work. Scoring must take the team's best answer
    // once, not add one copy to each player's individual total.
    await db.submission.createMany({
      data: players.map((player, index) => ({
        participantId: player.id,
        contestProblemId: groupProblem.id,
        language: "PYTHON_312" as const,
        sourceCode: `# group submitter ${String(index + 1)}`,
        verdict: "AC" as const,
        score: groupProblem.basePoints,
        effectiveAt: new Date(),
      })),
    });

    const builtAdmin = new ContestApi(await playwright.request.newContext(), builtId);
    await builtAdmin.adminLogin(ADMIN_PASSCODE);
    const board = await builtAdmin.teamStandings();
    const scored = board.teams.find((entry) => entry.teamId === team.id);

    expect(scored).toBeDefined();
    expect(scored?.groupPoints).toBe(groupProblem.basePoints);
    expect(scored?.players.map((player) => player.score)).toEqual([0, 0]);
    expect(scored?.score).toBe(groupProblem.basePoints / players.length);

    // This team exists only to prove the scoring round-trip. Remove it before the lifecycle test
    // below, which deliberately replaces the line-up and invalidates these assignments.
    await db.participant.deleteMany({ where: { id: { in: players.map((player) => player.id) } } });
    await db.team.delete({ where: { id: team.id } });
  });

  test("setting the line-up again REPLACES it rather than duplicating", async () => {
    const problems = await testDb().problem.findMany({
      where: { state: "PUBLISHED" },
      take: 2,
      orderBy: { slug: "asc" },
      select: { id: true },
    });

    // ContestProblem is unique on (contestId, problemId, divisionId), so an append would throw
    // the second time an organizer pressed save and leave the contest half-updated.
    await readOk(
      await admin.setContestProblemsRaw(builtId, {
        reason: "E2E: trimmed line-up",
        problems: [
          { problemId: problems[0]!.id, slotLabel: "A1", basePoints: 100, round: "INDIVIDUAL", setLabel: "A", divisionId: null },
          { problemId: problems[1]!.id, slotLabel: "Group 1", basePoints: 150, round: "GROUP", setLabel: null, divisionId: null },
        ],
      }),
    );

    const rows = await testDb().contestProblem.findMany({ where: { contestId: builtId } });
    expect(rows, "the second save appended instead of replacing").toHaveLength(2);
  });

  test("publishes, opens, and a student can then see and enter it", async ({ playwright }) => {
    expect((await readEnvelope(await admin.setContestStateRaw(builtId, "SCHEDULED", "E2E: publish"))).status).toBe(200);
    expect((await readEnvelope(await admin.setContestStateRaw(builtId, "RUNNING", "E2E: open"))).status).toBe(200);

    const state = await testDb().contest.findUniqueOrThrow({
      where: { id: builtId },
      select: { state: true },
    });
    expect(state.state).toBe("RUNNING");

    // And the end of the journey: a real student, in the contest the organizer just built,
    // reading a problem list that is not empty.
    const student = new ContestApi(await playwright.request.newContext(), builtId);
    await student.signIn({ displayName: `E2E BuiltStudent ${Date.now()}`, divisionId: null });

    const problems = await student.listProblems();
    expect(
      problems.length,
      "the organizer built a contest and a student sees nothing in it",
    ).toBeGreaterThan(0);
  });

  test("starting a FUTURE-scheduled contest early slides its whole window to now", async () => {
    // The organizer's report, reproduced and then fixed: they published a contest scheduled for
    // later, pressed Start, and every submission still answered "This contest has not started
    // yet". setContestState wrote only the state column, so state said RUNNING while the window
    // said not-yet, and assertCanSubmit reads the window. Starting early must move the window.
    const name = `E2E Built Future ${Date.now()}`;
    const startsAt = new Date(Date.now() + 6 * 60 * 60_000); // six hours out
    const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60_000); // a two-hour contest

    const created = await readOk(
      await admin.createContestRaw({
        name,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        freezeAt: null,
        scoringPresetId: "classic",
        divisions: ["Intermediate", "Advanced"],
      }),
    );
    const futureId = (created.data as { contestId: string }).contestId;

    const problems = await testDb().problem.findMany({
      where: { state: "PUBLISHED" },
      take: 1,
      orderBy: { slug: "asc" },
      select: { id: true },
    });
    await readOk(
      await admin.setContestProblemsRaw(futureId, {
        reason: "E2E: future line-up",
        problems: [
          { problemId: problems[0]!.id, slotLabel: "A1", basePoints: 100, round: "INDIVIDUAL", setLabel: "A", divisionId: null },
        ],
      }),
    );

    const before = Date.now();
    await readOk(await admin.setContestStateRaw(futureId, "SCHEDULED", "E2E: publish future"));
    await readOk(await admin.setContestStateRaw(futureId, "RUNNING", "E2E: open future early"));
    const after = Date.now();

    const row = await testDb().contest.findUniqueOrThrow({
      where: { id: futureId },
      select: { state: true, startsAt: true, endsAt: true },
    });
    expect(row.state).toBe("RUNNING");
    // startsAt is now (within the wall-clock of the two calls), not six hours out.
    expect(row.startsAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(row.startsAt.getTime()).toBeLessThanOrEqual(after + 1000);
    // The planned two-hour DURATION is preserved: endsAt is ~2h after the new start, not the
    // original 8-hours-from-now.
    const durationMs = row.endsAt.getTime() - row.startsAt.getTime();
    expect(Math.abs(durationMs - 2 * 60 * 60_000)).toBeLessThan(5000);

    await testDb().contest.deleteMany({ where: { id: futureId } });
  });

  test("starting late inside the scheduled window still gives the configured duration", async () => {
    const plannedStart = new Date(Date.now() + 60 * 60_000);
    const durationMs = 2 * 60 * 60_000;
    const created = await readOk(
      await admin.createContestRaw({
        name: `E2E Built Late Start ${Date.now()}`,
        startsAt: plannedStart.toISOString(),
        endsAt: new Date(plannedStart.getTime() + durationMs).toISOString(),
        freezeAt: new Date(plannedStart.getTime() + 90 * 60_000).toISOString(),
        scoringPresetId: "classic",
        divisions: [],
      }),
    );
    const contestId = (created.data as { contestId: string }).contestId;
    const problem = await testDb().problem.findFirstOrThrow({
      where: { state: "PUBLISHED" },
      orderBy: { slug: "asc" },
      select: { id: true },
    });

    await readOk(
      await admin.setContestProblemsRaw(contestId, {
        reason: "E2E: late-start line-up",
        problems: [
          {
            problemId: problem.id,
            slotLabel: "A1",
            basePoints: 100,
            round: "INDIVIDUAL",
            setLabel: "A",
            divisionId: null,
          },
        ],
      }),
    );
    await readOk(await admin.setContestStateRaw(contestId, "SCHEDULED", "E2E: publish late"));

    // Put the published contest thirty minutes into its two-hour scheduled window. This is the
    // branch that previously kept the old clock and quietly gave competitors only 90 minutes.
    const oldStart = new Date(Date.now() - 30 * 60_000);
    await testDb().contest.update({
      where: { id: contestId },
      data: {
        startsAt: oldStart,
        endsAt: new Date(oldStart.getTime() + durationMs),
        freezeAt: new Date(oldStart.getTime() + 90 * 60_000),
      },
    });

    const before = Date.now();
    await readOk(await admin.setContestStateRaw(contestId, "RUNNING", "E2E: start late"));
    const after = Date.now();
    const row = await testDb().contest.findUniqueOrThrow({
      where: { id: contestId },
      select: { startsAt: true, endsAt: true, freezeAt: true },
    });

    expect(row.startsAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(row.startsAt.getTime()).toBeLessThanOrEqual(after + 1000);
    expect(row.endsAt.getTime() - row.startsAt.getTime()).toBe(durationMs);
    expect((row.freezeAt?.getTime() ?? 0) - row.startsAt.getTime()).toBe(90 * 60_000);

    await testDb().contest.delete({ where: { id: contestId } });
  });

  test("starting an expired rehearsal restores a usable full contest window", async () => {
    const startsAt = new Date(Date.now() + 60 * 60_000);
    const created = await readOk(
      await admin.createContestRaw({
        name: `E2E Built Expired ${Date.now()}`,
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 2 * 60 * 60_000).toISOString(),
        freezeAt: new Date(startsAt.getTime() + 90 * 60_000).toISOString(),
        scoringPresetId: "classic",
        divisions: [],
      }),
    );
    const contestId = (created.data as { contestId: string }).contestId;
    const problem = await testDb().problem.findFirstOrThrow({
      where: { state: "PUBLISHED" },
      orderBy: { slug: "asc" },
      select: { id: true },
    });
    await readOk(
      await admin.setContestProblemsRaw(contestId, {
        reason: "E2E: expired rehearsal line-up",
        problems: [
          {
            problemId: problem.id,
            slotLabel: "A1",
            basePoints: 100,
            round: "INDIVIDUAL",
            setLabel: "A",
            divisionId: null,
          },
        ],
      }),
    );
    await readOk(
      await admin.setContestStateRaw(contestId, "SCHEDULED", "E2E: publish rehearsal"),
    );

    const oldStart = new Date(Date.now() - 3 * 60 * 60_000);
    await testDb().contest.update({
      where: { id: contestId },
      data: {
        startsAt: oldStart,
        endsAt: new Date(oldStart.getTime() + 2 * 60 * 60_000),
        freezeAt: new Date(oldStart.getTime() + 90 * 60_000),
      },
    });

    const before = Date.now();
    await readOk(
      await admin.setContestStateRaw(contestId, "RUNNING", "E2E: restart expired rehearsal"),
    );
    const after = Date.now();
    const row = await testDb().contest.findUniqueOrThrow({
      where: { id: contestId },
      select: { state: true, startsAt: true, endsAt: true, freezeAt: true },
    });
    expect(row.state).toBe("RUNNING");
    expect(row.startsAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(row.startsAt.getTime()).toBeLessThanOrEqual(after + 1000);
    expect(row.endsAt.getTime() - row.startsAt.getTime()).toBe(2 * 60 * 60_000);
    expect((row.freezeAt?.getTime() ?? 0) - row.startsAt.getTime()).toBe(90 * 60_000);

    await testDb().contest.delete({ where: { id: contestId } });
  });

  test("refuses to start while teammates share an individual set", async () => {
    const db = testDb();
    const startsAt = new Date(Date.now() + 60 * 60_000);
    const created = await readOk(
      await admin.createContestRaw({
        name: `E2E Built Duplicate Sets ${Date.now()}`,
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
        freezeAt: null,
        scoringPresetId: "classic",
        divisions: [],
      }),
    );
    const contestId = (created.data as { contestId: string }).contestId;
    const problems = await db.problem.findMany({
      where: { state: "PUBLISHED" },
      take: 2,
      orderBy: { slug: "asc" },
      select: { id: true },
    });
    expect(problems).toHaveLength(2);

    await readOk(
      await admin.setContestProblemsRaw(contestId, {
        reason: "E2E: two shared sets",
        problems: [
          { problemId: problems[0]!.id, slotLabel: "A1", basePoints: 100, round: "INDIVIDUAL", setLabel: "A", divisionId: null },
          { problemId: problems[1]!.id, slotLabel: "B1", basePoints: 100, round: "INDIVIDUAL", setLabel: "B", divisionId: null },
        ],
      }),
    );
    const setA = await db.problemSet.findFirstOrThrow({
      where: { contestId, label: "A" },
      select: { id: true },
    });
    const team = await db.team.create({
      data: { contestId, name: "Duplicate set team", joinCode: `DUP${Date.now()}` },
      select: { id: true },
    });
    await db.participant.createMany({
      data: ["One", "Two"].map((displayName) => ({
        contestId,
        displayName,
        teamId: team.id,
        chosenSetId: setA.id,
      })),
    });

    await readOk(
      await admin.setContestStateRaw(contestId, "SCHEDULED", "E2E: publish invalid roster"),
    );
    const start = await readEnvelope(
      await admin.setContestStateRaw(contestId, "RUNNING", "E2E: reject duplicate sets"),
    );
    expect(start.status).toBeGreaterThanOrEqual(400);
    expect(start.status).toBeLessThan(500);
    expect((start.message ?? "").toLowerCase()).toContain("same set");
    expect(
      (await db.contest.findUniqueOrThrow({ where: { id: contestId }, select: { state: true } }))
        .state,
    ).toBe("SCHEDULED");

    // Sharing is the rule, not an error, in the alternate whole-team format. The invariant is
    // scoped to RANDOM_ASSIGNED rather than accidentally banning a documented contest mode.
    await db.contest.update({
      where: { id: contestId },
      data: { setSelection: "ONE_SET_PER_TEAM" },
    });
    expect(
      (await readEnvelope(
        await admin.setContestStateRaw(contestId, "RUNNING", "E2E: shared team set is valid"),
      )).status,
    ).toBe(200);

    await db.contest.delete({ where: { id: contestId } });
  });

  test("refuses a line-up change once the contest is running", async () => {
    const envelope = await readEnvelope(
      await admin.setContestProblemsRaw(builtId, { reason: "E2E: too late", problems: [] }),
    );
    // Changing what is scoreable underneath submissions that already exist is not an edit, it is
    // a rewrite of the contest.
    expect(envelope.status).toBeGreaterThanOrEqual(400);
    expect(envelope.status).toBeLessThan(500);
  });
});
