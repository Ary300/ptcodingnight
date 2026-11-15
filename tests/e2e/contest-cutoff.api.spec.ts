import { expect, test, type APIRequestContext } from "@playwright/test";
import { Queue } from "bullmq";
import IORedis from "ioredis";

import { JUDGE_QUEUE_NAME } from "@/lib/judge/queue";
import { parseServerEnv } from "@/lib/schemas/env";
import type { StandingsResponse } from "@/lib/schemas/api";

import { ContestApi, readEnvelope, waitForVerdict } from "./helpers/api";
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
 * G7 — the last seconds of the night, against the real clock and the real judge.
 *
 * Coding Night runs 7:00 to 8:15 with a scheduled freeze at 8:00, and most of the room submits in
 * the final minutes. This spec reproduces that shape on a throwaway contest: the freeze has already
 * fired, the end is a few seconds away, a correct submission goes in just before it, and its verdict
 * is written to the database only after the end has passed.
 *
 * What it proves:
 *   - submitted before the end: 202, and it counts on the organizer's board and the final board;
 *   - its verdict lands after the end and is still recorded (`effectiveAt` > `endsAt`);
 *   - it is NOT on the frozen public board, because it was submitted after the freeze;
 *   - submit and run-samples after the end are refused with 409 "This contest is over", while the
 *     clock deliberately leaves a frozen contest RUNNING for the organizer's reveal;
 *   - a rejudge after the end still lands, and judges with the problem's own comparator;
 *   - the organizer console's reconcile sweep reaches the OLDEST unjudged rows first, which are the
 *     ones the FIFO judge finishes first.
 *
 * Requires the judge worker and Docker, like judged-submission.api.spec.ts.
 */

const VERDICT_BUDGET_MS = 120_000;
/** Room for one POST on a warm dev server, with margin. Asserted below rather than assumed. */
const END_LEAD_MS = 6_000;

test.describe.configure({ mode: "serial" });

let seeded: SeededContest;
let queue: Queue;
let redis: IORedis;

test.beforeAll(async () => {
  seeded = await seedE2EContest({ now: new Date() });
  redis = new IORedis(parseServerEnv().REDIS_URL, { maxRetriesPerRequest: null });
  queue = new Queue(JUDGE_QUEUE_NAME, { connection: redis });
});

test.afterAll(async () => {
  await testDb().contest.deleteMany({ where: { joinCode: { startsWith: "CUT" } } });
  await queue.close();
  await redis.quit();
  await closeTestDb();
});

/** A RUNNING contest whose scheduled freeze fired fifteen minutes ago, with one open GROUP slot. */
async function cutoffContest(joinCode: string, endsAt: Date): Promise<{
  contestId: string;
  contestProblemId: string;
  divisionId: string;
}> {
  const db = testDb();
  await db.contest.deleteMany({ where: { joinCode } });
  const now = Date.now();
  const contest = await db.contest.create({
    data: {
      name: `E2E Cutoff ${joinCode}`,
      joinCode,
      scoringPresetId: "classic",
      state: "RUNNING",
      startsAt: new Date(now - 75 * 60_000),
      endsAt,
      freezeAt: new Date(now - 15 * 60_000),
    },
    select: { id: true },
  });
  const division = await db.division.create({
    data: { contestId: contest.id, name: "Cutoff", sortOrder: 0 },
    select: { id: true },
  });
  // GROUP, because the DB requires an INDIVIDUAL slot to belong to a set and this contest has none.
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
  return { contestId: contest.id, contestProblemId: slot.id, divisionId: division.id };
}

function scoreOf(board: StandingsResponse, participantId: string): number | undefined {
  return board.divisions
    .flatMap((division) => division.rows)
    .find((row) => row.participantId === participantId)?.score;
}

async function waitForJobCompleted(jobId: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await queue.getJob(jobId);
    if (job !== undefined && (await job.getState()) === "completed" && job.returnvalue != null) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`job ${jobId} did not complete within ${timeoutMs} ms; is the worker running?`);
}

