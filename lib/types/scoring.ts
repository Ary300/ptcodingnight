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

export type ProblemRound = "INDIVIDUAL" | "GROUP";

export interface ScoringProblem {
  readonly contestProblemId: string;
  readonly divisionId: string | null;
  /** Which Round 1 set this problem belongs to; null for a GROUP problem. */
  readonly setId: string | null;
  readonly basePoints: number;
  /**
   * Which round. Replaces the old `isGroupProblem` boolean, which could not distinguish
   * "individual, on set A" from "individual, on no set".
   *
   * Hints only apply to GROUP problems (PRD §6.3).
   */
  readonly round: ProblemRound;
}

/**
 * Scaling factor for all internal score arithmetic: **hundredths of a point**.
 *
 * The team score is a mean, so fractional results are normal — 543.75 is a real answer from a
 * real scoring sheet. Floats are not acceptable here: this project already shipped a bug where
 * `3 * 0.15 * 250` evaluated to `112.49999999999999`, truncated to 112 instead of 113, and cost a
 * student a point. Integer hundredths keep every result exact and every replay identical.
 *
 * See docs/SCORING.md §3.
 */
export const POINT_SCALE = 100;

/**
 * Divide, rounding half away from zero.
 *
 * The single rounding site in the whole engine, applied once at the mean. "Half away from zero"
 * because it is what a person doing this by hand does, and rounding in exactly one place is what
 * keeps replay byte-identical.
 */
export function divideRoundHalfAway(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  const sign = Math.sign(numerator) * Math.sign(denominator);
  const q = Math.abs(numerator) / Math.abs(denominator);
  return sign * Math.round(q);
}

export interface TeamRecord {
  readonly teamId: string;
  readonly name: string;
}

/**
 * Points an organizer entered for a non-coding activity. The only score input with no submission
 * behind it (PRD §9.2).
 */
export interface SideActivityRecord {
  readonly teamId: string;
  readonly label: string;
  /** Whole points. May be negative — an organizer correcting an over-award. */
  readonly points: number;
  /** The award only exists on an as-of board at or after this instant. */
  readonly enteredAt: Date;
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

  // --- team scoring config (docs/SCORING.md §4) ---------------------------
  /**
   * Group problem points join the per-player pool BEFORE the mean. Organizer-confirmed default.
   *
   * `false` adds them to the team total AFTER the mean, which makes a group problem worth
   * `teamSize` times as much — 125 points to a team of four rather than 31.25.
   */
  readonly groupPointsInsideMean: boolean;
  /**
   * Side activity points are added flat to the team total. Organizer-confirmed default.
   *
   * `false` sends them through the same divisor as everything else.
   */
  readonly sideActivitiesFlat: boolean;
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
  /** Null is a rejudge tombstone: from this revision until the next judge answer, there is no score. */
  readonly verdict: Verdict | null;
  /** Points the judge awarded this submission in isolation. */
  readonly score: number;
  /**
   * When this submission's CURRENT verdict and score became true.
   *
   * Distinct from `submittedAt`, and the distinction is what makes a freeze hold.
   *
   * The public board during a freeze shows the standings AS THEY WERE at the freeze instant.
   * Filtering on `submittedAt` alone answered a different question — "which submissions existed
   * yet" — so a submission made before the freeze whose verdict was overridden or rejudged
   * afterwards passed straight through carrying its NEW score. Measured: a contest frozen with a
   * student on 0, an override to 140, and eighteen seconds later the anonymous public board
   * reported `frozen: true`, the same `asOf`, and 140. A rejudge did the same in reverse and
   * dropped a named student to zero on the wall.
   *
   * Null when the judge has not answered yet, which is also correct: at the freeze instant that
   * submission had no verdict, so it contributed nothing.
   */
  readonly effectiveAt: Date | null;
  /** Monotonic per persisted revision. Omitted fixture rows are treated as revision zero. */
  readonly revisionOrder?: number;
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
  /** Null means this participant contributes to no team score. The admin UI flags them. */
  readonly teamId: string | null;
  /** The Round 1 set this player was assigned. */
  readonly chosenSetId: string | null;
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

/**
 * One player's contribution, in whole points.
 *
 * This is a *breakdown* row, not a ranked row: players are not ranked against each other any more,
 * teams are. It exists so the UI can show how a team's mean was arrived at — a student who can see
 * the arithmetic does not have to trust it (PRD §9.1).
 */
export interface PlayerStanding {
  readonly participantId: string;
  readonly displayName: string;
  readonly divisionId: string | null;
  readonly teamId: string | null;
  readonly chosenSetId: string | null;
  /** This player's own points: individual problems, plus their share of nothing else. */
  readonly score: number;
  readonly penaltyMinutes: number;
  readonly lastScoreIncreaseAt: Date | null;
  readonly problems: readonly ProblemStanding[];
}

/**
 * A ranked team.
 *
 * `scoreHundredths` is the authoritative value and the one ranking compares; `score` is the same
 * number as points for display. Ranking on the scaled integer rather than the decimal is what
 * makes the order exactly reproducible.
 */
export interface TeamStanding {
  readonly teamId: string;
  readonly name: string;
  /** The divisor that produced this score. Stored so a past result stays explainable. */
  readonly teamSize: number;
  /** **Hundredths of a point.** The authoritative value. */
  readonly scoreHundredths: number;
  /** `scoreHundredths / 100`, for display only. Never compared or summed. */
  readonly score: number;
  /** Sum of member points before the division, group problems included when configured so. */
  readonly playerPoolPoints: number;
  /** Group-problem points, called out so the UI can show them separately. */
  readonly groupPoints: number;
  /** Side activity total, in whole points. */
  readonly sideActivityPoints: number;
  readonly penaltyMinutes: number;
  /** Last submission by ANY member that increased the team total. Third sort key. */
  readonly lastScoreIncreaseAt: Date | null;
  readonly rank: number;
  /**
   * True when this team shares an identical (score, penalty, lastScoreIncreaseAt) with another.
   * Genuine ties are displayed as ties, never broken arbitrarily (PRD §6.3).
   */
  readonly isTied: boolean;
  /** Per-player breakdown, so a team row can be expanded without recomputing.  */
  readonly players: readonly PlayerStanding[];
}

/**
 * Legacy per-participant standing.
 *
 * Retained because the ICPC preset ranks individuals and because "my score" is still a thing a
 * student asks. Coding Night Classic ranks teams — see `TeamStanding`.
 */
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
   * with another. Genuine ties are displayed as ties, never broken arbitrarily (PRD §6.3).
   */
  readonly isTied: boolean;
  readonly problems: readonly ProblemStanding[];
}

