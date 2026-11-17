import { expect, test } from "@playwright/test";
import { z } from "zod";

import { ContestApi, readEnvelope, readOk, waitForVerdict } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import {
  closeTestDb,
  liveProblem,
  pinParticipantToProblemSet,
  readSolution,
  seedE2EContest,
  testDb,
  type SeededContest,
} from "./helpers/seed";

/**
 * G7 — End contest on a FROZEN board closes submissions and does not reveal.
 *
 * The walkthrough's finding: End then "End it now" on a frozen contest set ENDED, and an ENDED
 * contest's board is never frozen, so the projector and every student screen showed the final
 * standings, post-freeze points included, the moment End was pressed. The night's order is end at
 * 8:15, enter the Kahoot points, then reveal.
 *
 * This drives it over HTTP: freeze, an AC after the freeze, End. The public board and the projector
 * view must still be frozen without the AC's points, submissions must be refused, Reopen must
 * reopen them with the board still frozen, and only "Unfreeze and reveal" ends the contest and
 * shows the points. Requires the worker and Docker, like every judged spec.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
const VERDICT_BUDGET_MS = 120_000;

const EndResponseSchema = z.object({ state: z.string(), boardStaysFrozen: z.boolean() });

let seeded: SeededContest;
let admin: ContestApi;
let student: ContestApi;
let studentId = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();
  admin = new ContestApi(await playwright.request.newContext(), seeded.contestId);
  await admin.adminLogin(ADMIN_PASSCODE);

  student = new ContestApi(await playwright.request.newContext(), seeded.contestId);
  const joined = await student.signIn({
    displayName: "E2E End While Frozen",
    divisionId: seeded.divisionIds.get("intermediate") ?? null,
  });
  studentId = joined.participantId;
  await pinParticipantToProblemSet(joined.participantId, liveProblem(seeded).contestProblemId);
});

test.afterAll(async () => {
  // This file ends the shared fixture contest. Specs that join it without seeding it (the
  // competitor journey) must find it running, so it is put back.
  await seedE2EContest();
  await closeTestDb();
});

function scoreOf(board: { divisions: { rows: { participantId: string; score: number }[] }[] }): number {
  for (const division of board.divisions) {
    const row = division.rows.find((candidate) => candidate.participantId === studentId);
    if (row !== undefined) return row.score;
  }
  return 0;
}

async function expectBoardsFrozenWithout(): Promise<void> {
  const publicBoard = await student.standings();
  expect(publicBoard.frozen, "the student's board revealed").toBe(true);
  expect(scoreOf(publicBoard)).toBe(0);

  for (const scoped of [true, false]) {
    const wall = await admin.projectorStandings(scoped);
    expect(wall.frozen, `projector board (scoped=${String(scoped)}) revealed`).toBe(true);
    expect(scoreOf(wall)).toBe(0);
    const teams = await admin.projectorTeamStandings(scoped);
    expect(teams.frozen, `projector team board (scoped=${String(scoped)}) revealed`).toBe(true);
  }
}

test("End on a frozen board closes submissions and keeps the board frozen until the reveal", async () => {
  test.setTimeout(VERDICT_BUDGET_MS + 60_000);
  const live = liveProblem(seeded);

  const frozen = await admin.freeze(true);
  expect(frozen.state).toBe("FROZEN");

  const created = await student.submit({
    contestProblemId: live.contestProblemId,
    language: "PYTHON_312",
    sourceCode: readSolution("accepted.py"),
  });
  const judged = await waitForVerdict(student, created.submissionId, VERDICT_BUDGET_MS);
  expect(judged.verdict).toBe("AC");

  // Positive control: the organizer's own board sees the AC, so a public board showing it leaked.
  expect(scoreOf(await admin.standings())).toBe(live.basePoints);

  const ended = await readOk(
    await admin.setContestStateRaw(seeded.contestId, "ENDED", "E2E: end at 8:15"),
  );
  expect(ended.status).toBe(200);
  expect(EndResponseSchema.parse(ended.data)).toEqual({ state: "FROZEN", boardStaysFrozen: true });

  const row = await testDb().contest.findUniqueOrThrow({
    where: { id: seeded.contestId },
    select: { state: true, endsAt: true, freezeAt: true },
  });
  expect(row.state).toBe("FROZEN");
  expect(row.freezeAt?.toISOString()).toBe(frozen.freezeAt);
  expect(row.endsAt.getTime()).toBeLessThanOrEqual(Date.now());

  const audit = await testDb().auditLog.findFirst({
    where: { entity: `Contest:${seeded.contestId}`, action: "contest.state_set" },
    orderBy: { at: "desc" },
  });
  expect(audit?.after).toMatchObject({ state: "FROZEN", boardStaysFrozen: true });

  // Different source, so the retry path that hands back an identical earlier submission does not
  // answer for it.
  const lateResponse = await student.submitRaw({
    contestProblemId: live.contestProblemId,
    language: "PYTHON_312",
    sourceCode: `${readSolution("accepted.py")}\n# after the end\n`,
  });
  const late = await readEnvelope(lateResponse);
  expect(late.status, await lateResponse.text()).not.toBe(200);
  expect(late.message).toBe("This contest is over");

  await expectBoardsFrozenWithout();

  // A second End changes nothing and still does not reveal.
  const again = await readOk(
    await admin.setContestStateRaw(seeded.contestId, "ENDED", "E2E: pressed twice"),
  );
  expect(EndResponseSchema.parse(again.data).state).toBe("FROZEN");
  await expectBoardsFrozenWithout();
});

test("Reopen after End on a frozen board reopens submissions and the board stays frozen", async () => {
  test.setTimeout(VERDICT_BUDGET_MS + 60_000);
  const reopened = await readOk(
    await admin.endTimeRaw(new Date(Date.now() + 30 * 60_000).toISOString(), "E2E: reopen"),
  );
  expect(reopened.status).toBe(200);
  expect(reopened.data).toMatchObject({ state: "FROZEN" });

  const open = await readEnvelope(
    await student.runSamplesRaw({
      contestProblemId: liveProblem(seeded).contestProblemId,
      language: "PYTHON_312",
      sourceCode: readSolution("accepted.py"),
    }),
  );
  expect(open.message, "run samples refused on a reopened contest").toBeNull();
  expect(open.status).toBe(200);
  await expectBoardsFrozenWithout();

  // End it again, the way the night will.
  const ended = await readOk(
    await admin.setContestStateRaw(seeded.contestId, "ENDED", "E2E: end again"),
  );
  expect(EndResponseSchema.parse(ended.data).boardStaysFrozen).toBe(true);
  await expectBoardsFrozenWithout();
});

test("Unfreeze and reveal ends the contest and shows the post-freeze points", async () => {
  const revealed = await admin.freeze(false);
  expect(revealed.state).toBe("ENDED");

  const publicBoard = await student.standings();
  expect(publicBoard.frozen).toBe(false);
  expect(scoreOf(publicBoard)).toBe(liveProblem(seeded).basePoints);

  const wall = await admin.projectorStandings(true);
  expect(wall.frozen).toBe(false);
  expect(scoreOf(wall)).toBe(liveProblem(seeded).basePoints);
});

test("End on an unfrozen board still ends it and makes the standings final", async () => {
  const reseeded = await seedE2EContest();
  const response = await readOk(
    await admin.setContestStateRaw(reseeded.contestId, "ENDED", "E2E: end unfrozen"),
  );
  expect(EndResponseSchema.parse(response.data)).toEqual({ state: "ENDED", boardStaysFrozen: false });
});