async function signedInAdmin(context: APIRequestContext, contestId: string): Promise<ContestApi> {
  const admin = new ContestApi(context, contestId);
  await admin.adminLogin(requiredEnv("ADMIN_PASSCODE"));
  return admin;
}

test("a submission just before the end is judged after it, counts, and later ones are refused", async ({
  playwright,
}) => {
  test.setTimeout(VERDICT_BUDGET_MS * 2 + 60_000);

  // Far end first, so nothing ends this contest while it is being set up.
  const { contestId, contestProblemId, divisionId } = await cutoffContest(
    "CUTEND",
    new Date(Date.now() + 30 * 60_000),
  );
  const freezeAt = new Date(Date.now() - 15 * 60_000);

  const student = new ContestApi(await playwright.request.newContext(), contestId);
  const joined = await student.signIn({ displayName: `E2E Cutoff ${Date.now()}`, divisionId });
  // Joined before the freeze, so the frozen board has a row for them to be absent from.
  await testDb().participant.update({
    where: { id: joined.participantId },
    data: { joinedAt: new Date(freezeAt.getTime() - 60_000) },
  });

  const anonymous = new ContestApi(await playwright.request.newContext(), contestId);
  const admin = await signedInAdmin(await playwright.request.newContext(), contestId);

  // Warm the routes on a dev server, so the timed POST below is not also a compile. Both answer
  // 400 for an empty body before spending any budget.
  await student.submitRaw({} as never);
  await student.runSamplesRaw({} as never);

  const body = {
    contestProblemId,
    language: "PYTHON_312" as const,
    sourceCode: readSolution("accepted.py"),
  };

  // --- the last seconds ------------------------------------------------------------------------
  const endsAt = new Date(Date.now() + END_LEAD_MS);
  await testDb().contest.update({ where: { id: contestId }, data: { endsAt } });

  const accepted = await student.submitRaw(body);
  expect(accepted.status(), "a submission inside the window must be accepted").toBe(202);
  const created = (await accepted.json()) as { data: { submissionId: string } };
  const submissionId = created.data.submissionId;

  const stamped = await testDb().submission.findUniqueOrThrow({
    where: { id: submissionId },
    select: { submittedAt: true },
  });
  expect(
    stamped.submittedAt.getTime(),
    "the premise: the submission was stamped before the end",
  ).toBeLessThanOrEqual(endsAt.getTime());

  // Past the end. Nothing has read the submission yet, so its verdict is not in Postgres.
  const waitMs = endsAt.getTime() - Date.now() + 300;
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));

  const late = await readEnvelope(await student.submitRaw(body));
  expect(late.status, "a submission after the end must be refused").toBe(409);
  expect(late.code).toBe("CONTEST_NOT_RUNNING");
  expect(late.message).toBe("This contest is over");

  const lateSamples = await readEnvelope(await student.runSamplesRaw(body));
  expect(lateSamples.status, "run samples after the end must be refused").toBe(409);
  expect(lateSamples.message).toBe("This contest is over");

  // The scheduled freeze keeps the contest RUNNING past its end, for the reveal. The refusals above
  // came from the window check, not from the state.
  const publicBoard = await anonymous.standings();
  expect(publicBoard.frozen).toBe(true);
  expect(
    (await testDb().contest.findUniqueOrThrow({ where: { id: contestId }, select: { state: true } }))
      .state,
  ).toBe("RUNNING");

  // --- the verdict lands after the end ---------------------------------------------------------
  const judged = await waitForVerdict(student, submissionId, VERDICT_BUDGET_MS);
  expect(judged.verdict).toBe("AC");

  const persisted = await testDb().submission.findUniqueOrThrow({
    where: { id: submissionId },
    select: { verdict: true, effectiveAt: true },
  });
  expect(persisted.verdict).toBe("AC");
  expect(
    persisted.effectiveAt?.getTime() ?? 0,
    "the premise: the verdict was recorded after the end",
  ).toBeGreaterThan(endsAt.getTime());

  expect(scoreOf(await admin.standings(), joined.participantId), "organizer board").toBe(100);
  const frozenBoard = await anonymous.standings();
  expect(frozenBoard.frozen).toBe(true);
  expect(
    scoreOf(frozenBoard, joined.participantId),
    "a submission after the freeze must not move the frozen public board",
  ).toBe(0);

  // --- the reveal -------------------------------------------------------------------------------
  const revealed = await admin.freeze(false);
  expect(revealed.state).toBe("ENDED");
  const finalBoard = await anonymous.standings();
  expect(finalBoard.frozen).toBe(false);
  expect(scoreOf(finalBoard, joined.participantId), "the final board").toBe(100);

  // --- a rejudge after the end ------------------------------------------------------------------
  // The problem's comparator is switched for the rejudge only. The original job ran with the
  // default; the rejudge must run with whatever the problem says NOW, like any judged submission.
  const problemId = liveProblem(seeded).problemId;
  const original = await testDb().problem.findUniqueOrThrow({
    where: { id: problemId },
    select: { comparator: true },
  });
  await testDb().problem.update({
    where: { id: problemId },
    data: { comparator: { kind: "float", epsilon: 0.000001 } },
  });
  try {
    const rejudge = await readEnvelope(
      await admin.rejudgeRaw(submissionId, "Cutoff spec: a rejudge after the end"),
    );
    expect(rejudge.status).toBe(200);

    const rejudged = await waitForVerdict(student, submissionId, VERDICT_BUDGET_MS);
    expect(rejudged.verdict).toBe("AC");

    const job = await queue.getJob(submissionId);
    expect(
      (job?.data as { comparator?: { kind?: string } } | undefined)?.comparator?.kind,
      "a rejudge must judge with the problem's own comparator",
    ).toBe("float");

    expect(scoreOf(await anonymous.standings(), joined.participantId)).toBe(100);
  } finally {
    await testDb().problem.update({
      where: { id: problemId },
      data: { comparator: original.comparator ?? undefined },
    });
  }
});