export interface ScoringOptions {
  /**
   * Consider only submissions at or before this instant.
   *
   * This is how freeze works, and the reason it is a parameter rather than a clock read:
   * the public board during a freeze passes `config.freezeAt`, the admin view passes null,
   * and the dramatic unfreeze at the end is the same function called again with null. No
   * hidden state, and both views are replayable.
   */
  readonly upTo?: Date | null;
}

/**
 * Per-participant standings. Still used by the ICPC preset and by "my score".
 */
export type ComputeStandings = (
  config: ContestConfig,
  participants: readonly ParticipantRecord[],
  submissions: readonly SubmissionRecord[],
  hintGrants: readonly HintGrantRecord[],
  options?: ScoringOptions,
) => readonly Standing[];

/**
 * **The scoring entry point for Coding Night.** No scoring logic exists anywhere else in the
 * codebase — not in a route handler, not in a component, not in SQL.
 *
 * Everything it needs arrives as an argument, including the clock, which is what makes standings
 * replayable (PRD §6.6).
 */
export type ComputeTeamStandings = (
  config: ContestConfig,
  teams: readonly TeamRecord[],
  participants: readonly ParticipantRecord[],
  submissions: readonly SubmissionRecord[],
  hintGrants: readonly HintGrantRecord[],
  sideActivities: readonly SideActivityRecord[],
  options?: ScoringOptions,
) => readonly TeamStanding[];

/** Tunables for "Coding Night Classic" (PRD §6.1). */
export const CLASSIC_PRESET = {
  penaltyMinutesPerRejection: 5,
  /**
   * Each hint on a group problem costs 15% of that problem's base points.
   *
   * Held as an integer percentage, not 0.15, and that is deliberate. `3 * 0.15 * 250`
   * evaluates to 112.49999999999999 in IEEE-754, which rounds to 112 instead of the correct
   * 113 — a student losing a point to binary representation. Integer arithmetic first,
   * divide last.
   */
  hintCostPercent: 15,
  /** 2 CodingBat warmups buy 1 hint. */
  warmupsPerHint: 2,
} as const;

/** Tunables for the ICPC preset (PRD §6.2): binary AC, 20-minute penalty. */
export const ICPC_PRESET = {
  penaltyMinutesPerRejection: 20,
} as const;
