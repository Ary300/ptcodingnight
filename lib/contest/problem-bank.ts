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

/** The facts about one problem that decide whether it may go into a live contest. */
export interface ReadyFacts {
  readonly state: AdminProblemRow["state"];
  readonly hasStatement: boolean;
  readonly testCaseCount: number;
  readonly sampleCaseCount: number;
  /** Set in the problem's manifest for a question whose whole point is a data type. */
  readonly keepOutOfSets: boolean;
  /** A practice-area problem. Students can read it, and its answer, all year. */
  readonly practiceOnly: boolean;
}

/**
 * The reason a problem stays out of sets when its manifest says so. The sentence names where the
 * decision was made, because the organizer reading it on the Problems tab has no other way to
 * find out that the flag exists or how to lift it.
 */
/**
 * Practice problems are public all year, so a student who practised could arrive holding the
 * answer. The line-up API already refused them; the set planner read this list instead and dealt
 * three of them into a live contest on 2026-11-16.
 */
export const PRACTICE_ONLY_BLOCKER =
  "Practice problem: students can open it and its answer in the practice area, so it never goes into a contest.";

export const KEPT_OUT_OF_SETS_BLOCKER =
  "Kept out of sets: this problem is about a data type (see its manifest). Place it by hand if you want it.";

/**
 * Every reason a problem may not be dealt into a live contest, in a fixed order, as sentences an
 * organizer reads. Pure, so the list can be asserted without a database.
 *
 * `keepOutOfSets` is a blocker rather than a separate flag because `set-build.ts`'s `gatherPool`
 * already drops any problem with a non-empty list. One field answering "may this be dealt" is the
 * reason this module exists; a second one would be a second answer free to disagree.
 */
export function readyBlockersFor(facts: ReadyFacts): string[] {
  const blockers: string[] = [];
  if (facts.state === "DRAFT") blockers.push("Still a DRAFT");
  if (facts.state === "ARCHIVED") blockers.push("Archived");
  if (!facts.hasStatement) blockers.push("No original statement written");
  if (facts.testCaseCount === 0) blockers.push("No test cases");
  if (facts.sampleCaseCount === 0)
    blockers.push("No sample cases, so a student cannot self-check");
  if (facts.keepOutOfSets) blockers.push(KEPT_OUT_OF_SETS_BLOCKER);
  if (facts.practiceOnly) blockers.push(PRACTICE_ONLY_BLOCKER);
  return blockers;
}

export async function problemBank(): Promise<AdminProblemBank> {
  /*
    `statementMd` IS NOT SELECTED, and that one word was the whole cost of this screen.

    It used to be, purely so the next line could ask `.trim().length > 0`. A statement is the
    entire text of a problem; 130 of them is the largest thing in this database, and the answer
    wanted from it is one bit. Measured: this route took 27.99s cold and 64.81s warm, and the
    organizer's Problems tab sat blank for 145 SECONDS behind it — which is the real reason
    "how to add problems" felt confusing. It was not confusing. It was empty.

    Postgres answers the bit without sending the text. `hasStatement` is a boolean off a
    `NOT NULL AND <> ''` test, evaluated in the database, so the row that comes back is small.
  */
  const rows = await prisma.$queryRaw<
    {
      id: string;
      slug: string;
      title: string;
      state: string;
      difficulty: string | null;
      pastStatus: string | null;
      round: string;
      keepOutOfSets: boolean;
      practiceOnly: boolean;
      hasStatement: boolean;
      testCaseCount: bigint;
      sampleCaseCount: bigint;
    }[]
  >`
    SELECT p."id", p."slug", p."title", p."state"::text AS "state",
           p."difficulty"::text AS "difficulty", p."pastStatus"::text AS "pastStatus",
           p."round"::text AS "round", p."keepOutOfSets", p."practiceOnly",
           (btrim(p."statementMd") <> '') AS "hasStatement",
           COUNT(t."id")                                  AS "testCaseCount",
           COUNT(t."id") FILTER (WHERE t."isSample")       AS "sampleCaseCount"
      FROM "Problem" p
      LEFT JOIN "TestCase" t ON t."problemId" = p."id"
     GROUP BY p."id"
     ORDER BY p."title" ASC, p."slug" ASC
  `;

  return {
    problems: rows.map((row) => {
      const hasStatement = row.hasStatement;
      // COUNT() comes back as bigint over the wire; every consumer wants a number.
      const testCaseCount = Number(row.testCaseCount);
      const sampleCaseCount = Number(row.sampleCaseCount);

      const state = toUiState(row.state);
      const blockers = readyBlockersFor({
        state,
        hasStatement,
        testCaseCount,
        sampleCaseCount,
        keepOutOfSets: row.keepOutOfSets,
        practiceOnly: row.practiceOnly,
      });

      return {
        problemId: row.id,
        slug: row.slug,
        title: row.title,
        state,
        difficulty: row.difficulty as AdminProblemRow["difficulty"],
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
