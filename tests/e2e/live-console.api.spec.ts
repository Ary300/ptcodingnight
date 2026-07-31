import { expect, test } from "@playwright/test";

import { AdminConsoleViewSchema } from "@/lib/schemas/api";

import { ContestApi, readEnvelope, readOk } from "./helpers/api";
import { requiredEnv } from "./helpers/env";
import { closeTestDb, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";

/**
 * G7 — the organizer's live console, over HTTP.
 *
 * ## What this is pinning
 *
 * The console was a mock. It took a fixture feed as a prop, and freeze, rejudge and override each
 * appended a line to an on-screen log and called nothing. That is invisible from the outside:
 * every button did something, the banner changed, the log filled up — and the contest was
 * untouched. Pressing "Freeze the public board" in front of a room would have shown the organizer
 * a frozen banner while the projector kept updating.
 *
 * So the specs here are all of the same shape: **do the thing through the API, then read the
 * DATABASE**. Asserting a 200 would have passed against a route that returned 200 and wrote
 * nothing, which is a smaller version of the bug being fixed.
 *
 * Judging is not required. `overrideRaw` stands in for the judge deliberately — this file is about
 * whether the organizer's actions reach the server, and `judged-submission.api.spec.ts` is where a
 * real verdict has to come back from a real container.
 */

let seeded: SeededContest;
let admin: ContestApi;

const ADMIN_PASSCODE = requiredEnv("ADMIN_PASSCODE");

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();
  admin = new ContestApi(await playwright.request.newContext(), seeded.contestId);
  await admin.adminLogin(ADMIN_PASSCODE);
});

test.afterAll(async () => {
  await closeTestDb();
});

test.describe("the live console reads the server", () => {
  test("returns the feed, the freeze state and the judge's health in one response", async () => {
    const { status, data } = await readOk(await admin.consoleRaw());
    expect(status).toBe(200);

    // Parsed against the real contract. A route that drifts fails here rather than rendering
    // `undefined` into a screen an organizer is about to act on.
    const view = AdminConsoleViewSchema.parse(data);

    expect(view.contestId).toBe(seeded.contestId);
    expect(view.contestName.length).toBeGreaterThan(0);
    // The window is reported alongside the rows, so the screen can say "200 of 431" rather than
    // silently stopping — a truncated feed reads as "that is all of them".
    expect(view.total).toBeGreaterThanOrEqual(view.submissions.length);
  });

  test("health reports whether the QUEUE answered, not just whether workers exist", async () => {
    const { data } = await readOk(await admin.consoleRaw());
    const { health } = AdminConsoleViewSchema.parse(data);

    // `reachable` is the field that used to be a heartbeat nothing measured, and it is the one an
    // organizer needs: with Redis gone every other number is zero, and "0 queued, 0 failed" is
    // indistinguishable from a healthy contest.
    expect(typeof health.reachable).toBe("boolean");
    if (!health.reachable) {
      expect(health.queueDepth, "an unreachable queue must not report a depth").toBe(0);
      expect(health.workersOnline).toBe(0);
    }
  });

  test("a competitor cannot read it", async ({ playwright }) => {
    const student = new ContestApi(await playwright.request.newContext(), seeded.contestId);
    await student.signIn({ displayName: `E2E ConsoleProbe ${Date.now()}`, divisionId: null });

    // The console is every student's submissions plus the unfrozen board. It is the single most
    // valuable thing on this server to a competitor.
    const envelope = await readEnvelope(await student.consoleRaw());
    expect(envelope.status).toBeGreaterThanOrEqual(400);
    expect(envelope.status).toBeLessThan(500);
  });
});

test.describe("freezing actually freezes", () => {
  test("the freeze button changes the contest, not just the banner", async () => {
    const before = await testDb().contest.findUniqueOrThrow({
      where: { id: seeded.contestId },
      select: { state: true },
    });

    // Only a RUNNING contest can be frozen, so put it there first. This is setup, not the
    // assertion — the assertion is that the ROUTE moved it back out.
    await testDb().contest.update({
      where: { id: seeded.contestId },
      data: { state: "RUNNING", freezeAt: null },
    });

    try {
      const frozen = await readEnvelope(await admin.freezeRaw(true));
      expect(frozen.status, "the freeze route refused").toBe(200);

      const afterFreeze = await testDb().contest.findUniqueOrThrow({
        where: { id: seeded.contestId },
        select: { state: true, freezeAt: true },
      });
      expect(afterFreeze.state, "the console reported frozen and the contest was not").toBe(
        "FROZEN",
      );
      expect(afterFreeze.freezeAt, "a freeze with no timestamp cannot be replayed").not.toBeNull();

      // And the console REPORTS it, because the banner is what the organizer reads.
      const view = AdminConsoleViewSchema.parse((await readOk(await admin.consoleRaw())).data);
      expect(view.frozen).toBe(true);

      expect((await readEnvelope(await admin.freezeRaw(false))).status).toBe(200);
      const afterUnfreeze = await testDb().contest.findUniqueOrThrow({
        where: { id: seeded.contestId },
        select: { state: true, freezeAt: true },
      });
      expect(afterUnfreeze.state).not.toBe("FROZEN");
      expect(afterUnfreeze.freezeAt).toBeNull();
    } finally {
      await testDb().contest.update({
        where: { id: seeded.contestId },
        data: { state: before.state, freezeAt: null },
      });
    }
  });
});

