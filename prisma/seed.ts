/**
 * Loads data/problems_seed.csv into the problem bank.
 *
 * TITLES AND HISTORY ONLY. Every problem lands in DRAFT with an empty statement and an
 * originAttribution note. Statements and test data are written fresh by organizers; nothing
 * is ever copied from HackerRank (docs/PRD.md §8).
 *
 * Idempotent by design: 136 rows upsert to 125 problems, and running it twice produces 125
 * problems, not 250. G10's cold start replays this on a fresh clone.
 *
 * The merge itself lives in lib/seed/merge.ts so it can be tested without a database.
 */

// Standalone tsx entrypoint: Next.js loads .env for the web app, but this process does not
// get that for free. Must come before anything that reads process.env.
import "dotenv/config";

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { parseSeedRows } from "@/lib/schemas/seed";
import { parseServerEnv } from "@/lib/schemas/env";
import { mergeRows } from "@/lib/seed/merge";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSV_PATH = path.join(ROOT, "data", "problems_seed.csv");

const ORIGIN_ATTRIBUTION =
  "Title imported from Park Tudor Coding Night history (Problems_List.xlsx). Inspired by a " +
  "HackerRank problem of the same name; the statement and test data must be written fresh " +
  "before this problem leaves DRAFT.";

/** Minimal reader. The seed file has no embedded newlines or quoted commas. */
function readCsv(filePath: string): Record<string, string>[] {
  const text = readFileSync(filePath, "utf8").replace(/\r\n/g, "\n").trim();
  const [headerLine, ...lines] = text.split("\n");
  if (headerLine === undefined) throw new Error(`${filePath} is empty`);

  const headers = headerLine.split(",").map((h) => h.trim());
  return lines.map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    return row;
  });
}

async function main(): Promise<void> {
  const env = parseServerEnv();
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const rows = parseSeedRows(readCsv(CSV_PATH));
    const merged = mergeRows(rows);

    console.log(`read ${rows.length} rows -> ${merged.length} distinct problems`);

    let created = 0;
    let updated = 0;

    for (const problem of merged) {
      const data = {
        title: problem.title,
        type: problem.type,
        pastStatus: problem.pastStatus,
        language: problem.language,
        difficulty: problem.difficulty,
        isGroupProblem: problem.isGroupProblem,
        originAttribution: ORIGIN_ATTRIBUTION,
      };

      const existing = await prisma.problem.findUnique({ where: { slug: problem.slug } });
      await prisma.problem.upsert({
        where: { slug: problem.slug },
        create: { slug: problem.slug, ...data },
        // Deliberately does NOT touch statementMd, inputSpec, outputSpec, constraints,
        // referenceSolution, or state. Re-seeding must never clobber authored content.
        update: data,
      });

      if (existing === null) created += 1;
      else updated += 1;
    }

    const total = await prisma.problem.count();
    const drafts = await prisma.problem.count({ where: { state: "DRAFT" } });

    console.log(`created ${created}, updated ${updated}, total problems now ${total}`);
    console.log(`${drafts} in DRAFT — each needs an original statement and own test data`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
