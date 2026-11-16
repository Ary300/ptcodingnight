import { expect, test } from "@playwright/test";

import { ContestApi, readEnvelope, readOk, waitForVerdict } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import {
  closeTestDb,
  liveProblem,
  readSolution,
  seedE2EContest,
  testDb,
  type SeededContest,
} from "./helpers/seed";

/**
 * G7 — what a room of students and two organizers actually do on the night, short of malice.
 *
 * Each case here was driven against a running server first, and each one failed:
 *
 *  - a double-pressed Submit, or a retry after a lost response, made a second counted submission;
 *  - a retry that crossed 8:15 was told the contest was over although its first copy counted;
 *  - a scheduled start waited for some page to poll the board, so the first submit was refused;
 *  - a job the queue lost became IE after ten minutes, and a verdict nobody was watching for sat in
 *    Redis while the projector showed the student without it;
 *  - the end time could not be moved, and End contest could not be undone, without psql.
 *
 * The judged cases need the worker (`npm run worker`) and Docker, like judged-submission.api.spec.ts.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
const CODE_PREFIX = "NFM";

let seeded: SeededContest;

test.beforeAll(async () => {
  seeded = await seedE2EContest({ now: new Date() });
});

test.afterAll(async () => {
  await testDb().contest.deleteMany({ where: { joinCode: { startsWith: CODE_PREFIX } } });
  await closeTestDb();
});

/** A contest of its own, so moving its clock cannot disturb the shared fixture. */
async function nightContest(options: {
  code: string;
  state: "SCHEDULED" | "RUNNING";
  startsAt: Date;
  endsAt: Date;
  freezeAt?: Date | null;
}): Promise<{ contestId: string; contestProblemId: string }> {
  const db = testDb();
  await db.contest.deleteMany({ where: { joinCode: options.code } });
  const contest = await db.contest.create({
    data: {
      name: `E2E Night ${options.code}`,
      joinCode: options.code,
      state: options.state,
      startsAt: options.startsAt,
      endsAt: options.endsAt,
      freezeAt: options.freezeAt ?? null,
    },
    select: { id: true },
  });
  // A GROUP slot: an INDIVIDUAL one must belong to a set, and this contest has none.
  const slot = await db.contestProblem.create({
    data: {
      contestId: contest.id,
      problemId: liveProblem(seeded).problemId,
      slotLabel: "G1",
      basePoints: 100,
      round: "GROUP",
    },
    select: { id: true },
  });
  return { contestId: contest.id, contestProblemId: slot.id };
}

const accepted = (): string => readSolution("accepted.py");

test.describe("a submission is made once, however many times it is sent", () => {
  test("two copies of one POST in flight together are one submission", async ({ playwright }) => {
    const night = await nightContest({
      code: `${CODE_PREFIX}DOUBLE`,
      state: "RUNNING",
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 60 * 60_000),
    });
    const context = await playwright.request.newContext();
    const api = new ContestApi(context, night.contestId);
    const me = await api.signIn();
    const body = {
      contestProblemId: night.contestProblemId,
      language: "PYTHON_312" as const,
      sourceCode: `${accepted()}\n# double ${String(Date.now())}\n`,
    };

    const [one, two] = await Promise.all([api.submit(body), api.submit(body)]);
    expect(two.submissionId).toBe(one.submissionId);

    // And a third press a moment later, the "could not reach the server, press again" case.
    const three = await api.submit(body);
    expect(three.submissionId).toBe(one.submissionId);

    const rows = await testDb().submission.count({ where: { participantId: me.participantId } });
    expect(rows, "a repeat of the same code became a second counted submission").toBe(1);

    // A CHANGED program is a new submission, as it always was.
    const changed = await api.submit({ ...body, sourceCode: `${body.sourceCode}# edited\n` });
    expect(changed.submissionId).not.toBe(one.submissionId);
  });

  test("a retry that arrives after the end gets back the submission that counts", async ({
    playwright,
  }) => {
    const night = await nightContest({
      code: `${CODE_PREFIX}RETRY`,
      state: "RUNNING",
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 4_000),
    });
    const context = await playwright.request.newContext();
    const api = new ContestApi(context, night.contestId);
    await api.signIn();
    const body = {
      contestProblemId: night.contestProblemId,
      language: "PYTHON_312" as const,
      sourceCode: `${accepted()}\n# retry ${String(Date.now())}\n`,
    };

    const original = await api.submit(body);
    await new Promise((resolve) => setTimeout(resolve, 5_000));

    const retry = await api.submit(body);
    expect(retry.submissionId, "the retry was refused although its first copy counts").toBe(
      original.submissionId,
    );

    // A new program after the end is still refused, in words a student can act on.
    const late = await readEnvelope(
      await api.submitRaw({ ...body, sourceCode: `${body.sourceCode}# new\n` }),
    );
    expect(late.status).toBe(409);
    expect(late.message).toBe("This contest is over");
  });
});

