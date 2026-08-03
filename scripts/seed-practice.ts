// Standalone tsx entrypoint — load .env before anything reads process.env.
import "dotenv/config";

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";

import { resolveTestDataPath } from "@/lib/contest/judge-job";
import { parseProblemManifest, type ProblemManifest } from "@/lib/schemas/seed";
import { parseServerEnv } from "@/lib/schemas/env";

/**
 * Seeds THE PRACTICE ARENA: one permanent contest anyone signed in can use to try the site,
 * built from the `content/problems/practice-*` questions.
 *
 * ## Why the arena exists
 *
 * Sign-in used to refuse a student flatly when no contest was open ("there is nothing to
 * enroll you in"), which made the site a locked door 364 days a year. The organizer's call:
 * let people in, give them a handful of sample questions - two easy, two medium, two hard -
 * that exist only to be tried, never to be scored. `ensureEnrolled` falls back to the arena
 * when no real contest is open, and ranks every real contest above it on the night.
 *
 * ## The properties that make it an ARENA and not a contest
 *
 *  - `isPractice: true`: sign-in ranks it last, the projector's default pick skips it, and
 *    the clock reconciler never starts or ends it.
 *  - The window is decades wide, so every gate that checks the clock finds it open.
 *  - Its problems are `practiceOnly`: the line-up API refuses them for any other contest,
 *    because a question that is public all year cannot be in a scored round.
 *
 * Idempotent: keyed on the fixed join code, deletes and rebuilds its own lineup, and never
 * touches any other contest or problem.
 */

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, "content", "problems");
const ARENA_JOIN_CODE = "PRACTICE-ARENA";
const ARENA_NAME = "Practice Arena";

/** Wide open, permanently: started at the project's founding, ends far beyond the room. */
const ARENA_STARTS_AT = new Date("2026-01-01T00:00:00.000Z");
const ARENA_ENDS_AT = new Date("2100-01-01T00:00:00.000Z");

function practiceManifests(): ProblemManifest[] {
  if (!existsSync(CONTENT)) throw new Error(`${CONTENT} does not exist`);
  const manifests: ProblemManifest[] = [];
  for (const slug of readdirSync(CONTENT).sort()) {
    if (!slug.startsWith("practice-")) continue;
    const file = path.join(CONTENT, slug, "problem.json");
    if (!existsSync(file)) continue;
    const manifest = parseProblemManifest(JSON.parse(readFileSync(file, "utf8")), file);
    if (manifest.practiceOnly !== true) {
      throw new Error(
        `${file} is under a practice- slug but does not declare practiceOnly: true. ` +
          "The flag is what keeps the line-up API from letting it into a scored contest.",
      );
    }
    manifests.push(manifest);
  }
  return manifests;
}

function testCasesFor(slug: string, sampleCount: number, testDataRoot: string) {
  const testDir = path.join(CONTENT, slug, "tests");
  const inputs = readdirSync(testDir)
    .filter((name) => name.endsWith(".in"))
    .sort();
  return inputs.map((name, index) => {
    const inputPath = path.posix.join(slug, "tests", name);
    const expectedOutputPath = inputPath.replace(/\.in$/, ".out");
    for (const stored of [inputPath, expectedOutputPath]) {
      const resolved = resolveTestDataPath(testDataRoot, stored);
      if (!existsSync(resolved)) {
        throw new Error(
          `Test data for ${slug} does not resolve: ${stored} against TEST_DATA_ROOT=${testDataRoot}. ` +
            `Set TEST_DATA_ROOT to ${CONTENT} (or ./content/problems) and re-run.`,
        );
      }
    }
    return {
      ordinal: index + 1,
      inputPath,
      expectedOutputPath,
      isSample: index < sampleCount,
      points: 10,
      group: null,
    };
  });
}

