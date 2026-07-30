import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { parseServerEnv } from "@/lib/schemas/env";

import { ContestFixtureSchema, type ContestFixture } from "./fixture-schema";

/**
 * The seeded contest G7 and G8 run against.
 *
 * `npm run db:seed` loads 125 problems and leaves every one of them in `DRAFT` — correctly, per
 * PRD §8 — so it cannot on its own produce a contest a competitor can join and submit to. This
 * helper builds that contest: a running window, two divisions, one PUBLISHED problem with real
 * sample and hidden cases, one DRAFT problem to prove the gate, and three rivals whose judged
 * submissions give the leaderboard rows before the spec's own competitor arrives.
 *
 * It writes through Prisma rather than the API because no contest-creation route exists; the
 * admin contest builder renders from fixtures (`components/admin/stub-data.ts`). That is a
 * finding, not a workaround: it is reported with the gate.
 *
 * Test-case paths are stored **absolute**, pointing straight at `fixtures/e2e/testcases/`.
 * `resolveTestDataPath` accepts absolute paths for exactly this reason, and it keeps generated
 * data out of `data/testcases/`.
 */

/**
 * Walk up from the working directory to the checkout root.
 *
 * Neither `__dirname` nor `import.meta.url` is portable across the three runners that import
 * this file (Playwright's CJS loader, `tsx` for the load test, and `tsc` for the typecheck), and
 * guessing wrong yields a fixture path that resolves to nothing rather than an error.
 */
export function repoRoot(): string {
  let candidate = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  throw new Error(`Could not find the repository root from ${process.cwd()}`);
}

const REPO_ROOT = repoRoot();
const FIXTURE_PATH = path.join(REPO_ROOT, "fixtures", "e2e", "contest.json");
const TESTCASE_ROOT = path.join(REPO_ROOT, "fixtures", "e2e", "testcases");
const SOLUTION_ROOT = path.join(REPO_ROOT, "fixtures", "e2e", "solutions");

export function loadContestFixture(): ContestFixture {
  return ContestFixtureSchema.parse(JSON.parse(readFileSync(FIXTURE_PATH, "utf8")));
}

export function readSolution(name: string): string {
  return readFileSync(path.join(SOLUTION_ROOT, name), "utf8");
}

let client: PrismaClient | null = null;

/**
 * A Prisma client for the test process. Separate from `lib/db.ts` on purpose: that one is
 * memoised on `globalThis` for the Next dev server, and a test worker sharing that memo would
 * be reaching into the app's connection pool.
 */
export function testDb(): PrismaClient {
  if (client !== null) return client;
  const env = parseServerEnv();
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  return client;
}

export async function closeTestDb(): Promise<void> {
  if (client === null) return;
  await client.$disconnect();
  client = null;
}

export interface SeededProblem {
  readonly slug: string;
  readonly title: string;
  readonly problemId: string;
  readonly contestProblemId: string;
  readonly divisionId: string;
  readonly basePoints: number;
  readonly state: "DRAFT" | "PUBLISHED" | "RETIRED";
}

export interface SeededContest {
  readonly contestId: string;
  readonly joinCode: string;
  readonly name: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly divisionIds: ReadonlyMap<string, string>;
  readonly problems: ReadonlyMap<string, SeededProblem>;
  readonly rivalIds: ReadonlyMap<string, string>;
}

/** The one PUBLISHED problem every judged spec submits to. */
export function liveProblem(seeded: SeededContest): SeededProblem {
  for (const problem of seeded.problems.values()) {
    if (problem.state === "PUBLISHED") return problem;
  }
  throw new Error("fixtures/e2e/contest.json has no PUBLISHED problem");
}

/** The DRAFT problem, which the API must refuse to a competitor (PRD §8). */
export function draftProblem(seeded: SeededContest): SeededProblem {
  for (const problem of seeded.problems.values()) {
    if (problem.state === "DRAFT") return problem;
  }
  throw new Error("fixtures/e2e/contest.json has no DRAFT problem");
}

/**
 * Remove everything a previous run of this fixture left behind.
 *
 * Scoped to the fixture's own slugs and join code so a stray `--grep` run cannot truncate a
 * developer's real contest.
 *
 * The `ContestProblem` sweep is the important part, and it is keyed on the PROBLEM rather than
 * the contest. The first version deleted the contest by join code and then the problems,
 * relying on the cascade to clear `ContestProblem` — which is only correct if the previous run
 * used the identical join code. It did not: a run from an earlier worktree left a contest
 * coded `E2E-PANTHER` against a fixture now coded `E2E-PANTHERS`, so the delete matched
 * nothing, the stale rows survived, and Postgres correctly refused to drop problems still
 * referenced by them (`ContestProblem_problemId_fkey`).
 *
 * A reset that only works when nothing unexpected is present is not a reset. This one clears
 * every `ContestProblem` pointing at the fixture's problems, whichever contest owns it.
 */
export async function resetE2EData(fixture: ContestFixture = loadContestFixture()): Promise<void> {
  const db = testDb();
  const slugs = fixture.problems.map((problem) => problem.slug);

  const stale = await db.problem.findMany({ where: { slug: { in: slugs } }, select: { id: true } });
  const problemIds = stale.map((problem) => problem.id);

  if (problemIds.length > 0) {
    // Submissions and hint grants hang off ContestProblem with onDelete: Cascade, so removing
    // the join rows takes them with it.
    await db.contestProblem.deleteMany({ where: { problemId: { in: problemIds } } });
  }

  await db.contest.deleteMany({ where: { joinCode: fixture.contest.joinCode } });
  await db.problem.deleteMany({ where: { slug: { in: slugs } } });
}