test("the organizer console reconciles the oldest unjudged submissions first", async ({
  playwright,
}) => {
  test.setTimeout(VERDICT_BUDGET_MS + 60_000);

  const { contestId, contestProblemId, divisionId } = await cutoffContest(
    "CUTSWEEP",
    new Date(Date.now() + 60 * 60_000),
  );
  const student = new ContestApi(await playwright.request.newContext(), contestId);
  const joined = await student.signIn({ displayName: `E2E Sweep ${Date.now()}`, divisionId });

  const created = await student.submit({
    contestProblemId,
    language: "PYTHON_312",
    sourceCode: readSolution("accepted.py"),
  });
  // Finished in the queue, never read: the student closed the laptop. Only a sweep can record it.
  await waitForJobCompleted(created.submissionId, VERDICT_BUDGET_MS);

  // The end-of-night burst: forty newer submissions still waiting behind it. Rows only, no jobs,
  // so they stay unjudged (inside the orphan grace) and fill the sweep's window if it reads
  // newest first.
  const base = Date.now();
  await testDb().submission.createMany({
    data: Array.from({ length: 40 }, (_, index) => ({
      participantId: joined.participantId,
      contestProblemId,
      language: "PYTHON_312" as const,
      sourceCode: "print(0)",
      submittedAt: new Date(base + 1_000 + index),
    })),
  });

  const admin = await signedInAdmin(await playwright.request.newContext(), contestId);
  const poll = await readEnvelope(await admin.consoleRaw());
  expect(poll.status).toBe(200);

  const row = await testDb().submission.findUniqueOrThrow({
    where: { id: created.submissionId },
    select: { verdict: true },
  });
  expect(
    row.verdict,
    "the finished submission sits behind forty newer unjudged rows and the sweep never reached it",
  ).toBe("AC");
});
