/**
 * Seeds a DEMO contest that looks like a real one.
 *
 *   npx tsx scripts/seed-demo.ts
 *
 * `prisma/seed.ts` loads the problem BANK — 125 problems, titles and history only, every one of
 * them `DRAFT` with an empty statement. That is correct and it is not a contest: a visitor to a
 * freshly seeded deployment sees an empty board and no problems, which reads as broken.
 *
 * This script makes the board show something true. It publishes the problems that have real
 * authored content in `content/problems/`, builds one contest around them, and fills in enough
 * history that the leaderboard is populated on first load.
 *
 * ## Three deliberate choices
 *
 * **Teams of different sizes.** Panthers has three players, Cubs has two. A team score is a MEAN
 * — the player pool divided by team size — and two equal teams hide every division bug there is,
 * including the one that cost a student a point in the spreadsheet this replaced
 * (docs/SCORING.md §2.1). Different sizes make the divisor visible on the screen.
 *
 * **No divisions, and no problem sets.** Both are real features with real coverage, and both
 * SCOPE what a participant may see: a player with no division sees no divisioned problem, and a
 * player is assigned exactly one set. On a public demo, a visitor who joins with the code has
 * neither, so either feature turns "join the demo" into "see an empty list". The demo contest is
 * therefore flat, and the scoping features are exercised by G7 instead.
 *
 * **Submissions carry a verdict but no judge run.** These rows are written directly rather than
 * pushed through the queue: seeding must not depend on Docker, and a demo that takes twenty
 * minutes to seed is a demo nobody runs. Everything a NEW submission does still goes through the
 * real judge — this only backfills history.
 *
 * Idempotent: it deletes its own contest by join code and rebuilds it. It never touches problems
 * it did not publish, and never touches another contest.
 */

import "dotenv/config";

import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Language, type Prisma } from "@prisma/client";

import { resolveTestDataPath } from "@/lib/contest/judge-job";
import { parseServerEnv } from "@/lib/schemas/env";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = path.join(ROOT, "content", "problems");

/**
 * The demo contest's identity. Re-running replaces exactly this and nothing else.
 *
 * **The join code is generated, not committed.** It was the literal `"PANTHERS"`, and
 * `docs/DEPLOY.md` §8.4 tells the operator to run this script on the production box — so the
 * credential admitting anyone to a `RUNNING` contest was published in the repository. Anyone who
 * had read it, or who guessed the school mascot, could join `https://ptcodingnight.com`, take a
 * session, read every problem statement, and drive the judge queue on a 2 vCPU box.
 *
 * `SEED_JOIN_CODE` overrides it for a repeatable local demo. The generated value is printed at
 * the end, and DEPLOY.md tells the operator to write it down.
 */
const JOIN_CODE = process.env.SEED_JOIN_CODE ?? randomBytes(4).toString("hex").toUpperCase();
const CONTEST_NAME = "Park Tudor Coding Night — Demo";

/**
 * How many authored problems the demo carries.
 *
 * All of them would be a better contest and a worse demo: twenty problems on the lobby screen
 * buries the thing a visitor came to look at. Six is enough to fill a board and to give the two
 * teams different results.
 */
const PROBLEM_COUNT = 6;

/** Points per problem. Flat, because the demo is about the team formula rather than weighting. */
const BASE_POINTS = 100;

interface ProblemManifest {
  readonly slug: string;
  readonly title: string;
  readonly difficulty: "E" | "M" | "H";
  readonly timeLimitMs: number;
  readonly memoryLimitMb: number;
  readonly allowedLanguages: readonly Language[];
  readonly sampleCount: number;
  readonly originAttribution?: string;
}

