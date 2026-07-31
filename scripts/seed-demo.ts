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
 * **Two problem sets and two group problems. No divisions.**
 *
 * Sets are the format (PRD §6.2) and they are what the team board's set columns are built from —
 * a flat contest degrades that grid to rank/name/score and shows none of the structure a visitor
 * came to look at. Each seeded student is assigned a set and sees four problems: their own two,
 * plus the two group problems everyone shares.
 *
 * This used to say sets were off because they SCOPE what a participant may see, and a visitor
 * joining with the code has none — turning "join the demo" into "see an empty list". That
 * reasoning was sound and the conclusion was wrong, because `allowReadingUnassignedSets` already
 * answers it: `canReadSet` consults that flag on the read path AND the submit path, so an
 * unassigned visitor can still open and submit everything. Sets scope the seeded students; they
 * scope nobody out.
 *
 * Divisions stay off. They have no such escape hatch, and a divisionless visitor really would
 * see nothing.
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

/**
 * How the six problems divide: two per set, two shared by everyone.
 *
 * Module scope because it decides TWO things in two different places, and they must agree:
 *
 *   - `ContestProblem.setId` — which set a problem belongs to, `null` meaning every player sees it.
 *   - `Problem.round` — whether the scoring engine counts it as GROUP points.
 *
 * Those are not the same field and getting only the first right is the mistake this shape exists
 * to prevent: a problem with `setId: null` is visible to everyone and still scores to the
 * individual pool, so the board's Group column stays empty while the problems look shared. Group
 * detection reads `Problem.round`, and nothing else.
 */
