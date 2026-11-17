import { expect, test } from "@playwright/test";

import { closeTestDb, testDb } from "./helpers/seed";

/**
 * G7 — a bare wall URL picks the same live contest on both boards, FROZEN counted as live.
 *
 * Both un-scoped routes ranked RUNNING above FROZEN, so a contest frozen for the reveal lost the
 * wall to any other RUNNING contest whose window also contained now, such as a rehearsal left open.
 * They now share one picker in which RUNNING and FROZEN are equal and the most recent start wins.
 */

const stamp = String(Date.now());
let frozenId = "";

test.beforeAll(async () => {
  const now = Date.now();
  // The most recent start of any contest in the database, so the picker's tie-break lands on it
  // whatever else is running beside it.
  const frozen = await testDb().contest.create({
    data: {
      name: `E2E Wall Frozen ${stamp}`,
      joinCode: `E2EWALLF${stamp.slice(-6)}`,
      scoringPresetId: "coding-night-classic",
      state: "FROZEN",
      startsAt: new Date(now - 1_000),
      endsAt: new Date(now + 60 * 60_000),
      freezeAt: new Date(now - 500),
    },
    select: { id: true },
  });
  frozenId = frozen.id;
});

test.afterAll(async () => {
  if (frozenId !== "") await testDb().contest.delete({ where: { id: frozenId } }).catch(() => null);
  await closeTestDb();
});

test("a FROZEN contest wins the wall on recency, beside RUNNING ones, on both boards", async ({
  request,
}) => {
  const running = await testDb().contest.count({
    where: { state: "RUNNING", isPractice: false, startsAt: { lte: new Date() }, endsAt: { gt: new Date() } },
  });
  expect(running, "the premise: another RUNNING contest is live beside the frozen one").toBeGreaterThan(0);

  const team = await request.get("/api/team-standings?view=public");
  expect(team.status()).toBe(200);
  const teamBody = (await team.json()) as { data: { contestId: string; frozen: boolean } };
  expect(teamBody.data.contestId, "the team board skipped the FROZEN contest").toBe(frozenId);
  expect(teamBody.data.frozen).toBe(true);

  const individual = await request.get("/api/standings?view=public");
  expect(individual.status()).toBe(200);
  const individualBody = (await individual.json()) as { data: { contestId: string } };
  expect(individualBody.data.contestId, "the two boards picked different contests").toBe(frozenId);
});
