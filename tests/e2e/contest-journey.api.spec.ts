import { expect, test, type APIRequestContext } from "@playwright/test";

import { ContestApi, readEnvelope } from "./helpers/api";
import {
  closeTestDb,
  draftProblem,
  liveProblem,
  readSolution,
  seedE2EContest,
  type SeededContest,
} from "./helpers/seed";

/**
 * G7, the part of the journey that does not need a judge.
 *
 * join -> read problem -> leaderboard -> freeze hides changes -> admin unfreezes -> admin
 * exports CSV, driven through the HTTP routes in `app/api/**` against a real Postgres.
 *
 * The two steps missing from that list — running samples and receiving a judged verdict —
 * need the worker and a Docker daemon, and live in `judged-submission.api.spec.ts` so that a
 * host with no daemon fails exactly those and nothing else.
 *
 * ## Why "freeze hides changes" is provable without the judge
 *
 * The freeze is a *submission-time* cutoff (`standingsCutoff` -> `computeStandings({ upTo })`),
 * not a filter on the answer. So a submission created after the freeze instant must be invisible
 * on the public board and visible to an organizer, regardless of who assigned its verdict. This
 * spec creates that submission through `POST /api/submissions` and gives it a verdict through
 * `POST /api/admin/submissions/{id}/override` — both real routes, neither one the judge.
 */

const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE ?? "";

test.describe.configure({ mode: "serial" });