const LAYOUT: readonly { readonly set: "A" | "B" | null; readonly slot: string }[] = [
  { set: "A", slot: "A1" },
  { set: "A", slot: "A2" },
  { set: "B", slot: "B1" },
  { set: "B", slot: "B2" },
  { set: null, slot: "G1" },
  { set: null, slot: "G2" },
];

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

    for (const [index, manifest] of manifests.entries()) {
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
          round: LAYOUT[index]?.set === null ? "GROUP" : "INDIVIDUAL",
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
          // Set on UPDATE as well as on create. Without this a re-seed leaves a row that was
          // INDIVIDUAL the first time exactly as it was, and the Group column is empty on every
          // run after the first — with the seed reporting success.
          round: LAYOUT[index]?.set === null ? "GROUP" : "INDIVIDUAL",
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
    /*
      Deleted by NAME, not by join code.
      
      The join code is generated per run unless SEED_JOIN_CODE pins it, so keying the cleanup on
      it made "idempotent" false in the normal case: every run left the previous demo contest
      behind. Six had accumulated locally before anyone noticed, because nothing surfaces a stale
      contest — until now. Signing in enrols a competitor into the most recent enrollable contest
      (lib/contest/enrolment.ts), so a pile of demo contests is not clutter any more, it is a
      student landing in the wrong one.
      
      Name is the right key because the name is what identifies THIS seed's contest across runs.
    */
    await prisma.contest.deleteMany({ where: { name: CONTEST_NAME } });

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
        /**
         * Two problem sets, and no divisions.
         *
         * Sets are the format (PRD §6.2) and the team board's set columns are the whole point of
         * that grid — without them the board degrades to rank/name/score and shows none of the
         * structure a visitor came to see. Two sets and two group problems is the smallest
         * arrangement that demonstrates it: every team ends up with players in both columns.
         *
         * `allowReadingUnassignedSets` is what makes this safe for a DEMO specifically. It is the
         * flag `canReadSet` consults on BOTH the read path and the submit path, so a visitor who
         * joins with the code and has no set yet can still open and submit every problem. The
         * seeded students are assigned; a passer-by is not scoped out of anything.
         *
         * A real contest leaves that flag false, which is its default — reading another set is a
         * fairness problem and scoring on one is a correctness problem.
         */
        setSelection: "RANDOM_ASSIGNED",
        /*
          A fixed seed, so the demo assigns sets and does so REPRODUCIBLY.

          `ensureSetAssigned` is a no-op unless the contest is RANDOM_ASSIGNED and carries a seed —
          so under the previous PLAYER_CHOOSES a visitor who joined a team got no set at all and
          never appeared in a set column. The grid worked for seeded students and silently did not
          work for anyone who actually used the demo.

          The seed is pinned rather than generated because assignment must be re-derivable: an
          organizer settles "why am I in set B" by recomputing it, which is the whole reason the
          column exists on the Contest row.
        */
        setAssignmentSeed: "demo-set-seed-2026",
        allowReadingUnassignedSets: true,
        problemSets: { create: [{ label: "A" }, { label: "B" }] },
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
      select: {
        id: true,
        teams: { select: { id: true, name: true } },
        problemSets: { select: { id: true, label: true } },
      },
    });

    const teamId = new Map(contest.teams.map((team) => [team.name, team.id]));
    const setId = new Map(contest.problemSets.map((set) => [set.label, set.id]));

    const contestProblems = await Promise.all(
      [...problemIds.values()].map((problemId, index) => {
        const layout = LAYOUT[index];
        return prisma.contestProblem.create({
          data: {
            contestId: contest.id,
            problemId,
            setId: layout?.set === undefined || layout.set === null ? null : (setId.get(layout.set) ?? null),
            divisionId: null,
            slotLabel: layout?.slot ?? String.fromCharCode(65 + index),
            basePoints: BASE_POINTS,
            unlockAt: null,
          },
          select: { id: true, problem: { select: { slug: true } } },
        });
      }),
    );

    const contestProblemId = new Map(
      contestProblems.map((cp) => [cp.problem.slug, cp.id]),
    );

    // --- rosters -----------------------------------------------------------
    // THREE and TWO. The team score is a mean, so equal sizes would hide every divisor bug.
    /**
     * Sets are mixed WITHIN each team on purpose.
     *
     * The board's set columns only demonstrate anything if both teams have somebody in both, and
     * a roster where one team is all-A and the other all-B produces a grid full of em-dashes that
     * looks broken rather than sparse. Panthers field two in A and one in B; Cubs one of each —
     * which also puts two names in a single cell, so the "more than one player in a set" case is
     * visible rather than theoretical.
     */
    const roster: readonly { name: string; team: string; set: "A" | "B" }[] = [
      { name: "Ada", team: "Panthers", set: "A" },
      { name: "Grace", team: "Panthers", set: "B" },
      { name: "Alan", team: "Panthers", set: "A" },
      { name: "Katherine", team: "Cubs", set: "B" },
      { name: "Dorothy", team: "Cubs", set: "A" },
    ];

    const participantId = new Map<string, string>();
    for (const [index, member] of roster.entries()) {
      const participant = await prisma.participant.create({
        data: {
          contestId: contest.id,
          displayName: member.name,
          teamId: teamId.get(member.team) ?? null,
          divisionId: null,
          chosenSetId: setId.get(member.set) ?? null,
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

    /**
     * Every entry is on the submitter's OWN set, or on a group problem.
     *
     * Not tidiness — coherence. `canReadSet` guards the submit path, so a student submitting to
     * another set's problem is something the API would refuse. Seeding it anyway writes rows the
     * running system could never have produced, and a demo whose data contradicts its own rules
     * is worse than a demo with less data: the first person to notice cannot tell whether they
     * have found a seeding shortcut or a hole in the set gate.
     *
     * Indices follow LAYOUT above: 0,1 are set A; 2,3 are set B; 4,5 are group.
     */
    const history: readonly { who: string; slugIndex: number; verdict: "AC" | "WA" }[] = [
      // Ada (A) — a WA before the AC, so penalty minutes are not uniformly zero.
      { who: "Ada", slugIndex: 0, verdict: "AC" },
      { who: "Ada", slugIndex: 1, verdict: "WA" },
      { who: "Ada", slugIndex: 1, verdict: "AC" },
      // Grace (B)
      { who: "Grace", slugIndex: 2, verdict: "AC" },
      { who: "Grace", slugIndex: 3, verdict: "AC" },
      // Alan (A) — plus a group problem, which scores for the TEAM rather than the player.
      { who: "Alan", slugIndex: 0, verdict: "AC" },
      { who: "Alan", slugIndex: 4, verdict: "AC" },
      // Katherine (B)
      { who: "Katherine", slugIndex: 2, verdict: "AC" },
      { who: "Katherine", slugIndex: 3, verdict: "AC" },
      // Dorothy (A) — and the other group problem, so both teams have one.
      { who: "Dorothy", slugIndex: 1, verdict: "AC" },
      { who: "Dorothy", slugIndex: 5, verdict: "WA" },
      { who: "Dorothy", slugIndex: 5, verdict: "AC" },
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
