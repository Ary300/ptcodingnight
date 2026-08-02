import { expect, test, type APIRequestContext } from "@playwright/test";

import { TeamProblemFeedSchema } from "@/lib/schemas/api";

import { ContestApi, readEnvelope, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";

/**
 * G7 — the team's shared attempt log on a GROUP problem.
 *
 * ICPC gets team coordination for free by seating three people behind one keyboard. This feed
 * recreates it for a team on separate laptops: who submitted, when, what the judge said. The
 * contract has two security edges these specs pin from the outside:
 *
 *  - the feed never carries source code or a diff, only verdict, score and time;
 *  - it answers 404 on an INDIVIDUAL problem, because a feed of teammates' verdicts there is
 *    answer sharing with extra steps ("she got AC, go ask her").
 */

let seeded: SeededContest;
let admin: ContestApi;

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");
const GROUP_SLUG = "e2e-group-problem";

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();
  admin = new ContestApi(await playwright.request.newContext(), seeded.contestId);
  await admin.adminLogin(ADMIN_PASSCODE);
});

test.afterAll(async () => {
  await closeTestDb();
});

async function competitor(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  displayName: string,
): Promise<{ api: ContestApi; participantId: string }> {
  const api = new ContestApi(await playwright.request.newContext(), seeded.contestId);
  const joined = await api.signIn({
    displayName,
    divisionId: seeded.divisionIds.get("intermediate") ?? null,
  });
  return { api, participantId: joined.participantId };
}

test("teammates see each other's attempts, and the best single score is stated", async ({
  playwright,
}) => {
  const stamp = Date.now();
  const priya = await competitor(playwright, `E2E FeedPriya ${stamp}`);
  const marcus = await competitor(playwright, `E2E FeedMarcus ${stamp}`);

  const team = await testDb().team.create({
    data: {
      contestId: seeded.contestId,
      name: `E2E Feed Team ${stamp}`,
      joinCode: `F${String(stamp).slice(-5)}`,
    },
    select: { id: true },
  });
  await testDb().participant.updateMany({
    where: { id: { in: [priya.participantId, marcus.participantId] } },
    data: { teamId: team.id },
  });

  // Two judged attempts, inserted directly: the judge's own path is covered by G4/G13, and what
  // this spec pins is the FEED contract, which reads rows however they were judged. 60 then 80,
  // from different teammates - the team's best is the best single submission, 80, exactly the
  // rule lib/scoring applies.
  const groupProblem = seeded.problems.get(GROUP_SLUG);
  expect(groupProblem, "fixture lost its group problem").toBeDefined();
  if (groupProblem === undefined) return;

  await testDb().submission.createMany({
    data: [
      {
        participantId: priya.participantId,
        contestProblemId: groupProblem.contestProblemId,
        language: "PYTHON_312",
        sourceCode: "print(60)",
        verdict: "WA",
        score: 60,
        submittedAt: new Date(Date.now() - 120_000),
        effectiveAt: new Date(Date.now() - 120_000),
      },
      {
        participantId: marcus.participantId,
        contestProblemId: groupProblem.contestProblemId,
        language: "PYTHON_312",
        sourceCode: "print(80)",
        verdict: "WA",
        score: 80,
        submittedAt: new Date(Date.now() - 60_000),
        effectiveAt: new Date(Date.now() - 60_000),
      },
    ],
  });

  const { status, data } = await readOk(await priya.api.teamProblemFeedRaw(GROUP_SLUG));
  expect(status).toBe(200);
  const feed = TeamProblemFeedSchema.parse(data);

  expect(feed.teamName).toBe(`E2E Feed Team ${stamp}`);
  expect(feed.bestScore).toBe(80);
  expect(feed.entries).toHaveLength(2);

  // Newest first, the viewer's own row marked, and NO source code anywhere in the payload.
  expect(feed.entries[0]?.displayName).toBe(`E2E FeedMarcus ${stamp}`);
  expect(feed.entries[0]?.mine).toBe(false);
  expect(feed.entries[1]?.mine).toBe(true);
  expect(JSON.stringify(data)).not.toContain("print(");
});

test("an individual problem has no team feed, by design", async ({ playwright }) => {
  const student = await competitor(playwright, `E2E FeedNosy ${Date.now()}`);
  const envelope = await readEnvelope(await student.api.teamProblemFeedRaw("e2e-panther-sum"));
  expect(envelope.status).toBe(404);
});

test("a competitor on no team gets an empty feed, not an error", async ({ playwright }) => {
  const loner = await competitor(playwright, `E2E FeedLoner ${Date.now()}`);
  const { status, data } = await readOk(await loner.api.teamProblemFeedRaw(GROUP_SLUG));
  expect(status).toBe(200);
  const feed = TeamProblemFeedSchema.parse(data);
  expect(feed.teamName).toBeNull();
  expect(feed.entries).toHaveLength(0);
});
