import { readFile } from "node:fs/promises";

import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import {
  ProblemDetailSchema,
  ProblemSummarySchema,
  type ProblemDetail,
  type ProblemSummary,
} from "@/lib/schemas/api";
import { CLASSIC_PRESET } from "@/lib/types/scoring";
import {
  assertCanReadProblems,
  assertProblemIsLive,
  assertUnlocked,
  isProblemLive,
  isUnlocked,
} from "@/lib/contest/gate";
import { hostLimits } from "@/lib/contest/host";
import { resolveTestDataPath } from "@/lib/contest/judge-job";
import { problemStandingsFor } from "@/lib/contest/standings";
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
}

async function scopeFor(contestId: string, viewer: Viewer): Promise<ViewerScope> {
  if (isAdmin(viewer)) return { admin: true, participantId: null, divisionId: null };

  const competitor = requireCompetitorOf(viewer, contestId);
  const participant = await prisma.participant.findFirst({
    where: { id: competitor.participantId, contestId },
    select: { id: true, divisionId: true },
  });
  if (participant === null) throw new ForbiddenError("Join the contest first");

  return { admin: false, participantId: participant.id, divisionId: participant.divisionId };
}

/** A problem slotted into another division is not this competitor's to see. */
function inScope(problemDivisionId: string | null, scope: ViewerScope): boolean {
  if (scope.admin) return true;
  if (problemDivisionId === null) return true;
  return problemDivisionId === scope.divisionId;
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
    select: { id: true, state: true },
  });
  if (contest === null) throw new NotFoundError("Contest");

  const scope = await scopeFor(contestId, viewer);
  if (!scope.admin) assertCanReadProblems(contest.state);

  const contestProblems = await prisma.contestProblem.findMany({
    where: { contestId },
    select: {
      id: true,
      divisionId: true,
      slotLabel: true,
      basePoints: true,
      unlockAt: true,
      problem: {
        select: { slug: true, title: true, difficulty: true, state: true, isGroupProblem: true },
      },
    },
    orderBy: { slotLabel: "asc" },
  });

  const visible = contestProblems.filter(
    (cp) => inScope(cp.divisionId, scope) && (scope.admin || isProblemLive(cp.problem.state)),
  );

  const [scores, solvedIds] = await Promise.all([
    scope.participantId === null
      ? Promise.resolve(new Map<string, { score: number; hintsTaken: number }>())
      : problemStandingsFor(contestId, scope.participantId, now),
    solvedProblemIds(scope.participantId),
  ]);

  return visible.map((cp) =>
    ProblemSummarySchema.parse({
      contestProblemId: cp.id,
      slug: cp.problem.slug,
      title: cp.problem.title,
      slotLabel: cp.slotLabel,
      difficulty: cp.problem.difficulty,
      basePoints: cp.basePoints,
      isGroupProblem: cp.problem.isGroupProblem,
      bestScore: scores.get(cp.id)?.score ?? null,
      solved: solvedIds.has(cp.id),
      unlocked: scope.admin || isUnlocked(cp.unlockAt, now),
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
    select: { id: true, state: true },
  });
  if (contest === null) throw new NotFoundError("Contest");

  const scope = await scopeFor(contestId, viewer);
  if (!scope.admin) assertCanReadProblems(contest.state);

  const contestProblem = await prisma.contestProblem.findFirst({
    where: { contestId, problem: { slug } },
    select: {
      id: true,
      divisionId: true,
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
          isGroupProblem: true,
          timeLimitMs: true,
          memoryLimitMb: true,
          allowedLanguages: true,
        },
      },
    },
  });

  if (contestProblem === null) throw new NotFoundError("Problem");
  if (!inScope(contestProblem.divisionId, scope)) {
    throw new ForbiddenError("That problem belongs to another division");
  }

  if (!scope.admin) {
    // The DRAFT gate, in the API rather than the UI — this is the check PRD §8 is about.
    assertProblemIsLive(contestProblem.problem.state, contestProblem.problem.slug);
    assertUnlocked(contestProblem.unlockAt, now, contestProblem.problem.slug);
  }

  const [samples, scores, solvedIds, hintsTaken] = await Promise.all([
    loadSamples(contestProblem.problem.id),
    scope.participantId === null
      ? Promise.resolve(new Map<string, { score: number; hintsTaken: number }>())
      : problemStandingsFor(contestId, scope.participantId, now),
    solvedProblemIds(scope.participantId),
    countHints(scope.participantId, contestProblem.id),
  ]);

  return ProblemDetailSchema.parse({
    contestProblemId: contestProblem.id,
    slug: contestProblem.problem.slug,
    title: contestProblem.problem.title,
    slotLabel: contestProblem.slotLabel,
    difficulty: contestProblem.problem.difficulty,
    basePoints: contestProblem.basePoints,
    isGroupProblem: contestProblem.problem.isGroupProblem,
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
  });
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