test.describe("contest journey (no judge required)", () => {
  let seeded: SeededContest;
  let competitorContext: APIRequestContext;
  let adminContext: APIRequestContext;
  let anonContext: APIRequestContext;
  let competitor: ContestApi;
  let admin: ContestApi;
  let anon: ContestApi;
  let competitorId = "";

  const DISPLAY_NAME = "E2E Journey Competitor";

  test.beforeAll(async ({ playwright, baseURL }) => {
    expect(
      ADMIN_PASSCODE.length,
      "ADMIN_PASSCODE must be set (copy .env.example to .env) or no admin step can run",
    ).toBeGreaterThan(0);

    seeded = await seedE2EContest();

    competitorContext = await playwright.request.newContext({ baseURL });
    adminContext = await playwright.request.newContext({ baseURL });
    anonContext = await playwright.request.newContext({ baseURL });

    competitor = new ContestApi(competitorContext, seeded.contestId);
    admin = new ContestApi(adminContext, seeded.contestId);
    anon = new ContestApi(anonContext, seeded.contestId);
  });

  test.afterAll(async () => {
    await competitorContext?.dispose();
    await adminContext?.dispose();
    await anonContext?.dispose();
    await closeTestDb();
  });

  test("a student joins with the code on the board", async () => {
    const joined = await competitor.joinOrThrow({
      joinCode: seeded.joinCode,
      displayName: DISPLAY_NAME,
      divisionId: seeded.divisionIds.get("intermediate") ?? null,
    });

    expect(joined.contestId).toBe(seeded.contestId);
    expect(joined.displayName).toBe(DISPLAY_NAME);
    competitorId = joined.participantId;
    expect(competitorId).not.toBe("");
  });

  test("a wrong join code is refused, and does not say which codes exist", async () => {
    const response = await competitor.join({
      joinCode: "NOT-THE-CODE",
      displayName: "E2E Nobody",
      divisionId: null,
    });
    const envelope = await readEnvelope(response);

    expect(envelope.status).toBe(404);
    expect(envelope.message ?? "").not.toContain(seeded.joinCode);
  });

  test("a joined student reads the problem list and the statement", async () => {
    const live = liveProblem(seeded);
    const problems = await competitor.listProblems();

    const slugs = problems.map((problem) => problem.slug);
    expect(slugs).toContain(live.slug);

    const detail = await competitor.getProblem(live.slug);
    expect(detail.title).toBe(live.title);
    expect(detail.statementMd.length).toBeGreaterThan(0);
    expect(detail.samples.length).toBe(2);
    expect(detail.samples[0]?.input.trim()).toBe("2 3");
    expect(detail.samples[0]?.expectedOutput.trim()).toBe("5");
    expect(detail.allowedLanguages).toContain("PYTHON");
  });

  test("the DRAFT problem is refused by the API, not merely hidden by the UI", async () => {
    const draft = draftProblem(seeded);

    const listed = await competitor.listProblems();
    expect(listed.map((problem) => problem.slug)).not.toContain(draft.slug);

    const envelope = await readEnvelope(await competitor.getProblemRaw(draft.slug));
    expect(envelope.code).toBe("PROBLEM_IS_DRAFT");
  });

  test("an anonymous caller gets no problems and no submissions", async () => {
    // 403 rather than 401: `requireCompetitor` throws ForbiddenError (lib/contest/viewer.ts).
    expect((await readEnvelope(await anon.getProblemRaw(liveProblem(seeded).slug))).status).toBe(
      403,
    );
    expect(
      (
        await readEnvelope(
          await anon.submitRaw({
            contestProblemId: liveProblem(seeded).contestProblemId,
            language: "PYTHON",
            sourceCode: readSolution("accepted.py"),
          }),
        )
      ).status,
    ).toBe(403);
  });

  test("the leaderboard is public and already shows the rivals", async () => {
    const standings = await anon.standings();

    expect(standings.contestId).toBe(seeded.contestId);
    expect(standings.frozen).toBe(false);

    const intermediate = standings.divisions.find((division) => division.name === "Intermediate");
    expect(intermediate, "the Intermediate division should be on the board").toBeDefined();

    const names = intermediate?.rows.map((row) => row.displayName) ?? [];
    expect(names).toContain("E2E Ada");
    expect(names).toContain("E2E Grace");
    expect(names).toContain(DISPLAY_NAME);

    // Ada solved at +12 min, Grace at +30 with one wrong answer before it. Ada is ahead.
    expect(names.indexOf("E2E Ada")).toBeLessThan(names.indexOf("E2E Grace"));

    const me = intermediate?.rows.find((row) => row.displayName === DISPLAY_NAME);
    expect(me?.score).toBe(0);
  });

  test("an organizer signs in with the passcode, and a wrong one is refused", async () => {
    expect((await readEnvelope(await admin.adminLoginRaw("definitely-wrong"))).status).toBe(401);
    await admin.adminLogin(ADMIN_PASSCODE);
  });

  test("a competitor cannot freeze the board or export the results", async () => {
    expect((await readEnvelope(await competitor.freezeRaw(true))).status).toBe(403);
    expect((await readEnvelope(await competitor.exportRaw())).status).toBe(403);
  });

  test("freeze hides a change the organizer can still see", async () => {
    const live = liveProblem(seeded);

    // 1. The organizer freezes the public board.
    const frozen = await admin.freeze(true);
    expect(frozen.frozen).toBe(true);
    expect(frozen.freezeAt).not.toBeNull();

    const publicFrozen = await anon.standings();
    expect(publicFrozen.frozen).toBe(true);
    expect(Date.parse(publicFrozen.asOf)).toBe(Date.parse(frozen.freezeAt ?? ""));

    // 2. The student submits after the freeze. Judging never stops (PRD §6.3), so this is
    //    accepted; only the public board stopped.
    const created = await competitor.submit({
      contestProblemId: live.contestProblemId,
      language: "PYTHON",
      sourceCode: readSolution("accepted.py"),
    });
    expect(created.verdict).toBeNull();

    // 3. Give it a verdict without the judge, through the audited override route.
    const overridden = await admin.overrideRaw({
      submissionId: created.submissionId,
      verdict: "AC",
      score: live.basePoints,
      reason: "E2E: standing in for the judge so the freeze can be observed without Docker",
    });
    expect(overridden.status(), await overridden.text()).toBe(200);

    // 4. The public board has not moved. The organizer's has.
    const stillFrozen = await anon.standings();
    const publicRow = stillFrozen.divisions
      .flatMap((division) => division.rows)
      .find((row) => row.displayName === DISPLAY_NAME);
    expect(stillFrozen.frozen).toBe(true);
    expect(publicRow?.score, "the frozen public board must not show the post-freeze score").toBe(0);

    const adminBoard = await admin.standings();
    const adminRow = adminBoard.divisions
      .flatMap((division) => division.rows)
      .find((row) => row.displayName === DISPLAY_NAME);
    expect(adminBoard.frozen, "an organizer's board is never frozen").toBe(false);
    expect(adminRow?.score).toBe(live.basePoints);
  });

  test("an override without a reason is refused", async () => {
    const mine = await competitor.listMySubmissions();
    const first = mine[0];
    expect(first, "the competitor should have a submission by now").toBeDefined();

    const response = await admin.overrideRaw({
      submissionId: first?.submissionId ?? "",
      verdict: "AC",
      score: 100,
      reason: "   ",
    });
    expect(response.status()).toBe(400);
  });

  test("the organizer unfreezes and the room sees the change", async () => {
    const live = liveProblem(seeded);

    const result = await admin.freeze(false);
    expect(result.frozen).toBe(false);
    expect(result.freezeAt, "unfreezing must clear freezeAt or the board refreezes").toBeNull();

    const revealed = await anon.standings();
    expect(revealed.frozen).toBe(false);

    const row = revealed.divisions
      .flatMap((division) => division.rows)
      .find((entry) => entry.displayName === DISPLAY_NAME);
    expect(row?.score).toBe(live.basePoints);
  });

  test("the organizer exports the final standings as CSV", async () => {
    const response = await admin.exportRaw();

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(response.headers()["content-disposition"]).toMatch(
      /attachment; filename="e2e-coding-night-standings-.*\.csv"/,
    );

    const csv = await response.text();
    const lines = csv.trimEnd().split("\r\n");

    expect(lines[0]).toBe("division,rank,tied,participantId,displayName,score,penaltyMinutes");
    expect(lines.length).toBeGreaterThan(1);
    expect(csv).toContain("E2E Ada");
    expect(csv).toContain(DISPLAY_NAME);

    // The export is the organizer's board, so the post-freeze score is in it.
    const mine = lines.find((line) => line.includes(DISPLAY_NAME));
    expect(mine).toBeDefined();
    expect(mine?.split(",")).toContain(String(liveProblem(seeded).basePoints));
  });

  test("the standings never carry anything that belongs to a student", async () => {
    const body = await (await anon.standingsRaw()).text();

    expect(body).not.toContain("sourceCode");
    expect(body).not.toContain("expectedOutput");
    for (const forbidden of ["import sys", "2 3", "3000000"]) {
      expect(body, `standings leaked test data: ${forbidden}`).not.toContain(forbidden);
    }
  });
});
