import { expect, test, type APIRequestContext } from "@playwright/test";

import { ContestApi, readEnvelope } from "./helpers/api";
import { closeTestDb, seedE2EContest, testDb, type SeededContest } from "./helpers/seed";

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

test.beforeAll(async () => {
  seeded = await seedE2EContest();
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

test.describe("re-joining is idempotent", () => {
  test("a rejoin returns the identical participant and the identical set", async ({
    playwright,
  }) => {
    const api = await newBrowserApi(playwright);
    const displayName = uniqueName("Rejoin");
    const divisionId = seeded.divisionIds.get("intermediate") ?? null;

    const first = await api.joinOrThrow({ joinCode: seeded.joinCode, displayName, divisionId });

    expect(first.rejoined, "the first join reported itself as a rejoin").toBe(false);
    expect(first.chosenSetLabel, "the fixture should assign a set at join time").not.toBeNull();

    /**
     * Ten, not one. A single repeat would pass against a bug that alternates, and the original
     * defect was precisely that each call drew again — so the assertion has to be that the answer
     * never moves, not that two of them happened to agree.
     */
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const again = await api.joinOrThrow({ joinCode: seeded.joinCode, displayName, divisionId });

      expect(again.participantId, `attempt ${attempt} created a second participant`).toBe(
        first.participantId,
      );
      expect(again.chosenSetId, `attempt ${attempt} re-rolled the set`).toBe(first.chosenSetId);
      expect(again.chosenSetLabel, `attempt ${attempt} re-rolled the set`).toBe(
        first.chosenSetLabel,
      );
      expect(again.rejoined, `attempt ${attempt} was not reported as a rejoin`).toBe(true);
    }
  });

  test("ten rejoins create exactly one participant row", async ({ playwright }) => {
    // The response could be right while the writes are not. This is the database's opinion.
    const api = await newBrowserApi(playwright);
    const displayName = uniqueName("OneRow");

    await api.joinOrThrow({
      joinCode: seeded.joinCode,
      displayName,
      divisionId: seeded.divisionIds.get("intermediate") ?? null,
    });

    for (let i = 0; i < 9; i += 1) {
      await api.joinOrThrow({
        joinCode: seeded.joinCode,
        displayName,
        divisionId: seeded.divisionIds.get("intermediate") ?? null,
      });
    }

    const rows = await testDb().participant.findMany({
      where: { contestId: seeded.contestId, displayName },
      select: { id: true, chosenSetId: true },
    });

    expect(rows).toHaveLength(1);
  });

  test("every rejoin is audit-logged with the set it returned", async ({ playwright }) => {
    /**
     * The set is recorded on every rejoin rather than only the first, and that is deliberate: a
     * set that DID change has to be visible in the trail rather than deniable. An audit row that
     * only ever records the first value cannot show a change.
     */
    const api = await newBrowserApi(playwright);
    const displayName = uniqueName("Audited");

    const joined = await api.joinOrThrow({
      joinCode: seeded.joinCode,
      displayName,
      divisionId: seeded.divisionIds.get("intermediate") ?? null,
    });
    await api.joinOrThrow({
      joinCode: seeded.joinCode,
      displayName,
      divisionId: seeded.divisionIds.get("intermediate") ?? null,
    });

    const rows = await testDb().auditLog.findMany({
      where: {
        entity: `Participant:${joined.participantId}`,
        action: "participant.rejoin",
      },
      select: { after: true },
    });

    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows) {
      const after = row.after as { chosenSetId?: string | null } | null;
      expect(after?.chosenSetId ?? null).toBe(joined.chosenSetId);
    }
  });

  test("the set survives a sign-out and a fresh sign-in on the same browser", async ({
    playwright,
  }) => {
    /**
     * The claim outlives the session on purpose: a student whose session cookie was dropped has
     * to be able to get back to their OWN participant. Before this, retyping their own name
     * returned CONFLICT and they were locked out of their own submissions mid-contest.
     *
     * Note this uses the session-clearing path that does NOT release the claim — signing out
     * through `DELETE /api/auth/session` deliberately does release it, and that case is covered
     * below.
     */
    const context = await playwright.request.newContext();
    const api = new ContestApi(context, seeded.contestId);
    const displayName = uniqueName("Dropped");

    const first = await api.joinOrThrow({
      joinCode: seeded.joinCode,
      displayName,
      divisionId: seeded.divisionIds.get("intermediate") ?? null,
    });

    // Drop only the session cookie, keeping the claim — a browser that expired its session.
    const state = await context.storageState();
    const withoutSession = state.cookies.filter((cookie) => cookie.name !== "ptcn_session");
    const revived = await playwright.request.newContext({
      storageState: { cookies: withoutSession, origins: [] },
    });
    const revivedApi = new ContestApi(revived, seeded.contestId);

    const back = await revivedApi.joinOrThrow({
      joinCode: seeded.joinCode,
      displayName,
      divisionId: seeded.divisionIds.get("intermediate") ?? null,
    });

    expect(back.participantId).toBe(first.participantId);
    expect(back.chosenSetId).toBe(first.chosenSetId);
    expect(back.rejoined).toBe(true);
  });
});

