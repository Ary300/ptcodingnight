import { readFile } from "node:fs/promises";

import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { startersFor, type StarterCode } from "@/lib/judge/starters";
import type { LanguageId } from "@/lib/judge/runtimes";
import {
  ProblemDetailSchema,
  ProblemSummarySchema,
  type ProblemDetail,
  type ProblemSummary,
  type TeamProblemFeed,
} from "@/lib/schemas/api";
import { SignatureSchema } from "@/lib/schemas/seed";
import { CLASSIC_PRESET } from "@/lib/types/scoring";
import {
  assertCanListProblems,
  assertCanReadProblems,
  assertProblemIsLive,
  assertUnlocked,
  isProblemLive,
  isUnlocked,
} from "@/lib/contest/gate";
import { hostLimits } from "@/lib/contest/host";
import { resolveTestDataPath } from "@/lib/contest/judge-job";
import { problemStandingsFor } from "@/lib/contest/standings";
import { canReadSet } from "@/lib/contest/set-assignment";
import { isAdmin, requireCompetitorOf, type Viewer } from "@/lib/contest/viewer";

/**
 * The problem list and the problem page.
 *
 * Two rules do the work here. First, a `DRAFT` problem never reaches a competitor — filtered
 * out of the list, refused on the detail route, refused again on submit (docs/PRD.md §8).
 * Second, only *sample* cases are ever read off disk and returned; hidden cases are not read at
 * all on this path, so there is nothing to leak.
 */

interface ViewerScope {
  readonly admin: boolean;
  readonly participantId: string | null;
  readonly divisionId: string | null;
  /** The Round 1 set this competitor was assigned. Null for an admin, or before assignment. */
  readonly chosenSetId: string | null;
}

async function scopeFor(contestId: string, viewer: Viewer): Promise<ViewerScope> {
  if (isAdmin(viewer)) {
    return { admin: true, participantId: null, divisionId: null, chosenSetId: null };
  }

  const competitor = requireCompetitorOf(viewer, contestId);
  const participant = await prisma.participant.findFirst({
    where: { id: competitor.participantId, contestId },
    select: { id: true, divisionId: true, chosenSetId: true },
  });
  if (participant === null) throw new ForbiddenError("Join the contest first");

  return {
    admin: false,
    participantId: participant.id,
    divisionId: participant.divisionId,
    chosenSetId: participant.chosenSetId,
  };
}

/** A problem slotted into another division is not this competitor's to see. */
function inScope(problemDivisionId: string | null, scope: ViewerScope): boolean {
  if (scope.admin) return true;
  if (problemDivisionId === null) return true;
  return problemDivisionId === scope.divisionId;
}

/**
 * A problem in a set this competitor was not assigned is not theirs to see.
 *
 * **This is the API-side enforcement of `allowReadingUnassignedSets`** (PRD §6.2). Hiding the other
 * sets in the UI is not enough: the route is callable directly, and a set a competitor can read is a
 * set they can practise on before their own round starts.
 *
 * A GROUP problem has no set and is readable by everyone — that is what makes it a group problem.
 */
function setInScope(
  problemSetId: string | null,
  scope: ViewerScope,
  allowReadingUnassignedSets: boolean,
): boolean {
  if (scope.admin) return true;
  return canReadSet({
    problemSetId,
    participantSetId: scope.chosenSetId,
    allowReadingUnassignedSets,
  });
}

/** What the next hint on a problem costs — a price quote, using the one shared constant. */
export function hintCostFor(basePoints: number): number {
  return Math.round((basePoints * CLASSIC_PRESET.hintCostPercent) / 100);
}

