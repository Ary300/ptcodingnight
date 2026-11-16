import type { ProblemSummary } from "@/lib/schemas/api";

/**
 * A practice guest's own progress, read off the problem list the lobby already holds.
 *
 * The arena has nobody worth ranking against, so the lobby shows this instead of a standings
 * table. Every number comes from `ProblemSummary`, which carries this participant's `solved` flag
 * and `bestScore` per row, so the card costs no request beyond the list itself and can never
 * disagree with the rows beside it.
 *
 * Pure and client-safe. Points are summed from `bestScore`, never recomputed: scoring lives in
 * `lib/scoring/`, and this only adds up what the server already scored.
 */

export type DifficultyKey = "E" | "M" | "H";

export interface DifficultyProgress {
  readonly difficulty: DifficultyKey;
  readonly solved: number;
  readonly total: number;
}

export interface NextProblem {
  readonly slug: string;
  readonly slotLabel: string;
  readonly title: string;
}

export interface PracticeProgress {
  readonly solved: number;
  readonly total: number;
  readonly points: number;
  readonly possiblePoints: number;
  /** Easy, Medium and Hard in that order, each present even when the arena has none of it. */
  readonly byDifficulty: readonly DifficultyProgress[];
  /** The first unsolved, openable problem in list order; null once there is none. */
  readonly next: NextProblem | null;
}

const ORDER: readonly DifficultyKey[] = ["E", "M", "H"];

export function practiceProgress(problems: readonly ProblemSummary[]): PracticeProgress {
  const byDifficulty = ORDER.map((difficulty) => {
    const rows = problems.filter((problem) => problem.difficulty === difficulty);
    return {
      difficulty,
      solved: rows.filter((problem) => problem.solved).length,
      total: rows.length,
    };
  });

  // A locked or redacted row cannot be opened, so it is never the suggestion.
  const nextRow = problems.find(
    (problem) => !problem.solved && problem.unlocked && problem.slug !== "",
  );

  return {
    solved: problems.filter((problem) => problem.solved).length,
    total: problems.length,
    points: problems.reduce((sum, problem) => sum + (problem.bestScore ?? 0), 0),
    possiblePoints: problems.reduce((sum, problem) => sum + problem.basePoints, 0),
    byDifficulty,
    next:
      nextRow === undefined
        ? null
        : { slug: nextRow.slug, slotLabel: nextRow.slotLabel, title: nextRow.title },
  };
}