test.describe("re-joining cannot be used to sample the other sets", () => {
  test("a browser that has joined is refused a second name", async ({ playwright }) => {
    const api = await newBrowserApi(playwright);
    const divisionId = seeded.divisionIds.get("intermediate") ?? null;

    await api.joinOrThrow({
      joinCode: seeded.joinCode,
      displayName: uniqueName("Sampler"),
      divisionId,
    });

    // The attack: same browser, new name, hoping for a different set.
    const envelope = await readEnvelope(
      await api.join({
        joinCode: seeded.joinCode,
        displayName: uniqueName("SamplerTwo"),
        divisionId,
      }),
    );

    expect(envelope.status, "a second name from one browser was accepted").toBe(409);
  });

  test("the refusal is audit-logged, so it is visible in the roster", async ({ playwright }) => {
    // A control nobody can see is not a control. The organizer's roster is where this surfaces.
    const api = await newBrowserApi(playwright);
    const divisionId = seeded.divisionIds.get("intermediate") ?? null;

    const held = await api.joinOrThrow({
      joinCode: seeded.joinCode,
      displayName: uniqueName("Logged"),
      divisionId,
    });

    await api.join({
      joinCode: seeded.joinCode,
      displayName: uniqueName("LoggedTwo"),
      divisionId,
    });

    const rows = await testDb().auditLog.findMany({
      where: {
        entity: `Participant:${held.participantId}`,
        action: "participant.rejoin_refused",
      },
    });

    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test("a forged claim cannot take over another participant", async ({ playwright }) => {
    /**
     * The claim is a signed pointer at a participant. Unsigned, it would be a way to become
     * anybody whose id you had seen — and a student sees their own id in every response, so ids
     * are not secret. This pastes a victim's id in with a plausible but unsigned value.
     */
    const victimApi = await newBrowserApi(playwright);
    const victimName = uniqueName("Victim");
    const victim = await victimApi.joinOrThrow({
      joinCode: seeded.joinCode,
      displayName: victimName,
      divisionId: seeded.divisionIds.get("intermediate") ?? null,
    });

    for (const forged of [
      victim.participantId,
      `${victim.participantId}.${seeded.contestId}`,
      `${victim.participantId}.${seeded.contestId}.not-a-real-signature`,
      `${victim.participantId}.${seeded.contestId}.`,
    ]) {
      const attacker = await playwright.request.newContext({
        storageState: {
          cookies: [
            {
              name: "ptcn_join",
              value: forged,
              domain: "localhost",
              path: "/",
              expires: -1,
              httpOnly: true,
              secure: false,
              sameSite: "Lax" as const,
            },
          ],
          origins: [],
        },
      });
      const attackerApi = new ContestApi(attacker, seeded.contestId);

      // With the forged claim ignored, this is an ordinary join under a taken name: 409, and
      // critically NOT a 200 handing over the victim's participant.
      const envelope = await readEnvelope(
        await attackerApi.join({
          joinCode: seeded.joinCode,
          displayName: victimName,
          divisionId: seeded.divisionIds.get("intermediate") ?? null,
        }),
      );

      expect(envelope.status, `a forged claim (${forged}) was honoured`).toBe(409);
    }
  });

  test("a fresh browser cannot claim a taken name", async ({ playwright }) => {
    // The name is not proof of identity — the join code is read off a board at the front of the
    // room — so a browser with no claim must not be handed somebody else's participant.
    const owner = await newBrowserApi(playwright);
    const displayName = uniqueName("Owner");
    await owner.joinOrThrow({
      joinCode: seeded.joinCode,
      displayName,
      divisionId: seeded.divisionIds.get("intermediate") ?? null,
    });

    const stranger = await newBrowserApi(playwright);
    const envelope = await readEnvelope(
      await stranger.join({
        joinCode: seeded.joinCode,
        displayName,
        divisionId: seeded.divisionIds.get("intermediate") ?? null,
      }),
    );

    expect(envelope.status).toBe(409);
  });

  test("signing out releases the claim, so a shared laptop is not bricked", async ({
    playwright,
  }) => {
    /**
     * The deliberate trade. Sign-out is the explicit "I am done with this browser" action, and a
     * shared classroom machine is a real case: one student finishes, the next sits down. If the
     * claim survived sign-out, the second student could not join at all.
     *
     * It does mean sign-out-then-join draws a second set. That residual is recorded in
     * docs/TODO.md T5 rather than hidden behind a passing test.
     */
    const api = await newBrowserApi(playwright);
    const divisionId = seeded.divisionIds.get("intermediate") ?? null;

    await api.joinOrThrow({
      joinCode: seeded.joinCode,
      displayName: uniqueName("First"),
      divisionId,
    });
    await api.signOutRaw();

    const second = await readEnvelope(
      await api.join({
        joinCode: seeded.joinCode,
        displayName: uniqueName("Second"),
        divisionId,
      }),
    );

    expect(second.status, "the next student on a shared laptop was locked out").toBe(200);
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
    await player.joinOrThrow({
      joinCode: seeded.joinCode,
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

    for (let i = 0; i < 5; i += 1) {
      // The same name every time. A rejoin must present the name it holds; a different one is
      // the sampling attempt, and is refused by the suite above.
      await player.joinOrThrow({
        joinCode: seeded.joinCode,
        displayName: proberName,
        divisionId: seeded.divisionIds.get("intermediate") ?? null,
      });
    }

    const after = (await player.listProblems()).map((problem) => problem.slug).sort();
    expect(after, "re-joining changed which problems this player can see").toEqual(before);

    const envelope = await readEnvelope(await player.getProblemRaw(hiddenSlug));
    expect(envelope.status, "re-joining widened this player's set access").toBeGreaterThanOrEqual(
      400,
    );
  });
});