function authoredProblems(): ProblemManifest[] {
  if (!existsSync(CONTENT)) {
    throw new Error(
      `No authored content at ${CONTENT}. This deployment cannot seed a demo without it.`,
    );
  }

  const slugs = readdirSync(CONTENT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((slug) => existsSync(path.join(CONTENT, slug, "problem.json")))
    // Sorted, so the demo is the same demo every time it is seeded. An arbitrary readdir order
    // would give a different six problems on a different machine, which makes "it worked on
    // mine" impossible to check.
    .sort();

  return slugs.slice(0, PROBLEM_COUNT).map((slug) => {
    const manifest = JSON.parse(
      readFileSync(path.join(CONTENT, slug, "problem.json"), "utf8"),
    ) as ProblemManifest;
    return manifest;
  });
}

/**
 * The test cases for a problem, as stored paths.
 *
 * Paths, never blobs (PRD §5) — and RELATIVE to the test-data root, so the same rows work on a
 * laptop and in a container where the content is mounted somewhere else entirely. An absolute
 * path here is the classic way a seeded database stops working the moment it moves.
 */
function testCasesFor(
  slug: string,
  sampleCount: number,
  testDataRoot: string,
): Prisma.TestCaseCreateWithoutProblemInput[] {
  const testDir = path.join(CONTENT, slug, "tests");
  if (!existsSync(testDir)) return [];

  const inputs = readdirSync(testDir)
    .filter((name) => name.endsWith(".in"))
    .sort();

  return inputs.map((name, index) => {
    const base = name.replace(/\.in$/, "");
    const inputPath = path.posix.join(slug, "tests", name);
    const expectedOutputPath = path.posix.join(slug, "tests", `${base}.out`);

    /**
     * Prove the stored path RESOLVES before writing it.
     *
     * A stored path that does not resolve is not a seeding error you find at seeding time — the
     * seed succeeds, the board looks right, and the failure arrives as verdict `IE` on a
     * student's submission during the contest. Measured, on the first run of this script:
     *
     *   ENOENT: .../data/testcases/a-very-big-sum/tests/01.out
     *
     * because these paths are relative to the CONTENT directory while `TEST_DATA_ROOT` pointed
     * somewhere else entirely. Checking here turns a contest-night `IE` into a seed that refuses
     * to finish and says which variable is wrong.
     */
    for (const stored of [inputPath, expectedOutputPath]) {
      const resolved = resolveTestDataPath(testDataRoot, stored);
      if (!existsSync(resolved)) {
        throw new Error(
          `Test data for ${slug} does not resolve.\n` +
            `  stored path:    ${stored}\n` +
            `  TEST_DATA_ROOT: ${testDataRoot}\n` +
            `  resolves to:    ${resolved}\n\n` +
            `These paths are relative to the authored content directory. Set TEST_DATA_ROOT to\n` +
            `${CONTENT} (or ./content/problems) and re-run.`,
        );
      }
    }

    return {
      // 1-based, matching TestCase.ordinal everywhere else and what the UI renders.
      ordinal: index + 1,
      inputPath,
      expectedOutputPath,
      isSample: index < sampleCount,
      points: 10,
      group: null,
    };
  });
}

/** A whole-number score for a verdict. The judge computes these for real; this is history. */
function scoreFor(verdict: "AC" | "WA", testCount: number): number {
  return verdict === "AC" ? testCount * 10 : 0;
}

async function main(): Promise<void> {
  const env = parseServerEnv();
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const manifests = authoredProblems();
    if (manifests.length === 0) {
      throw new Error(`No problems with a problem.json under ${CONTENT}`);
    }

    console.log(`Publishing ${String(manifests.length)} authored problems…`);

    const problemIds = new Map<string, string>();
    const testCounts = new Map<string, number>();

    for (const manifest of manifests) {
      const statementPath = path.join(CONTENT, manifest.slug, "statement.md");
      const statement = existsSync(statementPath) ? readFileSync(statementPath, "utf8") : "";
      const cases = testCasesFor(manifest.slug, manifest.sampleCount, env.TEST_DATA_ROOT);

      if (statement.trim() === "" || cases.length === 0) {
        // A problem with no statement or no tests must stay DRAFT. Publishing one would put a
        // blank page in front of a student, and the API refuses DRAFT problems in a live
        // contest precisely so this cannot happen by accident (PRD §8).
        console.log(`  skipped ${manifest.slug}: no statement or no test cases`);
        continue;
      }

      // Replace the cases rather than adding to them, so re-running does not double them up.
      const existing = await prisma.problem.findUnique({
        where: { slug: manifest.slug },
        select: { id: true },
      });
      if (existing !== null) {
        await prisma.testCase.deleteMany({ where: { problemId: existing.id } });
      }

      const problem = await prisma.problem.upsert({
        where: { slug: manifest.slug },
        create: {
          slug: manifest.slug,
          title: manifest.title,
          statementMd: statement,
          difficulty: manifest.difficulty,
          state: "PUBLISHED",
          type: "ALGORITHM",
          round: "INDIVIDUAL",
          timeLimitMs: manifest.timeLimitMs,
          memoryLimitMb: manifest.memoryLimitMb,
          allowedLanguages: [...manifest.allowedLanguages],
          originAttribution: manifest.originAttribution ?? null,
          testCases: { create: cases },
        },
        update: {
          title: manifest.title,
          statementMd: statement,
          difficulty: manifest.difficulty,
          state: "PUBLISHED",
          timeLimitMs: manifest.timeLimitMs,
          memoryLimitMb: manifest.memoryLimitMb,
          allowedLanguages: [...manifest.allowedLanguages],
          testCases: { create: cases },
        },
        select: { id: true },
      });

      problemIds.set(manifest.slug, problem.id);
      testCounts.set(manifest.slug, cases.length);
      console.log(`  ${manifest.slug}: ${String(cases.length)} test cases`);
    }

    // --- the contest -------------------------------------------------------
    // Deleted by join code and rebuilt. Cascades take its participants, teams, submissions and
    // ContestProblem rows with it; the PROBLEMS survive, because they are shared with the bank.
    await prisma.contest.deleteMany({ where: { joinCode: JOIN_CODE } });

    const now = new Date();
    const startsAt = new Date(now.getTime() - 45 * 60_000);
    const endsAt = new Date(now.getTime() + 3 * 60 * 60_000);

    const contest = await prisma.contest.create({
      data: {
        name: CONTEST_NAME,
        joinCode: JOIN_CODE,
        scoringPresetId: "classic",
        startsAt,
        endsAt,
        freezeAt: null,
        /**
         * Formation stays open for the whole demo window, which is the ONE place this contest
         * differs from a real one.
         *
         * The default rule is that team sign-up closes at `startsAt`: students arrive, form
         * teams, then compete. A demo has to show both halves at once — a visitor should be able
         * to make a team AND submit — and `startsAt` is in the past so submissions are accepted.
         * Overriding the window is exactly what the column exists for.
         */
        teamFormationClosesAt: endsAt,
        state: "RUNNING",
        // No divisions and no problem sets — see the header. Both would scope a joining
        // visitor out of every problem on the board.
        setSelection: "PLAYER_CHOOSES",
        allowReadingUnassignedSets: true,
        // Fixed join codes, unlike the CONTEST code above which is generated. These are not a
        // credential — a team code only puts you on a team an organizer can move you off — and a
        // demo whose team codes change on every seed is one nobody can write instructions for.
        teams: {
          create: [
            { name: "Panthers", joinCode: "PANTH1" },
            { name: "Cubs", joinCode: "CUBS22" },
          ],
        },
      },
      select: { id: true, teams: { select: { id: true, name: true } } },
    });

    const teamId = new Map(contest.teams.map((team) => [team.name, team.id]));

    const contestProblems = await Promise.all(
      [...problemIds.values()].map((problemId, index) =>
        prisma.contestProblem.create({
          data: {
            contestId: contest.id,
            problemId,
            setId: null,
            divisionId: null,
            slotLabel: String.fromCharCode(65 + index),
            basePoints: BASE_POINTS,
            unlockAt: null,
          },
          select: { id: true, problem: { select: { slug: true } } },
        }),
      ),
    );

    const contestProblemId = new Map(
      contestProblems.map((cp) => [cp.problem.slug, cp.id]),
    );

    // --- rosters -----------------------------------------------------------
    // THREE and TWO. The team score is a mean, so equal sizes would hide every divisor bug.
    const roster: readonly { name: string; team: string }[] = [
      { name: "Ada", team: "Panthers" },
      { name: "Grace", team: "Panthers" },
      { name: "Alan", team: "Panthers" },
      { name: "Katherine", team: "Cubs" },
      { name: "Dorothy", team: "Cubs" },
    ];

    const participantId = new Map<string, string>();
    for (const [index, member] of roster.entries()) {
      const participant = await prisma.participant.create({
        data: {
          contestId: contest.id,
          displayName: member.name,
          teamId: teamId.get(member.team) ?? null,
          divisionId: null,
          chosenSetId: null,
          joinedAt: new Date(startsAt.getTime() + index * 30_000),
        },
        select: { id: true },
      });
      participantId.set(member.name, participant.id);
    }

    // --- submission history ------------------------------------------------
    // Enough that the board is populated and the two teams differ, with a WA in it so the
    // penalty column is not uniformly zero and the rank order is not simply the roster order.
    const slugs = [...problemIds.keys()];
    const history: readonly { who: string; slugIndex: number; verdict: "AC" | "WA" }[] = [
      { who: "Ada", slugIndex: 0, verdict: "AC" },
      { who: "Ada", slugIndex: 1, verdict: "AC" },
      { who: "Ada", slugIndex: 2, verdict: "WA" },
      { who: "Ada", slugIndex: 2, verdict: "AC" },
      { who: "Grace", slugIndex: 0, verdict: "AC" },
      { who: "Grace", slugIndex: 3, verdict: "AC" },
      { who: "Alan", slugIndex: 1, verdict: "WA" },
      { who: "Alan", slugIndex: 4, verdict: "AC" },
      { who: "Katherine", slugIndex: 0, verdict: "AC" },
      { who: "Katherine", slugIndex: 1, verdict: "AC" },
      { who: "Katherine", slugIndex: 2, verdict: "AC" },
      { who: "Dorothy", slugIndex: 3, verdict: "AC" },
      { who: "Dorothy", slugIndex: 4, verdict: "WA" },
    ];

    let minute = 4;
    for (const entry of history) {
      const slug = slugs[entry.slugIndex];
      if (slug === undefined) continue;

      const cpId = contestProblemId.get(slug);
      const pid = participantId.get(entry.who);
      if (cpId === undefined || pid === undefined) continue;

      const submittedAt = new Date(startsAt.getTime() + minute * 60_000);
      minute += 3;

      await prisma.submission.create({
        data: {
          participantId: pid,
          contestProblemId: cpId,
          language: "PYTHON_312",
          sourceCode: "# seeded demo submission — see scripts/seed-demo.ts\n",
          submittedAt,
          verdict: entry.verdict,
          score: scoreFor(entry.verdict, testCounts.get(slug) ?? 10),
          runtimeMs: 30 + (minute % 7) * 11,
          memoryKb: 12_000,
          judgedAt: new Date(submittedAt.getTime() + 4_000),
        },
      });
    }

    // Side activities, so the "+ side" term in the team formula is not always zero.
    const panthers = teamId.get("Panthers");
    if (panthers !== undefined) {
      await prisma.teamSideActivity.create({
        data: {
          teamId: panthers,
          label: "Rubik's cube relay",
          points: 50,
          // Never a bare display name — `actorLabel()` exists so an audit row says WHICH admin,
          // and a seeded row should be identifiable as seeded rather than blamed on a person.
          enteredBy: "script:seed-demo",
        },
      });
    }

    console.log("");
    console.log(`Contest:    ${CONTEST_NAME}`);
    console.log(`Join code:  ${JOIN_CODE}`);
    console.log("");
    console.log("WRITE THE JOIN CODE DOWN. It is generated per seed and is the credential that");
    console.log("admits anyone to this contest — set SEED_JOIN_CODE to pin it instead.");
    console.log(`Problems:   ${String(contestProblems.length)}`);
    console.log(`Teams:      Panthers (3 players), Cubs (2 players)`);
    console.log(`Submissions: ${String(history.length)}`);
    console.log("");
    console.log("Team size is the DIVISOR in a team score — the two teams differ on purpose,");
    console.log("so the mean is visibly doing work on the board rather than looking like a sum.");
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
