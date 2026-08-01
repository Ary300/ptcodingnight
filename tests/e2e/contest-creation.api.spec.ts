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
          { problemId: problems[0]!.id, slotLabel: "A1", basePoints: 100, setLabel: "A", divisionId: null },
          { problemId: problems[1]!.id, slotLabel: "B1", basePoints: 100, setLabel: "B", divisionId: null },
          // setLabel null is a GROUP problem: every team works it regardless of assignment. That
          // distinction is the whole Coding Night format, so it is asserted rather than assumed.
          { problemId: problems[2]!.id, slotLabel: "Group 1", basePoints: 150, setLabel: null, divisionId: null },
        ],
      }),
    );
    expect(response.status).toBe(200);

    const rows = await testDb().contestProblem.findMany({
      where: { contestId: builtId },
      select: { slotLabel: true, basePoints: true, setId: true, set: { select: { label: true } } },
      orderBy: { slotLabel: "asc" },
    });
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.setId === null)).toHaveLength(1);
    expect(new Set(rows.map((r) => r.set?.label).filter(Boolean))).toEqual(new Set(["A", "B"]));

    // The sets were created on demand and are contest-scoped.
    const sets = await testDb().problemSet.findMany({
      where: { contestId: builtId },
      select: { label: true },
    });
    expect(new Set(sets.map((s) => s.label))).toEqual(new Set(["A", "B"]));
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
          { problemId: problems[0]!.id, slotLabel: "A1", basePoints: 100, setLabel: "A", divisionId: null },
          { problemId: problems[1]!.id, slotLabel: "Group 1", basePoints: 150, setLabel: null, divisionId: null },
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
          { problemId: problems[0]!.id, slotLabel: "A1", basePoints: 100, setLabel: null, divisionId: null },
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