export async function listProblems(
  contestId: string,
  viewer: Viewer,
  now: Date,
): Promise<ProblemSummary[]> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: { id: true, state: true, startsAt: true, allowReadingUnassignedSets: true },
  });
  if (contest === null) throw new NotFoundError("Contest");

  const scope = await scopeFor(contestId, viewer);
  if (!scope.admin) assertCanListProblems(contest.state);

  const contestProblems = await prisma.contestProblem.findMany({
    where: { contestId },
    select: {
      id: true,
      divisionId: true,
      setId: true,
      round: true,
      slotLabel: true,
      basePoints: true,
      unlockAt: true,
      problem: {
        select: { slug: true, title: true, difficulty: true, state: true },
      },
    },
    // Slot labels are validated as unique on write, and id still breaks ties for legacy rows so a
    // replay cannot reorder just because Postgres chose a different plan.
    orderBy: [{ slotLabel: "asc" }, { id: "asc" }],
  });

  const visible = contestProblems.filter(
    (cp) =>
      inScope(cp.divisionId, scope) &&
      setInScope(cp.setId, scope, contest.allowReadingUnassignedSets) &&
      (scope.admin || isProblemLive(cp.problem.state)),
  );

  const [scores, solvedIds] = await Promise.all([
    scope.participantId === null
      ? Promise.resolve(new Map<string, { score: number; hintsTaken: number }>())
      : problemStandingsFor(contestId, scope.participantId, now),
    solvedProblemIds(scope.participantId),
  ]);

  /*
    BEFORE THE GUN, THE TITLES ARE WITHHELD, and that is not decoration.

    A student may now see the SHAPE of a contest that has not started: how many problems, their
    slots, what each is worth. That is what makes a pre-start lobby possible instead of a bare
    "This contest has not started yet".

    What they must not see is WHICH problems. Our bank is seeded from `data/problems_seed.csv`,
    whose titles are the titles of publicly available problems — "A Very Big Sum", "Angry
    Professor". A student handed those ten minutes early does not need our statement at all; they
    can look the problem up, solve it elsewhere, and paste. The slug is derived from the title, so
    it leaks the same thing and is withheld with it.

    Withheld, not omitted: the row still exists, still carries its slot and its points, and still
    reports `unlocked: false`, so the lobby can render a real locked list.
  */
  const started =
    scope.admin ||
    (contest.state !== "SCHEDULED" && now.getTime() >= contest.startsAt.getTime());

  return visible.map((cp) =>
    ProblemSummarySchema.parse({
      contestProblemId: cp.id,
      slug: started ? cp.problem.slug : "",
      title: started ? cp.problem.title : `Problem ${cp.slotLabel}`,
      slotLabel: cp.slotLabel,
      difficulty: cp.problem.difficulty,
      basePoints: cp.basePoints,
      isGroupProblem: cp.round === "GROUP",
      bestScore: scores.get(cp.id)?.score ?? null,
      solved: solvedIds.has(cp.id),
      unlocked: scope.admin || (started && isUnlocked(cp.unlockAt, now)),
    }),
  );
}

/**
 * "Solved" is a fact about verdicts, not a comparison of scores: a full solve that paid for a
 * hint still scores below base, and telling that student they have not solved it would be a
 * lie the scoreboard did not tell.
 */
async function solvedProblemIds(participantId: string | null): Promise<Set<string>> {
  if (participantId === null) return new Set();

  const rows = await prisma.submission.findMany({
    where: { participantId, verdict: "AC" },
    select: { contestProblemId: true },
    distinct: ["contestProblemId"],
  });
  return new Set(rows.map((r) => r.contestProblemId));
}