export interface SeedOptions {
  /** The instant the contest window is built around. Defaults to now. */
  readonly now?: Date;
  /** Extra competitors created directly, for suites that must not spend the join rate limit. */
  readonly extraParticipants?: readonly { readonly displayName: string; readonly divisionKey: string }[];
}

export async function seedE2EContest(options: SeedOptions = {}): Promise<SeededContest> {
  const fixture = loadContestFixture();
  const now = options.now ?? new Date();
  const db = testDb();

  await resetE2EData(fixture);

  const startsAt = new Date(now.getTime() + fixture.contest.startsAtOffsetMinutes * 60_000);
  const endsAt = new Date(now.getTime() + fixture.contest.endsAtOffsetMinutes * 60_000);

  const contest = await db.contest.create({
    data: {
      name: fixture.contest.name,
      joinCode: fixture.contest.joinCode,
      scoringPresetId: fixture.contest.scoringPresetId,
      startsAt,
      endsAt,
      freezeAt: null,
      state: "RUNNING",
      divisions: {
        create: fixture.divisions.map((division) => ({
          name: division.name,
          sortOrder: division.sortOrder,
        })),
      },
    },
    select: { id: true, divisions: { select: { id: true, name: true } } },
  });

  const divisionIds = new Map<string, string>();
  for (const division of fixture.divisions) {
    const row = contest.divisions.find((candidate) => candidate.name === division.name);
    if (row === undefined) throw new Error(`division ${division.name} was not created`);
    divisionIds.set(division.key, row.id);
  }

  const problems = new Map<string, SeededProblem>();
  for (const problem of fixture.problems) {
    const divisionId = divisionIds.get(problem.divisionKey);
    if (divisionId === undefined) {
      throw new Error(`problem ${problem.slug} names an unknown division ${problem.divisionKey}`);
    }

    const created = await db.problem.create({
      data: {
        slug: problem.slug,
        title: problem.title,
        statementMd: problem.statementMd,
        inputSpec: problem.inputSpec,
        outputSpec: problem.outputSpec,
        constraints: problem.constraints,
        difficulty: problem.difficulty,
        state: problem.state,
        type: problem.type,
        timeLimitMs: problem.timeLimitMs,
        memoryLimitMb: problem.memoryLimitMb,
        allowedLanguages: problem.allowedLanguages,
        testCases: {
          create: problem.testCases.map((testCase) => ({
            ordinal: testCase.ordinal,
            inputPath: path.join(TESTCASE_ROOT, testCase.dir, `${testCase.stem}.in`),
            expectedOutputPath: path.join(TESTCASE_ROOT, testCase.dir, `${testCase.stem}.out`),
            isSample: testCase.isSample,
            points: testCase.points,
          })),
        },
      },
      select: { id: true },
    });

    const contestProblem = await db.contestProblem.create({
      data: {
        contestId: contest.id,
        problemId: created.id,
        divisionId,
        slotLabel: problem.slotLabel,
        basePoints: problem.basePoints,
      },
      select: { id: true },
    });

    problems.set(problem.slug, {
      slug: problem.slug,
      title: problem.title,
      problemId: created.id,
      contestProblemId: contestProblem.id,
      divisionId,
      basePoints: problem.basePoints,
      state: problem.state,
    });
  }

  const rivalIds = new Map<string, string>();
  for (const rival of fixture.rivals) {
    const divisionId = divisionIds.get(rival.divisionKey);
    if (divisionId === undefined) {
      throw new Error(`rival ${rival.displayName} names an unknown division ${rival.divisionKey}`);
    }

    const participant = await db.participant.create({
      data: {
        contestId: contest.id,
        displayName: rival.displayName,
        divisionId,
        joinedAt: startsAt,
      },
      select: { id: true },
    });
    rivalIds.set(rival.displayName, participant.id);

    for (const submission of rival.submissions) {
      const target = problems.get(submission.problemSlug);
      if (target === undefined) {
        throw new Error(`rival submission names an unknown problem ${submission.problemSlug}`);
      }
      const submittedAt = new Date(startsAt.getTime() + submission.minutesIn * 60_000);
      await db.submission.create({
        data: {
          participantId: participant.id,
          contestProblemId: target.contestProblemId,
          language: "PYTHON_312",
          sourceCode: readSolution(
            submission.verdict === "AC" ? "accepted.py" : "wrong-answer.py",
          ),
          submittedAt,
          verdict: submission.verdict,
          score: submission.score,
          judgedAt: submittedAt,
        },
      });
    }
  }

  for (const extra of options.extraParticipants ?? []) {
    const divisionId = divisionIds.get(extra.divisionKey);
    if (divisionId === undefined) {
      throw new Error(`extra participant names an unknown division ${extra.divisionKey}`);
    }
    const participant = await db.participant.create({
      data: {
        contestId: contest.id,
        displayName: extra.displayName,
        divisionId,
        joinedAt: startsAt,
      },
      select: { id: true },
    });
    rivalIds.set(extra.displayName, participant.id);
  }

  return {
    contestId: contest.id,
    joinCode: fixture.contest.joinCode,
    name: fixture.contest.name,
    startsAt,
    endsAt,
    divisionIds,
    problems,
    rivalIds,
  };
}