async function main(): Promise<void> {
  const env = parseServerEnv();
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const manifests = practiceManifests();
    if (manifests.length === 0) {
      throw new Error(`No practice-* problems with a problem.json under ${CONTENT}`);
    }
    console.log(`Seeding the arena with ${String(manifests.length)} practice questions…`);

    const problemIds: { slug: string; id: string; difficulty: string | null }[] = [];
    for (const manifest of manifests) {
      const statement = readFileSync(
        path.join(CONTENT, manifest.slug, "statement.md"),
        "utf8",
      );
      const cases = testCasesFor(manifest.slug, manifest.sampleCount, env.TEST_DATA_ROOT);
      if (statement.trim() === "" || cases.length === 0) {
        throw new Error(`${manifest.slug} has no statement or no test cases`);
      }

      const existing = await prisma.problem.findUnique({
        where: { slug: manifest.slug },
        select: { id: true },
      });
      if (existing !== null) {
        await prisma.testCase.deleteMany({ where: { problemId: existing.id } });
      }

      const shared = {
        title: manifest.title,
        statementMd: statement,
        difficulty: manifest.difficulty,
        state: "PUBLISHED" as const,
        practiceOnly: true,
        timeLimitMs: manifest.timeLimitMs,
        memoryLimitMb: manifest.memoryLimitMb,
        allowedLanguages: [...manifest.allowedLanguages],
        originAttribution: manifest.originAttribution ?? null,
        signature: manifest.signature ?? Prisma.DbNull,
        testCases: { create: cases },
      };
      const problem = await prisma.problem.upsert({
        where: { slug: manifest.slug },
        create: { slug: manifest.slug, type: "ALGORITHM", round: "INDIVIDUAL", ...shared },
        update: shared,
        select: { id: true, difficulty: true },
      });
      problemIds.push({ slug: manifest.slug, id: problem.id, difficulty: problem.difficulty });
      console.log(`  ${manifest.slug}: ${String(cases.length)} test cases`);
    }

    const arena = await prisma.contest.upsert({
      where: { joinCode: ARENA_JOIN_CODE },
      create: {
        name: ARENA_NAME,
        joinCode: ARENA_JOIN_CODE,
        scoringPresetId: "coding-night-classic",
        state: "RUNNING",
        isPractice: true,
        startsAt: ARENA_STARTS_AT,
        endsAt: ARENA_ENDS_AT,
        // Everyone sees every problem: no sets, no divisions, nothing to be assigned.
        allowReadingUnassignedSets: true,
      },
      update: {
        name: ARENA_NAME,
        state: "RUNNING",
        isPractice: true,
        startsAt: ARENA_STARTS_AT,
        endsAt: ARENA_ENDS_AT,
        allowReadingUnassignedSets: true,
      },
      select: { id: true },
    });

    /*
      One set holds everything, and every slot is INDIVIDUAL inside it. GROUP slots would
      satisfy the round/set constraint too, but they would also put the team-activity panel on
      every practice problem and speak of teams to a visitor who has none. INDIVIDUAL requires
      a set (DB constraint), and `allowReadingUnassignedSets` is what makes a set nobody is
      assigned to readable and submittable by everyone.
    */
    await prisma.contestProblem.deleteMany({ where: { contestId: arena.id } });
    await prisma.problemSet.deleteMany({ where: { contestId: arena.id } });
    const practiceSet = await prisma.problemSet.create({
      data: { contestId: arena.id, label: "P" },
      select: { id: true },
    });

    const order = { E: 0, M: 1, H: 2 } as const;
    const sorted = [...problemIds].sort(
      (a, b) =>
        (order[(a.difficulty ?? "H") as keyof typeof order] ?? 3) -
        (order[(b.difficulty ?? "H") as keyof typeof order] ?? 3),
    );
    for (const [index, problem] of sorted.entries()) {
      await prisma.contestProblem.create({
        data: {
          contestId: arena.id,
          problemId: problem.id,
          slotLabel: `P${String(index + 1)}`,
          basePoints:
            problem.difficulty === "E" ? 100 : problem.difficulty === "M" ? 200 : 300,
          round: "INDIVIDUAL",
          setId: practiceSet.id,
        },
      });
    }
    console.log(`Arena ready: ${arena.id} (${String(sorted.length)} problems)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