export async function getProblemDetail(
  contestId: string,
  slug: string,
  viewer: Viewer,
  now: Date,
): Promise<ProblemDetail> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: { id: true, state: true, startsAt: true, allowReadingUnassignedSets: true },
  });
  if (contest === null) throw new NotFoundError("Contest");

  const scope = await scopeFor(contestId, viewer);
  if (!scope.admin) assertCanReadProblems(contest, now);

  const contestProblem = await prisma.contestProblem.findFirst({
    where: { contestId, problem: { slug } },
    select: {
      id: true,
      divisionId: true,
      setId: true,
      round: true,
      slotLabel: true,
      basePoints: true,
      unlockAt: true,
      problem: {
        select: {
          id: true,
          slug: true,
          title: true,
          statementMd: true,
          inputSpec: true,
          outputSpec: true,
          constraints: true,
          difficulty: true,
          state: true,
          timeLimitMs: true,
          memoryLimitMb: true,
          allowedLanguages: true,
          // signature is read SEPARATELY, below, in a query that degrades to null on error. A
          // problem statement must never fail to render because an optional starter-code column
          // is absent - which is exactly what a deploy that ran the code but not the migration
          // produces. Selecting it here would 500 the whole page; there it just omits starters.
        },
      },
    },
  });

  if (contestProblem === null) throw new NotFoundError("Problem");
  if (!inScope(contestProblem.divisionId, scope)) {
    throw new ForbiddenError("That problem belongs to another division");
  }
  // The set gate. This route is the one that returns a full statement, so it is the one that
  // actually leaks a problem if the check is missing.
  if (!setInScope(contestProblem.setId, scope, contest.allowReadingUnassignedSets)) {
    throw new ForbiddenError("That problem is in a set you were not assigned");
  }

  if (!scope.admin) {
    // The DRAFT gate, in the API rather than the UI — this is the check PRD §8 is about.
    assertProblemIsLive(contestProblem.problem.state, contestProblem.problem.slug);
    assertUnlocked(contestProblem.unlockAt, now, contestProblem.problem.slug);
  }

  const [samples, scores, solvedIds, hintsTaken, signature] = await Promise.all([
    loadSamples(contestProblem.problem.id),
    scope.participantId === null
      ? Promise.resolve(new Map<string, { score: number; hintsTaken: number }>())
      : problemStandingsFor(contestId, scope.participantId, now),
    solvedProblemIds(scope.participantId),
    countHints(scope.participantId, contestProblem.id),
    readProblemSignature(contestProblem.problem.id),
  ]);

  return ProblemDetailSchema.parse({
    contestProblemId: contestProblem.id,
    slug: contestProblem.problem.slug,
    title: contestProblem.problem.title,
    slotLabel: contestProblem.slotLabel,
    difficulty: contestProblem.problem.difficulty,
    basePoints: contestProblem.basePoints,
    isGroupProblem: contestProblem.round === "GROUP",
    bestScore: scores.get(contestProblem.id)?.score ?? null,
    solved: solvedIds.has(contestProblem.id),
    unlocked: scope.admin || isUnlocked(contestProblem.unlockAt, now),
    statementMd: contestProblem.problem.statementMd,
    inputSpec: contestProblem.problem.inputSpec,
    outputSpec: contestProblem.problem.outputSpec,
    constraints: contestProblem.problem.constraints,
    timeLimitMs: contestProblem.problem.timeLimitMs,
    memoryLimitMb: contestProblem.problem.memoryLimitMb,
    allowedLanguages: contestProblem.problem.allowedLanguages,
    samples,
    hintsTaken,
    hintCost: hintCostFor(contestProblem.basePoints),
    starters: startersFromStoredSignature(
      signature,
      contestProblem.problem.allowedLanguages,
      contestProblem.problem.slug,
    ),
  });
}

/**
 * The starters a problem detail carries, generated fresh from the stored signature declaration.
 *
 * Generated on every read, never persisted: the emitters in `lib/judge/starters/` are the source
 * of truth, and a stored copy of their output goes stale the moment an emitter improves. They are
 * only attached here, on the detail path, so they sit behind the same statement gate as the
 * statement itself; the pre-start list, which withholds titles, never carries them.
 *
 * `undefined`, not `[]`, for a problem with no signature. That is most of the bank, and the
 * absence is what the client branches on: no starters means an empty editor, exactly as before
 * this feature existed. `ProblemDetailSchema.starters` is optional for the same reason.
 *
 * The signature column is `Json?`, so what comes back from Prisma is untrusted shape. It is
 * validated here, at the boundary, rather than assumed: a row that fails `SignatureSchema` is a
 * content bug, not a reason the problem page cannot render, so it logs and degrades to the
 * no-signature behaviour instead of throwing. This mirrors `readIfPresent` below.
 */
function startersFromStoredSignature(
  raw: unknown,
  allowedLanguages: readonly LanguageId[],
  slug: string,
): StarterCode[] | undefined {
  if (raw === null || raw === undefined) return undefined;

  const parsed = SignatureSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "problem.signature_invalid",
        slug,
        message: parsed.error.message,
      }),
    );
    return undefined;
  }

  return startersFor(parsed.data, allowedLanguages);
}

/**
 * Read a problem's stored signature, degrading to `null` on ANY database error.
 *
 * Kept out of the main problem select and given its own error boundary for one reason: a problem
 * STATEMENT must render even when the starter-code column cannot be read. The failure this guards
 * against is concrete and has already happened once in this session as a 500 on every problem
 * page: the code that selects `signature` shipped, but `prisma migrate deploy` did not run, so the
 * column did not exist and the whole query threw "Unknown field signature". Starters are a
 * convenience; the statement is the contest. Losing the convenience must not lose the contest.
 *
 * A caught error logs and returns null, which `startersFromStoredSignature` reads as "no
 * signature" - the same clean absence as a problem that never had one.
 */
async function readProblemSignature(problemId: string): Promise<unknown> {
  try {
    const row = await prisma.problem.findUnique({
      where: { id: problemId },
      select: { signature: true },
    });
    return row?.signature ?? null;
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "problem.signature_unreadable",
        problemId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return null;
  }
}

