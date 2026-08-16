import { expect, test } from "@playwright/test";

import { ContestApi, readEnvelope, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";

/**
 * G7 — browser puzzles: points without writing a program.
 *
 * The organizer asked for something easier than a judged problem so a student who does not know a
 * language yet can still score. These pay out as side-activity awards, the same currency the
 * metal puzzle pays in, so the specs below check the two things that could quietly go wrong:
 * the answer key must never reach a student, and a puzzle must pay a team exactly once.
 */

let seeded: SeededContest;
let admin: ContestApi;
let contestId: string;

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
const PUZZLE_SLUG = "e2e-puzzle-binary";
const ANSWER = "panthers";

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();
  contestId = seeded.contestId;
  admin = new ContestApi(await playwright.request.newContext(), contestId);
  await admin.adminLogin(ADMIN_PASSCODE);

  await testDb().puzzle.upsert({
    where: { slug: PUZZLE_SLUG },
    create: {
      slug: PUZZLE_SLUG,
      title: "E2E Binary",
      topic: "Binary",
      promptMd: "Decode `01010000`.",
      check: "TEXT",
      answerKey: ANSWER,
      points: 15,
      active: true,
      sortOrder: 1,
    },
    update: { answerKey: ANSWER, points: 15, active: true },
  });
});

test.afterAll(async () => {
  await testDb().puzzle.deleteMany({ where: { slug: PUZZLE_SLUG } });
  await closeTestDb();
});

/** A student who arrived by join code, already on a team. The night's normal case. */
async function codeStudent(
  playwright: { request: { newContext: () => Promise<import("@playwright/test").APIRequestContext> } },
  teamId: string,
) {
  const { data } = await readOk(
    await admin.addNamedParticipantRaw({
      displayName: `E2E Puzzler ${String(Date.now())}-${String(Math.random()).slice(2, 6)}`,
      teamId,
    }),
  );
  const seat = data as { participantId: string; joinCode: string };
  const context = await playwright.request.newContext();
  const signIn = await context.post("/api/auth/join-code", { data: { code: seat.joinCode } });
  expect(signIn.status()).toBe(200);
  return { context, participantId: seat.participantId };
}

async function freshTeam(label: string): Promise<{ id: string }> {
  return testDb().team.create({
    data: {
      contestId,
      name: `E2E Puzzle ${label} ${String(Date.now())}-${String(Math.random()).slice(2, 6)}`,
      joinCode: `P${String(Date.now()).slice(-5)}${String(Math.random()).slice(2, 4)}`,
    },
    select: { id: true },
  });
}

test("the list reaches a student without the answer key", async ({ playwright }) => {
  const team = await freshTeam("List");
  const { context } = await codeStudent(playwright, team.id);

  const response = await context.get(`/api/contests/${contestId}/puzzles`);
  expect(response.status()).toBe(200);
  const raw = await response.text();

  // The whole payload, as text: a key cannot hide in a field the schema forgot to strip.
  expect(raw).not.toContain("answerKey");
  expect(raw.toLowerCase()).not.toContain(`"${ANSWER}"`);

  const body = JSON.parse(raw) as { data: { puzzles: { slug: string; solved: boolean }[] } };
  const mine = body.data.puzzles.find((puzzle) => puzzle.slug === PUZZLE_SLUG);
  expect(mine?.solved, "a fresh team has solved nothing").toBe(false);
});

test("a wrong answer costs nothing and a right one pays the team once", async ({ playwright }) => {
  const team = await freshTeam("Pay");
  const { context } = await codeStudent(playwright, team.id);
  const url = `/api/contests/${contestId}/puzzles/${PUZZLE_SLUG}`;

  const wrong = await context.post(url, { data: { answer: "wildcats" } });
  const wrongBody = (await wrong.json()) as { data: { correct: boolean; awarded: number } };
  expect(wrongBody.data.correct).toBe(false);
  expect(wrongBody.data.awarded, "a wrong answer must never move the score").toBe(0);

  // Sloppy case and spacing, the way a person types.
  const right = await context.post(url, { data: { answer: "  PANTHERS " } });
  const rightBody = (await right.json()) as { data: { correct: boolean; awarded: number } };
  expect(rightBody.data.correct).toBe(true);
  expect(rightBody.data.awarded).toBe(15);

  const again = await context.post(url, { data: { answer: ANSWER } });
  const againBody = (await again.json()) as { data: { correct: boolean; awarded: number } };
  expect(againBody.data.correct, "it is still the right answer").toBe(true);
  expect(againBody.data.awarded, "but a puzzle pays a team once").toBe(0);

  // One award row, and it is the currency the board already understands.
  const awards = await testDb().teamSideActivity.findMany({
    where: { teamId: team.id, label: { startsWith: "Puzzle:" } },
    select: { points: true },
  });
  expect(awards).toHaveLength(1);
  expect(awards[0]?.points).toBe(15);
});

test("a teammate racing to submit the same answer does not double the points", async ({
  playwright,
}) => {
  const team = await freshTeam("Race");
  const [first, second] = await Promise.all([
    codeStudent(playwright, team.id),
    codeStudent(playwright, team.id),
  ]);
  const url = `/api/contests/${contestId}/puzzles/${PUZZLE_SLUG}`;

  /*
    Both teammates submit at once, which is the normal case rather than the edge case. The unique
    index on (puzzle, team) is what makes this safe; a check-then-write would pay twice here.
  */
  const [a, b] = await Promise.all([
    first.context.post(url, { data: { answer: ANSWER } }),
    second.context.post(url, { data: { answer: ANSWER } }),
  ]);
  expect(a.status()).toBe(200);
  expect(b.status()).toBe(200);

  const awards = await testDb().teamSideActivity.findMany({
    where: { teamId: team.id, label: { startsWith: "Puzzle:" } },
  });
  expect(awards, "two simultaneous correct answers, one award").toHaveLength(1);

  const solves = await testDb().puzzleSolve.findMany({ where: { teamId: team.id } });
  expect(solves).toHaveLength(1);
});

test("a hidden puzzle disappears from the list and refuses answers", async ({ playwright }) => {
  const team = await freshTeam("Hidden");
  const { context } = await codeStudent(playwright, team.id);

  await readOk(await admin.setPuzzleActiveRaw(PUZZLE_SLUG, false));
  try {
    const list = await context.get(`/api/contests/${contestId}/puzzles`);
    const body = (await list.json()) as { data: { puzzles: { slug: string }[] } };
    expect(body.data.puzzles.some((puzzle) => puzzle.slug === PUZZLE_SLUG)).toBe(false);

    const refused = await readEnvelope(
      await context.post(`/api/contests/${contestId}/puzzles/${PUZZLE_SLUG}`, {
        data: { answer: ANSWER },
      }),
    );
    expect(refused.status, "a hidden puzzle cannot be answered from a stale tab").toBe(404);
  } finally {
    await readOk(await admin.setPuzzleActiveRaw(PUZZLE_SLUG, true));
  }
});

test("an anonymous visitor can neither list nor answer", async ({ playwright }) => {
  const context = await playwright.request.newContext();
  const list = await readEnvelope(await context.get(`/api/contests/${contestId}/puzzles`));
  expect(list.status).toBeGreaterThanOrEqual(400);
  expect(list.status).toBeLessThan(500);

  const answer = await readEnvelope(
    await context.post(`/api/contests/${contestId}/puzzles/${PUZZLE_SLUG}`, {
      data: { answer: ANSWER },
    }),
  );
  expect(answer.status).toBeGreaterThanOrEqual(400);
  expect(answer.status).toBeLessThan(500);
});
