import type { TeamPlayerRow, TeamStandingsResponse } from "@/lib/schemas/api";

/**
 * Per-problem progress for one teammate, as the lobby's team card shows it.
 *
 * Pure, so the wording is unit-tested without a browser. Group problems are left out: they score
 * for the team, not for the player, and the team page already explains them.
 *
 * "Attempted" means at least one rejected submission and no points yet. A problem the player has
 * only opened, or taken a hint on, has neither and is not listed.
 */

export type ProblemStatus = "solved" | "attempted";

export interface ProblemProgress {
  readonly contestProblemId: string;
  readonly slotLabel: string;
  readonly status: ProblemStatus;
}

export interface PlayerProgress {
  readonly problems: readonly ProblemProgress[];
  readonly summary: string;
}

export function playerProgress(player: TeamPlayerRow): PlayerProgress {
  if (player.problems === null) {
    // Not ours to read (never the case for a student's own team, but the type allows it).
    return { problems: [], summary: `${String(player.solvedCount)} solved` };
  }

  const problems = player.problems
    .filter((problem) => !problem.isGroupProblem)
    .flatMap((problem): ProblemProgress[] => {
      if (problem.score > 0) {
        return [{ contestProblemId: problem.contestProblemId, slotLabel: problem.slotLabel, status: "solved" }];
      }
      if (problem.rejectedCount > 0) {
        return [{ contestProblemId: problem.contestProblemId, slotLabel: problem.slotLabel, status: "attempted" }];
      }
      return [];
    })
    .toSorted((a, b) => a.slotLabel.localeCompare(b.slotLabel));

  const solved = problems.filter((problem) => problem.status === "solved").length;
  const attempted = problems.length - solved;
  const summary =
    problems.length === 0
      ? "No submissions yet"
      : attempted === 0
        ? `${String(solved)} solved`
        : `${String(solved)} solved, ${String(attempted)} attempted`;

  return { problems, summary };
}

/**
 * "A" from "Intermediate A". The rows speak the qualified label; the card shows the letter the
 * student was handed on their slip.
 */
export function setLetterFor(
  chosenSetLabel: string | null,
  sets: TeamStandingsResponse["sets"],
): string | null {
  if (chosenSetLabel === null) return null;
  return sets.find((set) => set.qualifiedLabel === chosenSetLabel)?.label ?? chosenSetLabel;
}
