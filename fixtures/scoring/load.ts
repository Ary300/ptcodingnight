import { readFileSync } from "node:fs";
import path from "node:path";

import type {
  ContestConfig,
  HintGrantRecord,
  ParticipantRecord,
  Standing,
  SubmissionRecord,
} from "@/lib/types/scoring";
import type { Verdict } from "@/lib/schemas/judge";

/**
 * Loads the golden fixtures and canonicalizes standings for byte-for-byte comparison.
 *
 * Kept out of the test file so both the golden test and any future replay tooling use the
 * exact same serialization — if the two drifted, G6 would compare two different shapes and
 * pass for the wrong reason.
 */

const FIXTURES = path.resolve(__dirname, "..");

interface RawProblem {
  contestProblemId: string;
  divisionId: string | null;
  basePoints: number;
  isGroupProblem: boolean;
}

interface RawGolden {
  config: {
    contestId: string;
    presetId: string;
    startsAt: string;
    endsAt: string;
    freezeAt: string | null;
    divisions: { divisionId: string; name: string; sortOrder: number }[];
    problems: RawProblem[];
  };
  participants: { participantId: string; displayName: string; divisionId: string | null }[];
  submissions: {
    submissionId: string;
    participantId: string;
    contestProblemId: string;
    submittedAt: string;
    verdict: string;
    score: number;
  }[];
  hintGrants: {
    participantId: string;
    contestProblemId: string;
    hintIndex: number;
    grantedAt: string;
  }[];
}

export interface GoldenInput {
  config: ContestConfig;
  participants: ParticipantRecord[];
  submissions: SubmissionRecord[];
  hintGrants: HintGrantRecord[];
}

export function loadGoldenContest(): GoldenInput {
  const raw = JSON.parse(
    readFileSync(path.join(FIXTURES, "scoring", "golden-contest.json"), "utf8"),
  ) as RawGolden;

  return {
    config: {
      contestId: raw.config.contestId,
      presetId: raw.config.presetId === "icpc" ? "icpc" : "coding-night-classic",
      startsAt: new Date(raw.config.startsAt),
      endsAt: new Date(raw.config.endsAt),
      freezeAt: raw.config.freezeAt === null ? null : new Date(raw.config.freezeAt),
      divisions: raw.config.divisions,
      // Deliberately drops the `_title` documentation field: the engine must not be able to
      // see a problem title, let alone rank by one.
      problems: raw.config.problems.map((p) => ({
        contestProblemId: p.contestProblemId,
        divisionId: p.divisionId,
        basePoints: p.basePoints,
        isGroupProblem: p.isGroupProblem,
      })),
    },
    participants: raw.participants,
    submissions: raw.submissions.map((s) => ({
      submissionId: s.submissionId,
      participantId: s.participantId,
      contestProblemId: s.contestProblemId,
      submittedAt: new Date(s.submittedAt),
      verdict: s.verdict as Verdict,
      score: s.score,
    })),
    hintGrants: raw.hintGrants.map((h) => ({
      participantId: h.participantId,
      contestProblemId: h.contestProblemId,
      hintIndex: h.hintIndex,
      grantedAt: new Date(h.grantedAt),
    })),
  };
}

/** The hand-computed expected standings, with the `_readme` commentary stripped. */
export function loadExpectedStandings(): unknown {
  const raw = JSON.parse(
    readFileSync(path.join(FIXTURES, "expected-standings.json"), "utf8"),
  ) as { standings: unknown[] };
  return raw.standings;
}

/**
 * Canonical form of a standings array.
 *
 * Keys are written in a fixed order and Dates become ISO strings, so two runs produce
 * identical text. Without the explicit key order, byte-for-byte equality would depend on
 * V8's property insertion order — an implementation detail, not a guarantee.
 */
export function canonicalize(standings: readonly Standing[]): unknown[] {
  return standings.map((s) => ({
    participantId: s.participantId,
    displayName: s.displayName,
    divisionId: s.divisionId,
    score: s.score,
    penaltyMinutes: s.penaltyMinutes,
    lastScoreIncreaseAt: s.lastScoreIncreaseAt?.toISOString() ?? null,
    rank: s.rank,
    isTied: s.isTied,
    problems: s.problems.map((p) => ({
      contestProblemId: p.contestProblemId,
      score: p.score,
      rejectedCount: p.rejectedCount,
      penaltyMinutes: p.penaltyMinutes,
      hintsTaken: p.hintsTaken,
      hintDeduction: p.hintDeduction,
      firstScoredAt: p.firstScoredAt?.toISOString() ?? null,
    })),
  }));
}

export function serialize(standings: readonly Standing[]): string {
  return JSON.stringify(canonicalize(standings), null, 2);
}