test("a scheduled start opens on the first submit, and an early one says it has not started", async ({
  playwright,
}) => {
  const night = await nightContest({
    code: `${CODE_PREFIX}START`,
    state: "SCHEDULED",
    startsAt: new Date(Date.now() + 4_000),
    endsAt: new Date(Date.now() + 60 * 60_000),
  });
  const context = await playwright.request.newContext();
  const api = new ContestApi(context, night.contestId);
  await api.signIn();
  const body = {
    contestProblemId: night.contestProblemId,
    language: "PYTHON_312" as const,
    sourceCode: accepted(),
  };

  const early = await readEnvelope(await api.submitRaw(body));
  expect(early.status).toBe(409);
  expect(early.message).toBe("This contest has not started yet");

  await new Promise((resolve) => setTimeout(resolve, 5_000));
  // No standings poll, no lobby, no console: the submit is the first request after the start.
  const onTime = await readEnvelope(await api.submitRaw(body));
  expect(onTime.status, onTime.message ?? "").toBe(202);
});

test.describe("judged (requires the worker and Docker)", () => {
  test.setTimeout(240_000);

  test("a submission whose job the queue lost is judged again, not shown IE", async ({
    playwright,
  }) => {
    const night = await nightContest({
      code: `${CODE_PREFIX}LOST`,
      state: "RUNNING",
      startsAt: new Date(Date.now() - 10 * 60_000),
      endsAt: new Date(Date.now() + 60 * 60_000),
    });
    const context = await playwright.request.newContext();
    const api = new ContestApi(context, night.contestId);
    const me = await api.signIn();

    // A row the queue has never heard of: what a Redis restart that lost its last appends leaves.
    const lost = await testDb().submission.create({
      data: {
        participantId: me.participantId,
        contestProblemId: night.contestProblemId,
        language: "PYTHON_312",
        sourceCode: accepted(),
        submittedAt: new Date(Date.now() - 2 * 60_000),
      },
      select: { id: true },
    });

    const view = await waitForVerdict(api, lost.id, 180_000);
    expect(view.verdict, "a lost job was written as IE instead of being judged").toBe("AC");
  });

  test("a verdict lands in the database with nobody reading it", async ({ playwright }) => {
    const night = await nightContest({
      code: `${CODE_PREFIX}SWEEP`,
      state: "RUNNING",
      startsAt: new Date(Date.now() - 10 * 60_000),
      endsAt: new Date(Date.now() + 60 * 60_000),
    });
    const context = await playwright.request.newContext();
    const api = new ContestApi(context, night.contestId);
    const me = await api.signIn();
    const submitted = await api.submit({
      contestProblemId: night.contestProblemId,
      language: "PYTHON_312",
      sourceCode: `${accepted()}\n# closed the laptop ${String(Date.now())}\n`,
    });

    // The student closes the laptop. Nothing below reads the submission over HTTP.
    const deadline = Date.now() + 180_000;
    let verdict: string | null = null;
    while (Date.now() < deadline && verdict === null) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      const row = await testDb().submission.findUniqueOrThrow({
        where: { id: submitted.submissionId },
        select: { verdict: true, participantId: true },
      });
      expect(row.participantId).toBe(me.participantId);
      verdict = row.verdict;
    }
    expect(verdict, "the verdict stayed in the queue because nobody looked").toBe("AC");
  });
});