async function countHints(participantId: string | null, contestProblemId: string): Promise<number> {
  if (participantId === null) return 0;
  return prisma.hintGrant.count({ where: { participantId, contestProblemId } });
}

/**
 * Read the sample cases off disk.
 *
 * `where: { isSample: true }` is load-bearing. Widening this query is how the hidden cases end
 * up in a response, so it stays narrow and the caller has no way to ask for more.
 */
async function loadSamples(
  problemId: string,
): Promise<{ ordinal: number; input: string; expectedOutput: string }[]> {
  const cases = await prisma.testCase.findMany({
    where: { problemId, isSample: true },
    select: { ordinal: true, inputPath: true, expectedOutputPath: true },
    orderBy: { ordinal: "asc" },
  });

  const root = hostLimits().testDataRoot;

  return Promise.all(
    cases.map(async (testCase) => ({
      ordinal: testCase.ordinal,
      input: await readIfPresent(resolveTestDataPath(root, testCase.inputPath)),
      expectedOutput: await readIfPresent(resolveTestDataPath(root, testCase.expectedOutputPath)),
    })),
  );
}

/** A missing sample file is a content bug, not a reason the problem page cannot render. */
async function readIfPresent(absolutePath: string): Promise<string> {
  try {
    return await readFile(absolutePath, "utf8");
  } catch (error: unknown) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "problem.sample_missing",
        path: absolutePath,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return "";
  }
}

/**
 * The team's shared attempt log for one GROUP problem: who submitted, when, and what the judge
 * said. ICPC gets this for free by putting three people behind one keyboard; a team on separate
 * laptops gets it here instead, so "is anyone on the group problem" has an answer that is not
 * shouting across the room.
 *
 * What it deliberately is NOT:
 * - Not code sharing. Verdict, score and time only - never source, never a diff. Teammates
 *   coordinate through it; they do not review each other's submissions through it.
 * - Not a standings read. It shows the viewer's OWN team only, so a freeze has nothing to hide
 *   here - a team always knows what it just did.
 * - Not available on individual problems. Requesting one answers 404, because a feed of
 *   teammates' attempts on a problem the round says is personal would be a form of answer
 *   sharing ("she got AC, go ask her").
 *
 * A viewer on no team gets `teamName: null` and an empty log rather than an error: the screen
 * renders "join a team" copy instead of failing a poll.
 */
export async function getTeamProblemFeed(
  contestId: string,
  slug: string,
  viewer: Viewer,
  now: Date,
): Promise<TeamProblemFeed> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: { id: true, state: true, startsAt: true, endsAt: true, freezeAt: true },
  });
  if (contest === null) throw new NotFoundError("Contest");

  const scope = await scopeFor(contestId, viewer);
  if (!scope.admin) assertCanReadProblems(contest, now);

  const contestProblem = await prisma.contestProblem.findFirst({
    where: { contestId, problem: { slug } },
    select: { id: true, round: true, problem: { select: { state: true, slug: true } } },
  });
  if (contestProblem === null || contestProblem.round !== "GROUP") {
    throw new NotFoundError("Problem");
  }
  if (!scope.admin) {
    assertProblemIsLive(contestProblem.problem.state, contestProblem.problem.slug);
  }

  const me =
    scope.participantId === null
      ? null
      : await prisma.participant.findUnique({
          where: { id: scope.participantId },
          select: { teamId: true, team: { select: { name: true } } },
        });
  if (me === null || me.teamId === null) {
    return { teamName: null, bestScore: 0, entries: [] };
  }

  const rows = await prisma.submission.findMany({
    where: {
      contestProblemId: contestProblem.id,
      participant: { teamId: me.teamId },
    },
    orderBy: { submittedAt: "desc" },
    take: 50,
    select: {
      id: true,
      language: true,
      submittedAt: true,
      verdict: true,
      score: true,
      participantId: true,
      participant: { select: { displayName: true } },
    },
  });

  return {
    teamName: me.team?.name ?? null,
    // The same rule the scoring engine applies: best single submission, never a merge. Stated
    // here so the panel can print the banked score without re-deriving scoring client-side.
    bestScore: rows.reduce((best, row) => Math.max(best, row.score), 0),
    entries: rows.map((row) => ({
      submissionId: row.id,
      displayName: row.participant.displayName,
      mine: row.participantId === scope.participantId,
      language: row.language,
      submittedAt: row.submittedAt.toISOString(),
      verdict: row.verdict,
      score: row.score,
    })),
  };
}
