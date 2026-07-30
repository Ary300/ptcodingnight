import { expect, test, type APIRequestContext } from "@playwright/test";

import { SSE_EVENTS, StandingsResponseSchema, VerdictEventSchema } from "@/lib/schemas/api";

import { ContestApi, cookieHeader } from "./helpers/api";
import { closeTestDb, liveProblem, readSolution, seedE2EContest, type SeededContest } from "./helpers/seed";
import { collectSse } from "./helpers/sse";

/**
 * G7 — the live transport.
 *
 * `GET /api/contests/{id}/stream` is what makes a verdict arrive without a refresh and the
 * leaderboard move on its own. It needs no judge: the stream re-sends what a plain GET already
 * returns (PRD §10), so a verdict written by the audited override route travels the same path a
 * judged one does. What this cannot prove is that the judge produces the verdict — that is
 * `judged-submission.api.spec.ts`.
 *
 * The scoping assertion is the one that matters most here. Verdict frames carry per-test detail,
 * so a spectator on the projector's stream must never receive one.
 */

const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE ?? "";
const STREAM_TIMEOUT_MS = 20_000;

test.describe.configure({ mode: "serial" });

test.describe("live stream", () => {
  let seeded: SeededContest;
  let competitorContext: APIRequestContext;
  let adminContext: APIRequestContext;
  let competitor: ContestApi;
  let admin: ContestApi;
  let streamUrl = "";

  test.beforeAll(async ({ playwright, baseURL }) => {
    expect(ADMIN_PASSCODE.length).toBeGreaterThan(0);
    seeded = await seedE2EContest();
    streamUrl = `${baseURL ?? "http://localhost:3000"}/api/contests/${seeded.contestId}/stream`;

    competitorContext = await playwright.request.newContext({ baseURL });
    adminContext = await playwright.request.newContext({ baseURL });
    competitor = new ContestApi(competitorContext, seeded.contestId);
    admin = new ContestApi(adminContext, seeded.contestId);

    await competitor.joinOrThrow({
      joinCode: seeded.joinCode,
      displayName: "E2E Stream Competitor",
      divisionId: seeded.divisionIds.get("intermediate") ?? null,
    });
    await admin.adminLogin(ADMIN_PASSCODE);
  });

  test.afterAll(async () => {
    await competitorContext?.dispose();
    await adminContext?.dispose();
    await closeTestDb();
  });

  test("a spectator's stream carries the board and the clock, and nothing else", async () => {
    const events = await collectSse({
      url: streamUrl,
      cookie: null,
      timeoutMs: STREAM_TIMEOUT_MS,
      until: (collected) =>
        collected.some((event) => event.event === SSE_EVENTS.standings) &&
        collected.some((event) => event.event === SSE_EVENTS.contestState),
    });

    const names = events.map((event) => event.event);
    expect(names, "the stream should announce contest state").toContain(SSE_EVENTS.contestState);
    expect(names, "the stream should push standings").toContain(SSE_EVENTS.standings);
    expect(names, "a spectator must never receive a verdict frame").not.toContain(
      SSE_EVENTS.verdict,
    );

    const standings = events.find((event) => event.event === SSE_EVENTS.standings);
    expect(standings).toBeDefined();
    // Parsed, not eyeballed: the stream must carry the same contract the GET does.
    StandingsResponseSchema.parse(JSON.parse(standings?.data ?? "null"));
  });

  test("a verdict reaches the student who owns the submission, without a refresh", async () => {
    const live = liveProblem(seeded);

    const created = await competitor.submit({
      contestProblemId: live.contestProblemId,
      language: "PYTHON_312",
      sourceCode: readSolution("accepted.py"),
    });
    expect(created.verdict).toBeNull();

    const cookie = await cookieHeader(competitorContext);
    expect(cookie, "the join route must have set a session cookie").not.toBeNull();

    const events = await collectSse({
      url: streamUrl,
      cookie,
      timeoutMs: STREAM_TIMEOUT_MS,
      // The verdict is written after the stream is open, so the frame is a genuine push rather
      // than a replay of state the client already had.
      onOpen: async () => {
        const response = await admin.overrideRaw({
          submissionId: created.submissionId,
          verdict: "AC",
          score: live.basePoints,
          reason: "E2E: standing in for the judge to exercise the live verdict transport",
        });
        expect(response.status(), await response.text()).toBe(200);
      },
      until: (collected) => collected.some((event) => event.event === SSE_EVENTS.verdict),
    });

    const frame = events.find((event) => event.event === SSE_EVENTS.verdict);
    expect(frame, `no verdict frame arrived; got ${events.map((e) => e.event).join(", ")}`).toBeDefined();

    const verdict = VerdictEventSchema.parse(JSON.parse(frame?.data ?? "null"));
    expect(verdict.submissionId).toBe(created.submissionId);
    expect(verdict.verdict).toBe("AC");
    expect(verdict.score).toBe(live.basePoints);
  });
});
