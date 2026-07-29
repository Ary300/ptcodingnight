import { dedupKey, slugFor, warmupLanguage, type SeedRow } from "@/lib/schemas/seed";

/**
 * Pure merge of seed rows into problem records. No I/O and no database — kept separate from
 * prisma/seed.ts so tests can exercise it against the real CSV without a Postgres instance
 * and without triggering the seeder's entrypoint.
 *
 * 136 rows collapse to 125 problems. See docs/DECISIONS.md D2–D4, D6 and docs/PRD.md §16.1.
 */

export const TYPE_MAP = {
  algorithm: "ALGORITHM",
  codingbat: "CODINGBAT",
  group: "GROUP",
} as const;

export const STATUS_MAP = {
  "hint-currency": "HINT_CURRENCY",
  "used-in-contest": "USED_IN_CONTEST",
  "solved-in-past": "SOLVED_IN_PAST",
  "candidate-unused": "CANDIDATE_UNUSED",
  "used-but-zero-points": "USED_BUT_ZERO_POINTS",
  "group-problem": "GROUP_PROBLEM",
  "partially-solved-in-past": "PARTIALLY_SOLVED_IN_PAST",
} as const;

export type ProblemTypeValue = (typeof TYPE_MAP)[keyof typeof TYPE_MAP];
export type PastStatusValue = (typeof STATUS_MAP)[keyof typeof STATUS_MAP];

/**
 * Which `past_status` survives when rows sharing a title disagree.
 *
 * `used-but-zero-points` wins over everything because PRD §8 wants "nobody ever scored on
 * this" surfaced loudly in the problem picker. Fraudulent Activity Notifications is exactly
 * the case: three rows, one of them the zero-points record, two of them group-round rows.
 * A merge that simply took the last value it saw would drop the one warning that matters.
 */
const STATUS_PRIORITY: readonly (keyof typeof STATUS_MAP)[] = [
  "used-but-zero-points",
  "partially-solved-in-past",
  "solved-in-past",
  "used-in-contest",
  "group-problem",
  "candidate-unused",
  "hint-currency",
];

export interface MergedProblem {
  slug: string;
  title: string;
  type: ProblemTypeValue;
  pastStatus: PastStatusValue;
  language: "PYTHON" | "JAVA" | null;
  difficulty: "E" | "M" | "H" | null;
  isGroupProblem: boolean;
  /** Every CSV row that folded into this problem, kept for traceability. */
  rows: SeedRow[];
}

export function mergeRows(rows: readonly SeedRow[]): MergedProblem[] {
  const byKey = new Map<string, MergedProblem>();

  for (const row of rows) {
    const key = dedupKey(row);
    const existing = byKey.get(key);

    if (existing === undefined) {
      byKey.set(key, {
        slug: slugFor(row),
        title: row.title.trim(),
        type: TYPE_MAP[row.type],
        pastStatus: STATUS_MAP[row.past_status],
        language: warmupLanguage(row),
        difficulty: row.difficulty,
        isGroupProblem: row.type === "group",
        rows: [row],
      });
      continue;
    }

    existing.rows.push(row);
    // Sticky: if any row says group, the problem is a group problem.
    existing.isGroupProblem ||= row.type === "group";
    existing.difficulty ??= row.difficulty;

    const incomingRank = STATUS_PRIORITY.indexOf(row.past_status);
    const currentRank = STATUS_PRIORITY.findIndex((s) => STATUS_MAP[s] === existing.pastStatus);
    if (incomingRank !== -1 && (currentRank === -1 || incomingRank < currentRank)) {
      existing.pastStatus = STATUS_MAP[row.past_status];
    }
  }

  return [...byKey.values()];
}
