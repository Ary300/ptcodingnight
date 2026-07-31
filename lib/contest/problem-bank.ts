import { prisma } from "@/lib/db";

import type { AdminProblemBank, AdminProblemRow } from "@/lib/schemas/api";

/**
 * The problem bank, as an organizer sees it.
 *
 * ## Why this exists
 *
 * `/admin/problems` rendered twelve hardcoded fixtures from `components/admin/stub-data.ts` while
 * the database held 130 real problems, and its header claimed "125 problems imported from the
 * past-contest index". An organizer looking for a problem could not find one, and the counts on
 * the page described a fixture file rather than the contest they were about to run.
 *
 * ## `readyBlockers` is computed here, once
 *
 * Whether a problem may go into a live contest is a fact about the problem, and it is asserted in
 * three places already: the seed refuses a DRAFT, the API refuses a DRAFT, and the UI greys the
 * button. Computing it in the component would be a fourth answer to the same question, free to
 * disagree with the other three — and the disagreement would show up as an organizer being told
 * they may add a problem that the API then refuses.
 *
 * The list is the check the old fixture pretended to make: an original statement, test data, and
 * sample cases. What it deliberately does NOT claim is that the reference solution passes. Only
 * G13 (`npm run test:content`) knows that, because only G13 runs the thing through the real judge
 * in a real container — and a screen that says "reference passes" without having run anything is
 * exactly the false confidence this file replaces.
 */

/** Prisma's enum is DRAFT | PUBLISHED | RETIRED; the admin UI's vocabulary is DRAFT | READY | ARCHIVED. */
function toUiState(state: string): AdminProblemRow["state"] {
  if (state === "PUBLISHED") return "READY";
  if (state === "RETIRED") return "ARCHIVED";
  return "DRAFT";
}

/** SCREAMING_SNAKE in the database, kebab-case on the wire, because the seed CSV is kebab-case. */
function toUiPastStatus(status: string | null): string | null {
  return status === null ? null : status.toLowerCase().replace(/_/g, "-");
}

export async function problemBank(): Promise<AdminProblemBank> {
  const rows = await prisma.problem.findMany({
    orderBy: [{ title: "asc" }, { slug: "asc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      state: true,
      difficulty: true,
      pastStatus: true,
      statementMd: true,
      round: true,
      _count: { select: { testCases: true } },
      testCases: { where: { isSample: true }, select: { id: true } },
    },
  });

  return {
    problems: rows.map((row) => {
      const hasStatement = row.statementMd.trim().length > 0;
      const testCaseCount = row._count.testCases;
      const sampleCaseCount = row.testCases.length;

      const blockers: string[] = [];
      if (toUiState(row.state) === "DRAFT") blockers.push("Still a DRAFT");
      if (toUiState(row.state) === "ARCHIVED") blockers.push("Archived");
      if (!hasStatement) blockers.push("No original statement written");
      if (testCaseCount === 0) blockers.push("No test cases");
      if (sampleCaseCount === 0) blockers.push("No sample cases, so a student cannot self-check");

      return {
        problemId: row.id,
        slug: row.slug,
        title: row.title,
        state: toUiState(row.state),
        difficulty: row.difficulty,
        pastStatus: toUiPastStatus(row.pastStatus),
        round: row.round,
        hasOriginalStatement: hasStatement,
        testCaseCount,
        sampleCaseCount,
        readyBlockers: blockers,
      };
    }),
  };
}