test.describe("rejudge", () => {
  test("clears the verdict so the judge's answer can land, and records what it replaced", async ({
    playwright,
  }) => {
    const student = new ContestApi(await playwright.request.newContext(), seeded.contestId);
    const joined = await student.signIn({
      displayName: `E2E Rejudged ${Date.now()}`,
      divisionId: seeded.divisionIds.get("intermediate") ?? null,
    });

    // A row with a verdict on it, written directly. Going through the judge would make this spec
    // depend on Docker, and what is under test is the ORGANIZER's action, not the judge's.
    const problem = [...seeded.problems.values()][0];
    expect(problem, "the fixture has no problems").toBeDefined();
    if (problem === undefined) return;

    const submission = await testDb().submission.create({
      data: {
        participantId: joined.participantId,
        contestProblemId: problem.contestProblemId,
        language: "PYTHON_312",
        sourceCode: "print(1)",
        verdict: "IE",
        score: 0,
        judgedAt: new Date(),
      },
      select: { id: true },
    });

    const response = await readEnvelope(
      await admin.rejudgeRaw(submission.id, "The judge host was misconfigured for this round"),
    );

    // A queue that is not running is a legitimate outcome on a machine with no Redis, and it must
    // be REPORTED rather than silently swallowed. What must never happen is a 200 with the row
    // untouched, which is exactly what the old button did.
    if (response.status !== 200) {
      expect(
        response.status,
        "a rejudge that cannot reach the queue must say so, not report success",
      ).toBeGreaterThanOrEqual(500);
      return;
    }

    const after = await testDb().submission.findUniqueOrThrow({
      where: { id: submission.id },
      select: { verdict: true, score: true, judgedAt: true },
    });
    // `reconcile` only writes to a submission that is still unjudged. A rejudge that left the old
    // verdict in place would run the job and then throw its result away.
    expect(after.verdict, "the old verdict survived the rejudge").toBeNull();
    expect(after.score).toBe(0);
    expect(after.judgedAt).toBeNull();

    const audit = await testDb().auditLog.findFirst({
      where: { action: "submission.rejudge", entity: `Submission:${submission.id}` },
      select: { reason: true, before: true },
    });
    expect(audit, "a rejudge with no audit row is a score change nobody can explain").not.toBeNull();
    expect(audit?.reason ?? "").not.toBe("");
    // The verdict it REPLACED, because after the rejudge nothing in the row says what was there —
    // and "it was an IE" is the whole justification for having pressed the button.
    expect(JSON.stringify(audit?.before ?? {})).toContain("IE");
  });

  test("refuses a rejudge with no reason", async () => {
    const envelope = await readEnvelope(await admin.rejudgeRaw("no-such-submission", ""));
    expect(envelope.status).toBeGreaterThanOrEqual(400);
    expect(envelope.status).toBeLessThan(500);
  });
});

test.describe("the contest list behind the pickers", () => {
  test("lists contests with the counts an organizer picks by", async () => {
    const { status, data } = await readOk(await admin.adminContestsRaw());
    expect(status).toBe(200);

    const body = data as { contests: { contestId: string; participantCount: number }[] };
    const mine = body.contests.find((row) => row.contestId === seeded.contestId);
    expect(mine, "the seeded contest is missing from the picker's list").toBeDefined();
    expect(mine?.participantCount ?? -1).toBeGreaterThanOrEqual(0);
  });

  test("is organizer-only", async ({ playwright }) => {
    const student = new ContestApi(await playwright.request.newContext(), seeded.contestId);
    await student.signIn({ displayName: `E2E ListProbe ${Date.now()}`, divisionId: null });

    const envelope = await readEnvelope(await student.adminContestsRaw());
    expect(envelope.status).toBeGreaterThanOrEqual(400);
    expect(envelope.status).toBeLessThan(500);
  });
});
