import { expect, test, type APIRequestContext } from "@playwright/test";

import { ContestApi, readEnvelope } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, liveProblem, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";

/**
 * G7 — the stored window drives the stored state.
 *
 * The organizer scheduled a contest for 6:35 ET, watched 6:37 arrive on a phone showing
 * "Starting now · 00:00:00", and asked what was up. The scheduled time was display-only: the
 * state column moved only when a person pressed Start. `reconcileContestClock` closes that gap
 * at the poll chokepoints (the pre-start lobby, both standings reads, the admin console), so
 * these specs assert the contract from the outside: polling a due contest IS what transitions it.
 *
 * Each spec builds its own contest rather than touching the seeded fixture, because the fixture
 * must stay RUNNING for every other file in this suite.
 */

let seeded: SeededContest;

test.beforeAll(async () => {
  seeded = await seedE2EContest({ now: new Date() });
});

test.afterAll(async () => {
  await testDb().contest.deleteMany({ where: { joinCode: { startsWith: "CLK" } } });
  await closeTestDb();
});

/** A minimal contest whose only line-up slot borrows the fixture's PUBLISHED problem. */
async function clockContest(options: {
  joinCode: string;
  state: "SCHEDULED" | "RUNNING";
  startsAt: Date;
  endsAt: Date;
  withProblem?: boolean;
}): Promise<string> {
  const db = testDb();
  await db.contest.deleteMany({ where: { joinCode: options.joinCode } });
  const contest = await db.contest.create({
    data: {
      name: `E2E Clock ${options.joinCode}`,
      joinCode: options.joinCode,
      scoringPresetId: "classic",
      state: options.state,
      startsAt: options.startsAt,
      endsAt: options.endsAt,
    },
    select: { id: true },
  });
  if (options.withProblem !== false) {
    // The auto-start runs the REAL Start validation, which refuses a contest with no problems.
    // A GROUP slot, because the DB constraint requires an INDIVIDUAL slot to belong to a set
    // and this throwaway contest has none.
    await db.contestProblem.create({
      data: {
        contestId: contest.id,
        problemId: liveProblem(seeded).problemId,
        slotLabel: "G1",
        basePoints: 100,
        round: "GROUP",
      },
    });
  }
  return contest.id;
}

async function contestState(contestId: string): Promise<string> {
  const row = await testDb().contest.findUniqueOrThrow({
    where: { id: contestId },
    select: { state: true },
  });
  return row.state;
}

function anonApi(context: APIRequestContext, contestId: string): ContestApi {
  return new ContestApi(context, contestId);
}

test("a SCHEDULED contest whose start time has arrived opens on the next poll", async ({
  playwright,
}) => {
  const contestId = await clockContest({
    joinCode: "CLKSTART",
    state: "SCHEDULED",
    startsAt: new Date(Date.now() - 60_000),
    endsAt: new Date(Date.now() + 60 * 60_000),
  });

  const context = await playwright.request.newContext();
  const poll = await readEnvelope(await anonApi(context, contestId).standingsRaw());
  expect(poll.status).toBe(200);

  expect(await contestState(contestId), "the poll did not open the contest").toBe("RUNNING");

  // Audited like every state change, with the clock as the actor: "who started this contest"
  // has an answer that is not a shrug.
  const audit = await testDb().auditLog.findFirst({
    where: { entity: `Contest:${contestId}`, action: "contest.state_set" },
    orderBy: { at: "desc" },
    select: { actor: true },
  });
  expect(audit?.actor).toBe("clock");
});

test("a RUNNING contest whose end time has passed ends on the next poll", async ({
  playwright,
}) => {
  const contestId = await clockContest({
    joinCode: "CLKEND",
    state: "RUNNING",
    startsAt: new Date(Date.now() - 2 * 60 * 60_000),
    endsAt: new Date(Date.now() - 60_000),
  });

  const context = await playwright.request.newContext();
  const poll = await readEnvelope(await anonApi(context, contestId).teamStandingsRaw());
  expect(poll.status).toBe(200);

  expect(await contestState(contestId), "the poll did not end the contest").toBe("ENDED");
});

test("a SCHEDULED contest whose whole window is in the past is left alone", async ({
  playwright,
}) => {
  // The rehearsal that never happened. Springing it to life on a poll would run it NOW,
  // which nobody asked for; it stays where the organizer left it.
  const contestId = await clockContest({
    joinCode: "CLKDEAD",
    state: "SCHEDULED",
    startsAt: new Date(Date.now() - 2 * 60 * 60_000),
    endsAt: new Date(Date.now() - 60 * 60_000),
  });

  const context = await playwright.request.newContext();
  await anonApi(context, contestId).standingsRaw();

  expect(await contestState(contestId)).toBe("SCHEDULED");
});

test("a SCHEDULED contest the Start button would refuse stays SCHEDULED rather than opening broken", async ({
  playwright,
}) => {
  // No problems in the line-up: the manual Start refuses this with a sentence, and the clock
  // must not do worse by opening it to an empty screen.
  const contestId = await clockContest({
    joinCode: "CLKEMPTY",
    state: "SCHEDULED",
    startsAt: new Date(Date.now() - 60_000),
    endsAt: new Date(Date.now() + 60 * 60_000),
    withProblem: false,
  });

  const context = await playwright.request.newContext();
  const poll = await readEnvelope(await anonApi(context, contestId).standingsRaw());
  expect(poll.status, "the poll itself must still answer").toBe(200);

  expect(await contestState(contestId)).toBe("SCHEDULED");
});

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");

test("the organizer's console poll also moves the clock", async ({ playwright }) => {
  const contestId = await clockContest({
    joinCode: "CLKADMIN",
    state: "RUNNING",
    startsAt: new Date(Date.now() - 2 * 60 * 60_000),
    endsAt: new Date(Date.now() - 60_000),
  });

  const context = await playwright.request.newContext();
  const admin = new ContestApi(context, contestId);
  await admin.adminLogin(ADMIN_PASSCODE);
  const poll = await readEnvelope(await admin.consoleRaw());
  expect(poll.status).toBe(200);

  expect(await contestState(contestId)).toBe("ENDED");
});
