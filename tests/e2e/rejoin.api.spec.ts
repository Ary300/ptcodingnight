import { expect, test, type APIRequestContext } from "@playwright/test";

import { ContestApi, readEnvelope } from "./helpers/api";
import { closeTestDb, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";
import { requiredEnv } from "./helpers/env";

/**
 * G7 — T5: re-joining must not re-roll the problem set, and no unassigned set may be reachable.
 *
 * ## The vector this closes
 *
 * `joinContest` created a `Participant` on every call, and nothing bound a join to a browser.
 * Under `RANDOM_ASSIGNED` a fresh participant draws a fresh set, so a student could join as "x1",
 * read set A, join as "x2", read set B, and so on — reading the whole room's Round 1 before it
 * started. Every one of those joins **succeeds**, so the wrong-code limiter never sees them.
 *
 * The organizer's format is that sets are assigned and never previewed (PRD §6.2). A student who
 * can sample sets until they like one has not bent that rule, they have removed it.
 *
 * ## What is asserted here
 *
 * 1. A rejoin returns the **identical participant and the identical set**, repeatedly.
 * 2. A browser that has joined cannot join again under a different name.
 * 3. A forged claim cannot be used to take over another participant.
 * 4. **No unassigned set's problems are reachable through any route** — enumerated, not sampled.
 *
 * The unit half is `lib/contest/join-claim.test.ts` (the signature, as an adversary) and
 * `lib/contest/set-assignment.test.ts` (assignment is a stable function of the stored seed).
 */

let seeded: SeededContest;

/** Every set problem in the fixture. The one not listed for a player is the one to probe. */
const SET_PROBLEM_SLUGS = ["e2e-panther-sum", "e2e-other-set"] as const;

let admin: ContestApi;

test.beforeAll(async ({ playwright }) => {
  seeded = await seedE2EContest();
  const context = await playwright.request.newContext();
  admin = new ContestApi(context, seeded.contestId);
  await admin.adminLogin(requiredEnv("ADMIN_PASSCODE"));
});

test.afterAll(async () => {
  await closeTestDb();
});

/** A browser. Cookies persist across calls on one of these, which is the whole point. */
async function newBrowserApi(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
): Promise<ContestApi> {
  return new ContestApi(await playwright.request.newContext(), seeded.contestId);
}

function uniqueName(prefix: string): string {
  return `E2E ${prefix} ${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

/*
  TWO DESCRIBES REMOVED, AND WHAT REPLACED THEM.

  This file was built around T5: re-joining with a code must not re-roll your problem set, because
  a re-roll is a way to preview the other sets. `POST /api/contests/{id}/join` no longer exists —
  a student signs in with a provider and an organizer puts them on a team — so "re-joining is
  idempotent" and "re-joining cannot be used to sample the other sets" describe an action nobody
  can take. Their claim-and-name machinery (forged claims, taken names, releasing a claim on
  sign-out) went with the join route it guarded.

  **The property did not go anywhere.** Set assignment moved onto the organizer's path, so the
  question is now "does moving a player between teams re-roll their set" — and the answer has to
  be no for exactly the old reason. That is the spec immediately below.

  The second surviving describe, further down, never depended on join codes at all: it asserts
  that an unassigned set is unreachable through EVERY route, which is the containment the
  idempotency was protecting in the first place.
*/
test.describe("set assignment is idempotent across organizer moves", () => {
  test("moving a player between teams does not re-roll their set", async ({ playwright }) => {
    const player = await newBrowserApi(playwright);
    const joined = await player.signIn({
      displayName: uniqueName("SetKeeper"),
      divisionId: seeded.divisionIds.get("intermediate") ?? null,
    });

    const first = seeded.teamIds.get("panthers") ?? "";
    const second = seeded.teamIds.get("cubs") ?? "";
    expect(first, "fixture teams are missing").not.toBe("");
    expect(second).not.toBe("");

    await admin.moveParticipantRaw({
      participantId: joined.participantId,
      teamId: first,
      reason: "First assignment — this is what draws the set",
    });
    const afterFirst = await testDb().participant.findUnique({
      where: { id: joined.participantId },
      select: { chosenSetId: true },
    });
    expect(afterFirst?.chosenSetId, "being put on a team must assign a set").not.toBeNull();

    await admin.moveParticipantRaw({
      participantId: joined.participantId,
      teamId: second,
      reason: "Moved teams — the set must NOT follow",
    });
    const afterSecond = await testDb().participant.findUnique({
      where: { id: joined.participantId },
      select: { chosenSetId: true },
    });

    expect(
      afterSecond?.chosenSetId,
      "a re-roll on every move is a way to shop for a set, which is what T5 was about",
    ).toBe(afterFirst?.chosenSetId);
  });
});

test.describe("no unassigned set is reachable through any route", () => {
  let player: ContestApi;
  let proberName: string;
  let hiddenSlug: string;
  let hiddenContestProblemId: string;

  test.beforeAll(async ({ playwright }) => {
    player = await newBrowserApi(playwright);
    proberName = uniqueName("Prober");

    /**
     * Join WITH a division. Joining with `divisionId: null` puts every fixture problem out of
     * scope for an unrelated reason — a divisioned problem is refused to a player with no
     * division — and the suite would then be measuring the division filter while claiming to
     * measure the set filter.
     */
    await player.signIn({
      displayName: proberName,
      divisionId: seeded.divisionIds.get("intermediate") ?? null,
    });

    const visible = new Set((await player.listProblems()).map((problem) => problem.slug));
    const hidden = SET_PROBLEM_SLUGS.find((slug) => !visible.has(slug));

    expect(hidden, "the fixture gave this player both set problems, so there is nothing to probe")
      .toBeDefined();
    hiddenSlug = hidden ?? "";

    const problem = seeded.problems.get(hiddenSlug);
    expect(problem, `fixture has no problem ${hiddenSlug}`).toBeDefined();
    hiddenContestProblemId = problem?.contestProblemId ?? "";
  });

  test("the problem list omits it", async () => {
    const slugs = (await player.listProblems()).map((problem) => problem.slug);
    expect(slugs).not.toContain(hiddenSlug);

    // The control. If the group problem were also missing, this suite would be measuring "the
    // list is empty" rather than "the set rule applies".
    expect(slugs).toContain("e2e-group-problem");
  });

  /**
   * Enumerated rather than sampled. "Not in the list" is not the property — the property is that
   * every route which could hand over a statement, a sample, or a score refuses. Each of these is
   * directly callable regardless of what the UI renders.
   */
  test("every competitor route refuses it", async () => {
    const attempts: readonly [string, Promise<import("@playwright/test").APIResponse>][] = [
      ["GET problem detail", player.getProblemRaw(hiddenSlug)],
      [
        "POST run-samples",
        player.runSamplesRaw({
          contestProblemId: hiddenContestProblemId,
          language: "PYTHON_312",
          sourceCode: "print(1)",
        }),
      ],
      [
        "POST submissions",
        player.submitRaw({
          contestProblemId: hiddenContestProblemId,
          language: "PYTHON_312",
          sourceCode: "print(1)",
        }),
      ],
    ];

    for (const [label, pending] of attempts) {
      const envelope = await readEnvelope(await pending);
      expect(envelope.status, `${label} did not refuse an unassigned set`).toBeGreaterThanOrEqual(
        400,
      );
      expect(envelope.status, `${label} answered with a server error rather than a refusal`)
        .toBeLessThan(500);
    }
  });

  test("re-joining does not widen what is reachable", async () => {
    /**
     * The two halves of T5 meeting: even granting that a rejoin is allowed, it must not become a
     * second draw. If it did, this player would eventually be handed the set they are being
     * refused — and every route above would then correctly start allowing it.
     */
    const before = (await player.listProblems()).map((problem) => problem.slug).sort();

    // Was: re-join five times and check the list did not widen. There is no re-join, so what is
    // left to ask is whether the scope drifts when it is asked for repeatedly — a cache, a stale
    // read, or an assignment that runs on access rather than once.
    for (let i = 0; i < 5; i += 1) {
      await player.listProblems();
    }

    const after = (await player.listProblems()).map((problem) => problem.slug).sort();
    expect(after, "re-joining changed which problems this player can see").toEqual(before);

    const envelope = await readEnvelope(await player.getProblemRaw(hiddenSlug));
    expect(envelope.status, "re-joining widened this player's set access").toBeGreaterThanOrEqual(
      400,
    );
  });
});
