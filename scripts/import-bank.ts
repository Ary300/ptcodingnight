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
 * Publish EVERY authored problem in `content/problems/` into the problem bank, and nothing else.
 *
 * ## Why this exists beside `seed-demo.ts`
 *
 * `seed-demo` publishes exactly six problems (its `PROBLEM_COUNT` slice) because its job is a
 * contest you can open, not the bank. The bank grew to ninety-plus authored problems, each
 * verified through the real judge by G13, and the organizer's "commit all the problems to the
 * site" needs a path that publishes ALL of them without building or touching any contest.
 *
 * ## What it deliberately does not do
 *
 *  - Touch any contest, line-up, team, or participant. Rows in, nothing else.
 *  - Import `practice-*` slugs: `scripts/seed-practice.ts` owns those, because they carry
 *    `practiceOnly: true` and belong to the arena it also builds. Importing them here without
 *    the flag would quietly open them to scored line-ups.
 *  - Invent content. A directory without a statement or tests is skipped OUT LOUD and left
 *    DRAFT-or-absent; publishing a blank page is the failure PRD §8 exists to prevent.
 *
 * Idempotent: upserts by slug and replaces each problem's test cases wholesale, so re-running
 * after a batch lands updates rather than duplicates.
 */

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, "content", "problems");

function bankManifests(): ProblemManifest[] {
  if (!existsSync(CONTENT)) throw new Error(`No authored content at ${CONTENT}`);
  return readdirSync(CONTENT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((slug) => !slug.startsWith("practice-"))
    .filter((slug) => existsSync(path.join(CONTENT, slug, "problem.json")))
    .sort()
    .map((slug) => {
      const file = path.join(CONTENT, slug, "problem.json");
      return parseProblemManifest(JSON.parse(readFileSync(file, "utf8")), file);
    });
}

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
    const inputPath = path.posix.join(slug, "tests", name);
    const expectedOutputPath = inputPath.replace(/\.in$/, ".out");
    // Prove the stored path RESOLVES before writing it: a path that does not is not an import
    // error at import time, it is verdict IE on a student's submission during the contest.
    for (const stored of [inputPath, expectedOutputPath]) {
      const resolved = resolveTestDataPath(testDataRoot, stored);
      if (!existsSync(resolved)) {
        throw new Error(
          `Test data for ${slug} does not resolve: ${stored} against ` +
            `TEST_DATA_ROOT=${testDataRoot}. Set TEST_DATA_ROOT to ${CONTENT} and re-run.`,
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
    const manifests = bankManifests();
    console.log(`Importing ${String(manifests.length)} authored problems into the bank…`);

    let published = 0;
    let skipped = 0;
    for (const manifest of manifests) {
      const statementPath = path.join(CONTENT, manifest.slug, "statement.md");
      const statement = existsSync(statementPath) ? readFileSync(statementPath, "utf8") : "";
      const cases = testCasesFor(manifest.slug, manifest.sampleCount, env.TEST_DATA_ROOT);
      if (statement.trim() === "" || cases.length === 0) {
        console.log(`  SKIPPED ${manifest.slug}: no statement or no test cases`);
        skipped += 1;
        continue;
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
        timeLimitMs: manifest.timeLimitMs,
        memoryLimitMb: manifest.memoryLimitMb,
        allowedLanguages: [...manifest.allowedLanguages],
        originAttribution: manifest.originAttribution ?? null,
        comparator:
          manifest.comparator.kind === "whitespace"
            ? Prisma.DbNull
            : (manifest.comparator as Prisma.InputJsonValue),
        signature: manifest.signature ?? Prisma.DbNull,
        testCases: { create: cases },
      };
      await prisma.problem.upsert({
        where: { slug: manifest.slug },
        create: {
          slug: manifest.slug,
          type: "ALGORITHM",
          round: "INDIVIDUAL",
          ...shared,
        },
        update: shared,
      });
      published += 1;
    }

    console.log(
      `Bank import done: ${String(published)} published, ${String(skipped)} skipped.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
