import { expect, test, type APIRequestContext } from "@playwright/test";

import {
  AddableUsersSchema,
  AdminRemoveParticipantResponseSchema,
  AdminRosterSchema,
} from "@/lib/schemas/api";
import { contestsForUser, ensureEnrolled } from "@/lib/contest/enrolment";

import { ContestApi, readEnvelope, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, liveProblem, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";

/**
 * G7 — an organizer builds a roster BEFORE the contest starts, and the student lands in it.
 *
 * ## The defect
 *
 * A `Participant` row belongs to exactly one contest and was created in exactly one place:
 * `ensureEnrolled`, at sign-in. `adminRoster` lists participants of the contest it is given, so a
 * contest created this morning contained nobody and could contain nobody. In the organizer's
 * words: "I ended Park Tudor Coding Night - Demo and created Test2 and wanted it to start but I
 * could not add any of the people who participated in the Demo to Test2 ... I could only add
 * people if they signed up or signed in AFTER the contest had started."
 *
 * The student half is the same root cause seen from the other end: a session carries ONE
 * `contestId`, chosen at sign-in by looking only at contest state, so a student an organizer had
 * just put on a team in a new contest signed in and landed somewhere else — "This contest has not
 * started yet" on one side of the screen while the standings beside it listed them.
 *
 * ## Why every assertion here reads the database
 *
 * A route that answers 200 and writes nothing is the exact failure being fixed. The old screen
 * responded to every action; what it did not do was create a row. So each step below drives the
 * real HTTP route and then goes and looks.
 */

let seeded: SeededContest;
let adminContext: APIRequestContext;
let admin: ContestApi;

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");

/** Everything this file creates is named with this prefix, so the cleanup cannot reach further. */
const MARK = `E2E Roster ${String(Date.now())}`;

test.describe.configure({ mode: "serial" });

interface KnownUser {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
}

let previousContestId = "";
let previousContestName = "";
let nextContestId = "";
let decoyContestId = "";
let veteran: KnownUser;

/** An account that exists in the school, as one does before any contest is created for it. */
async function createUser(label: string, gradYear: number): Promise<KnownUser> {
  const displayName = `${MARK} ${label}`;
  const email = `${label.toLowerCase()}.${String(Date.now())}@e2e.invalid`;
  const user = await testDb().user.create({
    data: { displayName, email, gradYear, role: "COMPETITOR" },
    select: { id: true },
  });
  return { userId: user.id, displayName, email };
}

async function createContest(name: string, startsAt: Date, endsAt: Date): Promise<string> {
  const created = await readOk(
    await admin.createContestRaw({
      name,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      freezeAt: null,
      scoringPresetId: "classic",
      divisions: ["Intermediate"],
    }),
  );
  expect(created.status, "creating a contest").toBe(200);
  return (created.data as { contestId: string }).contestId;
}

function participantsUrl(contestId: string): string {
  return `/api/admin/contests/${contestId}/participants`;
}

async function roster(contestId: string) {
  const { status, data } = await readOk(
    await adminContext.get(`/api/admin/contests/${contestId}/roster`),
  );
  expect(status).toBe(200);
  return AdminRosterSchema.parse(data);
}

async function addable(contestId: string, query: string) {
  const { status, data } = await readOk(
    await adminContext.get(`${participantsUrl(contestId)}?q=${encodeURIComponent(query)}`),
  );
  expect(status).toBe(200);
  return AddableUsersSchema.parse(data);
}

test.beforeAll(async ({ playwright }) => {
  // Seeded for its PROBLEMS and its live window: the removal case needs a contest a submission can
  // legitimately belong to, and problems are shared across contests by design.
  seeded = await seedE2EContest();
  adminContext = await playwright.request.newContext();
  admin = new ContestApi(adminContext, seeded.contestId);
  await admin.adminLogin(ADMIN_PASSCODE);

  veteran = await createUser("Veteran", 2027);

  previousContestName = `${MARK} Demo`;
  previousContestId = await createContest(
    previousContestName,
    new Date(Date.now() - 3 * 60 * 60_000),
    new Date(Date.now() + 60 * 60_000),
  );
});

test.afterAll(async () => {
  const db = testDb();
  await db.contest.deleteMany({ where: { name: { startsWith: MARK } } });
  await db.user.deleteMany({ where: { displayName: { startsWith: MARK } } });
  await db.participant.deleteMany({ where: { displayName: { startsWith: MARK } } });
  await adminContext.dispose();
  await closeTestDb();
});

test.describe("an organizer adds a known account to a contest nobody has signed into", () => {
  test("the veteran competes in the first contest, then that contest ends", async () => {
    const added = await adminContext.post(participantsUrl(previousContestId), {
      data: { userId: veteran.userId },
    });
    expect(added.status()).toBe(200);

    const row = await testDb().participant.findFirst({
      where: { contestId: previousContestId, userId: veteran.userId },
      select: { id: true, teamId: true },
    });
    expect(row, "the participant row the roster lists").not.toBeNull();
    // Added with no team, exactly as at sign-in: a participant on no team is in nobody's divisor,
    // so building a roster early cannot move a score.
    expect(row?.teamId).toBeNull();

    /*
      Ended by writing the row rather than through `POST /state`.

      `setContestState` refuses DRAFT to ENDED and refuses SCHEDULED without a line-up, and this
      contest deliberately has no problems in it. The state is the precondition under test, not
      the transition, and the transition has its own spec.
    */
    await testDb().contest.update({
      where: { id: previousContestId },
      data: { state: "ENDED" },
    });
  });

  test("the new contest starts empty and the veteran is findable in it", async () => {
    nextContestId = await createContest(
      `${MARK} Test2`,
      // Tomorrow. The whole point is that a roster is built before the window opens.
      new Date(Date.now() + 24 * 60 * 60_000),
      new Date(Date.now() + 27 * 60 * 60_000),
    );

    const state = await testDb().contest.findUniqueOrThrow({
      where: { id: nextContestId },
      select: { state: true },
    });
    // DRAFT, and everything below has to work anyway. "On the day of the competition we would want
    // to add people and assign problems and do all that BEFORE the contest starts."
    expect(state.state).toBe("DRAFT");

    const empty = await roster(nextContestId);
    expect(empty.unassigned).toHaveLength(0);
    expect(empty.teams).toHaveLength(0);

    const found = await addable(nextContestId, `${MARK} Veteran`);
    const match = found.users.find((user) => user.userId === veteran.userId);
    expect(match, "a person who competed in the last contest must be addable to this one").toBeDefined();
    expect(match?.email).toBe(veteran.email);
    expect(match?.gradYear).toBe(2027);
    // The field that tells two students with the same name apart, and the organizer's own way of
    // describing who they wanted: "the people who participated in the Demo".
    expect(match?.pastContests).toContain(previousContestName);
  });

  test("adding them WRITES a participant row in the new contest", async () => {
    const response = await adminContext.post(participantsUrl(nextContestId), {
      data: { userId: veteran.userId },
    });
    expect(response.status()).toBe(200);

    const rows = await testDb().participant.findMany({
      where: { contestId: nextContestId, userId: veteran.userId },
      select: { id: true, displayName: true, teamId: true },
    });
    expect(rows, "exactly one participant per person per contest").toHaveLength(1);
    expect(rows[0]?.teamId).toBeNull();

    // One account, two contests. Adding somebody to a contest must never touch the account or the
    // participant row that belongs to a different one.
    const everywhere = await testDb().participant.findMany({
      where: { userId: veteran.userId },
      select: { contestId: true },
    });
    expect(everywhere.map((row) => row.contestId).sort()).toEqual(
      [previousContestId, nextContestId].sort(),
    );

    const users = await testDb().user.count({ where: { email: veteran.email } });
    expect(users, "no account was merged or duplicated").toBe(1);

    const shown = await roster(nextContestId);
    const listed = shown.unassigned.find((p) => p.participantId === rows[0]?.id);
    expect(listed?.email).toBe(veteran.email);
    expect(listed?.submissionCount).toBe(0);
  });

  test("adding the same person twice does not mint a rival participant", async () => {
    const again = await adminContext.post(participantsUrl(nextContestId), {
      data: { userId: veteran.userId },
    });
    expect(again.status(), "idempotent, because a double-clicked button is one intent").toBe(200);

    const rows = await testDb().participant.count({
      where: { contestId: nextContestId, userId: veteran.userId },
    });
    expect(rows).toBe(1);

    // And they drop out of the search, so the button cannot be pressed a third time on a person
    // who is already in.
    const found = await addable(nextContestId, `${MARK} Veteran`);
    expect(found.users.map((user) => user.userId)).not.toContain(veteran.userId);
  });

  test("a SCHEDULED contest accepts additions too, and an ENDED one does not", async () => {
    const scheduled = await createUser("Scheduled", 2028);

    await testDb().contest.update({ where: { id: nextContestId }, data: { state: "SCHEDULED" } });
    const ok = await adminContext.post(participantsUrl(nextContestId), {
      data: { userId: scheduled.userId },
    });
    expect(ok.status()).toBe(200);
    expect(
      await testDb().participant.count({
        where: { contestId: nextContestId, userId: scheduled.userId },
      }),
    ).toBe(1);
    // Leave it published. DRAFT contests are organizer-only and must never become an automatic
    // sign-in target; SCHEDULED is the state that supports a student's pre-start lobby.

    // The one state worth refusing: a competitor added to a finished contest has no possible
    // submission and a place in a divisor that has already been published.
    const latecomer = await createUser("Latecomer", 2029);
    const refused = await readEnvelope(
      await adminContext.post(participantsUrl(previousContestId), {
        data: { userId: latecomer.userId },
      }),
    );
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(
      await testDb().participant.count({
        where: { contestId: previousContestId, userId: latecomer.userId },
      }),
      "a refused add must write nothing",
    ).toBe(0);
  });

  test("a rostered participant can be put on a team before the contest starts", async () => {
    const created = await readOk(
      await adminContext.post(`/api/admin/contests/${nextContestId}/teams`, {
        data: { name: `${MARK} Panthers` },
      }),
    );
    expect(created.status).toBe(200);
    const teamId = (created.data as { teamId: string }).teamId;

    const participant = await testDb().participant.findFirstOrThrow({
      where: { contestId: nextContestId, userId: veteran.userId },
      select: { id: true },
    });

    const moved = await adminContext.post(`/api/admin/contests/${nextContestId}/roster/move`, {
      data: {
        participantId: participant.id,
        teamId,
        reason: "Building the roster before the start",
      },
    });
    expect(moved.status()).toBe(200);

    const after = await testDb().participant.findUniqueOrThrow({
      where: { id: participant.id },
      select: { teamId: true },
    });
    expect(after.teamId, "team size is the divisor, so this is the write that matters").toBe(teamId);
  });
});

test.describe("the student then lands in the contest they were rostered into", () => {
  test("pre-start sign-in follows the roster rather than another scheduled contest", async () => {
    // A contest the veteran is NOT in, scheduled at the same sort of time. Before the fix this
    // kind of row is what sign-in chose from, because the choice looked only at contest state.
    decoyContestId = await createContest(
      `${MARK} Decoy`,
      new Date(Date.now() + 25 * 60 * 60_000),
      new Date(Date.now() + 28 * 60 * 60_000),
    );
    await testDb().contest.update({
      where: { id: decoyContestId },
      data: { state: "SCHEDULED" },
    });

    const next = await testDb().contest.findUniqueOrThrow({
      where: { id: nextContestId },
      select: { startsAt: true },
    });
    // At the real wall clock, the seeded E2E event is actively running and correctly wins. Move
    // the injected clock to just before these two future events to isolate the pre-start rule:
    // among scheduled contests, the organizer's roster decision wins.
    const justBeforeNext = new Date(next.startsAt.getTime() - 5 * 60_000);
    const enrolment = await ensureEnrolled(veteran.userId, veteran.displayName, justBeforeNext);
    expect(enrolment, "a student with a roster place must not be refused").not.toBeNull();
    expect(
      enrolment?.contestId,
      "the contest an organizer rostered them into beats an unrelated one",
    ).toBe(nextContestId);
    // `created: false` is the assertion that no second participant was minted for them.
    expect(enrolment?.created).toBe(false);

    expect(
      await testDb().participant.count({
        where: { contestId: decoyContestId, userId: veteran.userId },
      }),
      "signing in must not enrol a student in a contest nobody put them in",
    ).toBe(0);
  });

  test("a contest that has ended is never chosen, however recent", async () => {
    const choices = await contestsForUser(veteran.userId);
    expect(choices.map((choice) => choice.contestId)).not.toContain(previousContestId);
  });

  test("DRAFT and future live-looking contests are never automatic sign-in targets", async () => {
    const now = new Date();
    const student = await createUser("BadStateTarget", 2033);
    const draftId = await createContest(
      `${MARK} Private Draft`,
      new Date(now.getTime() - 5 * 60_000),
      new Date(now.getTime() + 55 * 60_000),
    );
    const futureIds = await Promise.all(
      (["RUNNING", "FROZEN"] as const).map(async (state, index) => {
        const id = await createContest(
          `${MARK} Future ${state}`,
          new Date(now.getTime() + (index + 2) * 60 * 60_000),
          new Date(now.getTime() + (index + 3) * 60 * 60_000),
        );
        await testDb().contest.update({ where: { id }, data: { state } });
        return id;
      }),
    );

    // Even an existing roster row cannot make an organizer-only draft or a future row whose
    // state disagrees with its clock become the active session contest.
    await testDb().participant.createMany({
      data: [draftId, ...futureIds].map((contestId, index) => ({
        contestId,
        userId: student.userId,
        displayName: `${student.displayName} ${String(index + 1)}`,
      })),
    });

    const choices = await contestsForUser(student.userId, now);
    const choiceIds = choices.map((choice) => choice.contestId);
    for (const excludedId of [draftId, ...futureIds]) {
      expect(choiceIds).not.toContain(excludedId);
    }
  });

  test("a contest happening now beats a rostered future SCHEDULED contest", async () => {
    const now = new Date();
    const student = await createUser("ClockPriority", 2034);
    const currentId = await createContest(
      `${MARK} Current Window`,
      new Date(now.getTime() - 10 * 60_000),
      new Date(now.getTime() + 50 * 60_000),
    );
    const upcomingId = await createContest(
      `${MARK} Upcoming Rostered`,
      new Date(now.getTime() + 60 * 60_000),
      new Date(now.getTime() + 2 * 60 * 60_000),
    );
    await testDb().contest.update({ where: { id: currentId }, data: { state: "RUNNING" } });
    await testDb().contest.update({ where: { id: upcomingId }, data: { state: "SCHEDULED" } });
    await testDb().participant.create({
      data: {
        contestId: upcomingId,
        userId: student.userId,
        displayName: student.displayName,
      },
    });

    const choices = await contestsForUser(student.userId, now);
    const ids = choices.map((choice) => choice.contestId);
    expect(ids).toContain(currentId);
    expect(ids).toContain(upcomingId);
    expect(ids.indexOf(currentId)).toBeLessThan(ids.indexOf(upcomingId));
    expect(choices.find((choice) => choice.contestId === upcomingId)?.alreadyParticipant).toBe(
      true,
    );
  });

  test("a student genuinely in two open contests gets both, best first", async () => {
    // Rostered into the decoy as well: now the ambiguity is real rather than hypothetical, and the
    // rule has to be able to hand the student a list instead of guessing silently.
    const response = await adminContext.post(participantsUrl(decoyContestId), {
      data: { userId: veteran.userId },
    });
    expect(response.status()).toBe(200);

    const next = await testDb().contest.findUniqueOrThrow({
      where: { id: nextContestId },
      select: { startsAt: true },
    });
    const choices = await contestsForUser(
      veteran.userId,
      new Date(next.startsAt.getTime() - 5 * 60_000),
    );
    const mine = choices.filter((choice) => choice.alreadyParticipant);
    expect(mine.map((choice) => choice.contestId)).toEqual(
      expect.arrayContaining([nextContestId, decoyContestId]),
    );
    // Ranked, not merely returned: with no contest in its actual window at this injected clock,
    // an existing roster place heads the scheduled choices.
    expect(choices[0]?.alreadyParticipant).toBe(true);

    // Cleaned up so the removal tests below have one unambiguous contest to work in.
    const stray = await testDb().participant.findFirstOrThrow({
      where: { contestId: decoyContestId, userId: veteran.userId },
      select: { id: true },
    });
    await testDb().participant.delete({ where: { id: stray.id } });
  });

  test("a brand new account still lands in a contest that is running now", async () => {
    /*
      The property the old ordering was introduced to fix, and it has to survive the new one: a
      student who is a participant of nothing has no roster preference to apply, so the clock
      decides.

      Asserted as "the window contains now and the state is live" rather than as a specific
      contest id. This database is shared, and a second contest whose window also contains now
      makes the two indistinguishable on every key the rule uses — pinning one id would be
      asserting the `startsAt desc` tie-break, which is not the property under test and is not a
      promise this rule makes.
    */
    const newcomer = await createUser("Newcomer", 2030);
    const enrolment = await ensureEnrolled(newcomer.userId, newcomer.displayName);
    expect(enrolment?.created, "a first sign-in creates the participant").toBe(true);

    const landed = await testDb().contest.findUniqueOrThrow({
      where: { id: enrolment?.contestId ?? "" },
      select: { state: true, startsAt: true, endsAt: true },
    });
    const now = Date.now();
    expect(landed.startsAt.getTime()).toBeLessThanOrEqual(now);
    expect(landed.endsAt.getTime()).toBeGreaterThan(now);
    expect(["RUNNING", "FROZEN"]).toContain(landed.state);

    const created = await testDb().participant.findFirstOrThrow({
      where: { userId: newcomer.userId },
      select: { id: true },
    });
    await testDb().participant.delete({ where: { id: created.id } });
  });
});

test.describe("removing somebody says what happens to their submissions", () => {
  test("a participant with no submissions is removed outright", async () => {
    const spare = await createUser("Spare", 2031);
    await adminContext.post(participantsUrl(nextContestId), { data: { userId: spare.userId } });
    const participant = await testDb().participant.findFirstOrThrow({
      where: { contestId: nextContestId, userId: spare.userId },
      select: { id: true },
    });

    const { status, data } = await readOk(
      await adminContext.delete(participantsUrl(nextContestId), {
        data: {
          participantId: participant.id,
          reason: "Signed up for the wrong night",
          deleteSubmissions: false,
        },
      }),
    );
    expect(status).toBe(200);
    const body = AdminRemoveParticipantResponseSchema.parse(data);
    expect(body.removed.submissionsDeleted).toBe(0);

    expect(
      await testDb().participant.count({ where: { id: participant.id } }),
      "removal has to delete the row, not just answer 200",
    ).toBe(0);
    // The account survives. Removing somebody from a contest is not deleting a person.
    expect(await testDb().user.count({ where: { id: spare.userId } })).toBe(1);
  });

  test("a participant WITH submissions is refused until the deletion is confirmed", async () => {
    const worker = await createUser("Worker", 2032);
    // In the seeded contest, because a submission needs a problem that is really in the contest.
    await adminContext.post(participantsUrl(seeded.contestId), { data: { userId: worker.userId } });
    const participant = await testDb().participant.findFirstOrThrow({
      where: { contestId: seeded.contestId, userId: worker.userId },
      select: { id: true },
    });

    const submission = await testDb().submission.create({
      data: {
        participantId: participant.id,
        contestProblemId: liveProblem(seeded).contestProblemId,
        language: "PYTHON_312",
        sourceCode: "print(1)",
        verdict: "AC",
        score: 100,
        judgedAt: new Date(),
        effectiveAt: new Date(),
      },
      select: { id: true },
    });

    const refused = await readEnvelope(
      await adminContext.delete(participantsUrl(seeded.contestId), {
        data: {
          participantId: participant.id,
          reason: "Tidying the roster",
          deleteSubmissions: false,
        },
      }),
    );
    expect(refused.status, "deleting judged work must not be reachable by omission").toBeGreaterThanOrEqual(400);
    // The count is IN the refusal, because "you are about to delete 14 judged submissions" is the
    // only thing that makes the destructive case visible before it happens.
    expect(refused.message ?? "").toContain("1 judged submission");

    expect(await testDb().participant.count({ where: { id: participant.id } })).toBe(1);
    expect(await testDb().submission.count({ where: { id: submission.id } })).toBe(1);

    const { status, data } = await readOk(
      await adminContext.delete(participantsUrl(seeded.contestId), {
        data: {
          participantId: participant.id,
          reason: "Entered under two accounts by mistake",
          deleteSubmissions: true,
        },
      }),
    );
    expect(status).toBe(200);
    expect(AdminRemoveParticipantResponseSchema.parse(data).removed.submissionsDeleted).toBe(1);

    expect(await testDb().participant.count({ where: { id: participant.id } })).toBe(0);
    expect(
      await testDb().submission.count({ where: { id: submission.id } }),
      "Submission.participantId cascades, which is exactly why the confirmation exists",
    ).toBe(0);

    // The audit row is the only remaining record that there was work here.
    const audited = await testDb().auditLog.findFirst({
      where: { entity: `Participant:${participant.id}`, action: "participant.removed_by_organizer" },
      select: { after: true, before: true, reason: true },
    });
    expect(audited, "an irreversible roster change with no audit row is not acceptable").not.toBeNull();
    expect(JSON.stringify(audited?.before)).toContain("submissionsDeleted");
  });

  test("a participant of another contest cannot be removed through this contest's route", async () => {
    const outsider = await createUser("Outsider", 2033);
    await adminContext.post(participantsUrl(seeded.contestId), { data: { userId: outsider.userId } });
    const participant = await testDb().participant.findFirstOrThrow({
      where: { contestId: seeded.contestId, userId: outsider.userId },
      select: { id: true },
    });

    const refused = await readEnvelope(
      await adminContext.delete(participantsUrl(nextContestId), {
        data: { participantId: participant.id, reason: "Wrong contest", deleteSubmissions: false },
      }),
    );
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(
      await testDb().participant.count({ where: { id: participant.id } }),
      "the participant id comes from the body and the contest from the path, so the mismatch has to be checked before the delete",
    ).toBe(1);

    await testDb().participant.delete({ where: { id: participant.id } });
  });
});

test.describe("the route is an organizer route", () => {
  test("an anonymous caller can neither list accounts nor add one", async ({ playwright }) => {
    const anon = await playwright.request.newContext();

    const listed = await anon.get(participantsUrl(nextContestId));
    expect(listed.status(), "the account list is a directory of every student in the school").toBe(403);

    const added = await anon.post(participantsUrl(nextContestId), {
      data: { userId: veteran.userId },
    });
    expect(added.status()).toBe(403);

    await anon.dispose();
  });
});
