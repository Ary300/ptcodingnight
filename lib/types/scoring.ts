/**
 * Scoring contract.
 *
 * `lib/scoring/` is pure: no I/O, no Date.now(), no randomness. Every fact it needs arrives
 * in these structures, including the clock. That is what makes standings replayable — the
 * hard requirement in docs/PRD.md §6.3 and the reason a disputed result can be explained
 * months later.
 *
 * These are plain TypeScript types rather than Zod schemas because this is an internal
 * boundary, not a trust boundary: the caller assembles them from rows it already read.
 */

import type { Verdict } from "@/lib/schemas/judge";

export type ScoringPresetId = "coding-night-classic" | "icpc";

export type Difficulty = "E" | "M" | "H";

/** Default base points by difficulty (PRD §6.1). Organizer-editable per ContestProblem. */
export const DEFAULT_BASE_POINTS: Readonly<Record<Difficulty, number>> = {
  E: 100,
  M: 200,
  H: 300,
} as const;

export interface ScoringProblem {
  readonly contestProblemId: string;
  readonly divisionId: string | null;
  readonly basePoints: number;
  /** Hints only apply to group problems (PRD §6.1). */
  readonly isGroupProblem: boolean;
}

export interface ScoringDivision {
  readonly divisionId: string;
  readonly name: string;
  readonly sortOrder: number;
}

export interface ContestConfig {
  readonly contestId: string;
  readonly presetId: ScoringPresetId;
  readonly startsAt: Date;
  readonly endsAt: Date;
  /**
   * After this instant the public board stops updating while judging continues. Passed in
   * as configuration, never read from a clock inside the engine.
   */
  readonly freezeAt: Date | null;
  readonly divisions: readonly ScoringDivision[];
  readonly problems: readonly ScoringProblem[];
}

/**
 * One row of the append-only submission log. This is the entire input to scoring alongside
 * hints — if a fact is not here, it cannot affect a score.
 */
export interface SubmissionRecord {
  readonly submissionId: string;
  readonly participantId: string;
  readonly contestProblemId: string;
  readonly submittedAt: Date;
  readonly verdict: Verdict;
  /** Points the judge awarded this submission in isolation. */
  readonly score: number;
}

export interface HintGrantRecord {
  readonly participantId: string;
  readonly contestProblemId: string;
  readonly hintIndex: number;
  readonly grantedAt: Date;
}

export interface ParticipantRecord {
  readonly participantId: string;
  readonly displayName: string;
  readonly divisionId: string | null;
}

/** Per-problem detail, retained so the UI can explain a score without recomputing it. */
export interface ProblemStanding {
  readonly contestProblemId: string;
  /** Best score across this participant's submissions — not the last, not the sum. */
  readonly score: number;
  /** Rejected submissions before the problem was first scored above zero. */
  readonly rejectedCount: number;
  /** Penalty minutes actually charged. Zero when the problem was never scored. */
  readonly penaltyMinutes: number;
  readonly hintsTaken: number;
  readonly hintDeduction: number;
  readonly firstScoredAt: Date | null;
}

export interface Standing {
  readonly participantId: string;
  readonly displayName: string;
  readonly divisionId: string | null;
  readonly score: number;
  readonly penaltyMinutes: number;
  /** Time of the last submission that increased this participant's total. Third sort key. */
  readonly lastScoreIncreaseAt: Date | null;
  readonly rank: number;
  /**
   * True when this participant shares an identical (score, penalty, lastScoreIncreaseAt)
   * with another. Genuine ties are displayed as ties, never broken arbitrarily (PRD §6.1).
   */
  readonly isTied: boolean;
  readonly problems: readonly ProblemStanding[];
}

/**
 * The one scoring entry point. No scoring logic exists anywhere else in the codebase —
 * not in a route handler, not in a component, not in SQL.
 */
export type ComputeStandings = (
  config: ContestConfig,
  participants: readonly ParticipantRecord[],
  submissions: readonly SubmissionRecord[],
  hintGrants: readonly HintGrantRecord[],
) => readonly Standing[];

/** Tunables for "Coding Night Classic" (PRD §6.1). */
export const CLASSIC_PRESET = {
  penaltyMinutesPerRejection: 5,
  /** Each hint on a group problem costs 15% of that problem's base points. */
  hintCostFraction: 0.15,
  /** 2 CodingBat warmups buy 1 hint. */
  warmupsPerHint: 2,
} as const;

/** Tunables for the ICPC preset (PRD §6.2): binary AC, 20-minute penalty. */
export const ICPC_PRESET = {
  penaltyMinutesPerRejection: 20,
} as const;
