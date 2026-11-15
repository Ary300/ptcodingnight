import { expect, test, type APIRequestContext } from "@playwright/test";

import { z } from "zod";

import { ContestApi, readEnvelope, readOk, waitForVerdict } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { pauseLiveContests, restoreContests, type PausedContest } from "./helpers/live-contests";
import { closeTestDb, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";

/**
 * G7: the guest door into the practice arena, `POST /api/practice/start`.
 *
 * Students have no accounts, so before this route the arena was unreachable: the slip's code names
 * a seat in a real contest and nothing else led anywhere. The contracts pinned here, from outside:
 *
 *  - a browser with no session and no code gets a "Guest NNNN" participant IN THE ARENA, can list
 *    the arena's problems, and gets AC on the first warm-up from the real judge;
 *  - that guest is nowhere in the night's contest: not its roster, not its individual board, not
 *    its team board;
 *  - pressing the button again reuses the arena session instead of minting another guest;
 *  - a browser signed in to a real contest, or as an organizer, is refused with 409 and a sentence
 *    that says to sign out, and its session survives the attempt.
 *
 * The arena must exist: `npx tsx scripts/seed-practice.ts` seeds it with the practice problems.
 * The judged step needs the worker and Docker, like `judged-submission.api.spec.ts`.
 */

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
const VERDICT_BUDGET_MS = 120_000;

/** A correct answer to `practice-two-sum`, written the way a student would: raw stdin. */
const TWO_SUM_SOLUTION = "a, b = map(int, input().split())\nprint(a + b)\n";

const StartBodySchema = z.object({ displayName: z.string(), created: z.boolean() });

test.describe.configure({ mode: "serial" });

let seeded: SeededContest;
let admin: ContestApi;
let adminContext: APIRequestContext;
let guestContext: APIRequestContext;
let arenaId: string;
let guestName: string;
let paused: PausedContest[] = [];

test.beforeAll(async ({ playwright, baseURL }) => {
  seeded = await seedE2EContest();
  // Practice is closed while any real contest is live, and the fixture just made one live.
  paused = await pauseLiveContests();
  adminContext = await playwright.request.newContext({ baseURL });
  admin = new ContestApi(adminContext, seeded.contestId);
  await admin.adminLogin(ADMIN_PASSCODE);

  const arena = await testDb().contest.findFirst({
    where: { isPractice: true, state: "RUNNING" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  expect(arena, "no practice arena: run `npx tsx scripts/seed-practice.ts` first").not.toBeNull();
  arenaId = arena?.id ?? "";

  guestContext = await playwright.request.newContext({ baseURL });
});

test.afterAll(async () => {
  await restoreContests(paused);
  await guestContext?.dispose();
  await adminContext?.dispose();
  await closeTestDb();
});

test("a browser with no session and no code starts practice as a guest in the arena", async () => {
  const response = await guestContext.post("/api/practice/start");
  const result = await readOk(response);
  expect(result.status, JSON.stringify(result.data)).toBe(200);

  const body = StartBodySchema.parse(result.data);
  expect(body.created).toBe(true);
  expect(body.displayName).toMatch(/^Guest \d{4}$/);
  guestName = body.displayName;

  const session = (await (await guestContext.get("/api/auth/session")).json()) as {
    data: {
      signedIn: boolean;
      role: string | null;
      contestId: string | null;
      contestIsPractice: boolean | null;
      teamId: string | null;
      displayName: string | null;
    };
  };
  expect(session.data.signedIn).toBe(true);
  expect(session.data.role).toBe("COMPETITOR");
  expect(session.data.contestId, "the guest must land in the arena").toBe(arenaId);
  expect(session.data.contestIsPractice).toBe(true);
  expect(session.data.teamId, "a guest is on no team").toBeNull();
  expect(session.data.displayName).toBe(guestName);
});

test("the guest lists the arena's problems, warm-ups first and Hard last", async () => {
  const guest = new ContestApi(guestContext, arenaId);
  const problems = await guest.listProblems();
  const slugs = problems.map((problem) => problem.slug);

  expect(slugs.slice(0, 2)).toEqual(["practice-two-sum", "practice-bigger-number"]);
  const difficulties = problems.map((problem) => problem.difficulty);
  const firstHard = difficulties.indexOf("H");
  expect(firstHard, "the arena still carries its Hard questions").toBeGreaterThan(-1);
  expect(
    difficulties.slice(firstHard).every((difficulty) => difficulty === "H"),
    `Hard questions must be listed last, got ${difficulties.join(",")}`,
  ).toBe(true);
});

test("a correct Python answer to the first warm-up is judged AC", async () => {
  test.setTimeout(VERDICT_BUDGET_MS + 30_000);
  const guest = new ContestApi(guestContext, arenaId);
  const problems = await guest.listProblems();
  const twoSum = problems.find((problem) => problem.slug === "practice-two-sum");
  expect(twoSum, "practice-two-sum is not in the arena").toBeDefined();

  const submission = await guest.submit({
    contestProblemId: twoSum?.contestProblemId ?? "",
    language: "PYTHON_312",
    sourceCode: TWO_SUM_SOLUTION,
  });
  const judged = await waitForVerdict(guest, submission.submissionId, VERDICT_BUDGET_MS);
  expect(judged.verdict).toBe("AC");
});

test("the guest is nowhere in the night's contest: roster, board or team board", async () => {
  const rows = await testDb().participant.findMany({
    where: { displayName: guestName },
    select: { contestId: true },
  });
  expect(rows.map((row) => row.contestId)).toEqual([arenaId]);

  const standings = await admin.standings();
  const names = standings.divisions.flatMap((division) =>
    division.rows.map((row) => row.displayName),
  );
  expect(names, "the guest leaked onto the real contest's board").not.toContain(guestName);

  const teamBoard = JSON.stringify(await admin.teamStandings());
  expect(teamBoard.includes(guestName), "the guest leaked onto the team board").toBe(false);
});

test("pressing the button again reuses the arena session instead of minting another guest", async () => {
  const before = await testDb().participant.count({ where: { contestId: arenaId } });

  const response = await guestContext.post("/api/practice/start");
  const result = await readOk(response);
  expect(result.status).toBe(200);
  const body = StartBodySchema.parse(result.data);
  expect(body).toEqual({ displayName: guestName, created: false });

  const after = await testDb().participant.count({ where: { contestId: arenaId } });
  expect(after).toBe(before);
});

test("a student signed in to a real contest is refused, and keeps their session", async ({
  playwright,
  baseURL,
}) => {
  const context = await playwright.request.newContext({ baseURL });
  try {
    const student = new ContestApi(context, seeded.contestId);
    await student.signIn({ displayName: `E2E Practice Refusal ${String(Date.now())}` });
    const cookie = student.sessionCookie();
    expect(cookie).not.toBeNull();

    const response = await context.post("/api/practice/start", {
      headers: { cookie: cookie ?? "" },
    });
    expect(response.headers()["set-cookie"], "a refusal must not touch the cookie").toBeUndefined();
    const refusal = await readEnvelope(response);
    expect(refusal.status).toBe(409);
    expect(refusal.code).toBe("CONFLICT");
    expect(refusal.message).toContain(seeded.name);
    expect(refusal.message).toContain("Sign out");

    const session = (await (
      await context.get("/api/auth/session", { headers: { cookie: cookie ?? "" } })
    ).json()) as { data: { contestId: string | null } };
    expect(session.data.contestId, "the real session must survive").toBe(seeded.contestId);
  } finally {
    await context.dispose();
  }
});

test("an organizer is refused rather than signed out", async () => {
  const refusal = await readEnvelope(await adminContext.post("/api/practice/start"));
  expect(refusal.status).toBe(409);
  expect(refusal.message).toContain("organizer");

  const session = (await (await adminContext.get("/api/auth/session")).json()) as {
    data: { role: string | null };
  };
  expect(session.data.role).toBe("ADMIN");
});

test("practice closes while a real contest is running, and opens again when it ends", async ({
  playwright,
  baseURL,
}) => {
  // Put the seeded contest back inside its window for this one test.
  const now = Date.now();
  await testDb().contest.update({
    where: { id: seeded.contestId },
    data: { state: "RUNNING", startsAt: new Date(now - 60_000), endsAt: new Date(now + 60 * 60_000) },
  });
  const fresh = await playwright.request.newContext({ baseURL });
  try {
    const refusedStart = await readEnvelope(await fresh.post("/api/practice/start"));
    expect(refusedStart.status).toBe(409);
    expect(refusedStart.message).toContain("closed while");
    expect(refusedStart.message).toContain(seeded.name);

    // The guest made earlier still holds an arena session; its submissions pause too.
    const guest = new ContestApi(guestContext, arenaId);
    const problems = await guest.listProblems();
    const twoSum = problems.find((problem) => problem.slug === "practice-two-sum");
    const refusedSubmit = await readEnvelope(
      await guest.submitRaw({
        contestProblemId: twoSum?.contestProblemId ?? "",
        language: "PYTHON_312",
        sourceCode: TWO_SUM_SOLUTION,
      }),
    );
    expect(refusedSubmit.status).toBe(409);
    expect(refusedSubmit.message).toContain("closed while");
  } finally {
    await fresh.dispose();
    // Back to paused, so afterAll restores the original window exactly.
    await testDb().contest.update({
      where: { id: seeded.contestId },
      data: {
        state: "SCHEDULED",
        startsAt: new Date(now + 24 * 60 * 60_000),
        endsAt: new Date(now + 25 * 60 * 60_000),
      },
    });
  }

  const reopened = await playwright.request.newContext({ baseURL });
  try {
    expect((await reopened.post("/api/practice/start")).status()).toBe(200);
  } finally {
    await reopened.dispose();
  }
});