test.describe("the organizer can move the end, and undo an End contest", () => {
  test("extends a live contest and the scheduled freeze moves with it", async ({ playwright }) => {
    const startsAt = new Date(Date.now() - 30 * 60_000);
    const endsAt = new Date(Date.now() + 45 * 60_000);
    const night = await nightContest({
      code: `${CODE_PREFIX}EXTEND`,
      state: "RUNNING",
      startsAt,
      endsAt,
      freezeAt: new Date(endsAt.getTime() - 15 * 60_000),
    });
    const admin = new ContestApi(await playwright.request.newContext(), night.contestId);
    await admin.adminLogin(ADMIN_PASSCODE);

    const later = new Date(endsAt.getTime() + 10 * 60_000);
    const moved = await readEnvelope(await admin.endTimeRaw(later.toISOString(), "judge outage"));
    expect(moved.status, moved.message ?? "").toBe(200);

    const row = await testDb().contest.findUniqueOrThrow({
      where: { id: night.contestId },
      select: { endsAt: true, freezeAt: true, state: true },
    });
    expect(row.endsAt.toISOString()).toBe(later.toISOString());
    expect(row.freezeAt?.toISOString()).toBe(new Date(later.getTime() - 15 * 60_000).toISOString());
    expect(row.state).toBe("RUNNING");

    const past = await readEnvelope(
      await admin.endTimeRaw(new Date(Date.now() - 60_000).toISOString(), "typo"),
    );
    expect(past.status).toBe(400);
    expect(past.message).toMatch(/End contest/);
  });

  test("an End contest pressed by mistake is reopened, and students can submit again", async ({
    playwright,
  }) => {
    const night = await nightContest({
      code: `${CODE_PREFIX}REOPEN`,
      state: "RUNNING",
      startsAt: new Date(Date.now() - 30 * 60_000),
      endsAt: new Date(Date.now() + 45 * 60_000),
    });
    const admin = new ContestApi(await playwright.request.newContext(), night.contestId);
    await admin.adminLogin(ADMIN_PASSCODE);
    const student = new ContestApi(await playwright.request.newContext(), night.contestId);
    await student.signIn();

    const ended = await readEnvelope(
      await admin.setContestStateRaw(night.contestId, "ENDED", "pressed by mistake"),
    );
    expect(ended.status).toBe(200);
    const body = {
      contestProblemId: night.contestProblemId,
      language: "PYTHON_312" as const,
      sourceCode: `${accepted()}\n# after the mistake ${String(Date.now())}\n`,
    };
    expect((await readEnvelope(await student.submitRaw(body))).status).toBe(409);

    const until = new Date(Date.now() + 40 * 60_000);
    const reopened = await readOk(await admin.endTimeRaw(until.toISOString(), "reopen"));
    expect(reopened.status, JSON.stringify(reopened.data)).toBe(200);
    expect(reopened.data).toMatchObject({ state: "RUNNING", resumed: true });

    expect((await readEnvelope(await student.submitRaw(body))).status).toBe(202);

    const audit = await testDb().auditLog.findFirst({
      where: { entity: `Contest:${night.contestId}`, action: "contest.end_time_set" },
      select: { before: true, after: true },
    });
    expect(audit?.before).toMatchObject({ state: "ENDED" });
    expect(audit?.after).toMatchObject({ state: "RUNNING" });

    // A student cannot move the clock.
    const refused = await readEnvelope(await student.endTimeRaw(until.toISOString(), "more time"));
    expect([401, 403]).toContain(refused.status);
  });
});
