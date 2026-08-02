import { readFileSync } from "node:fs";
import path from "node:path";

import type {
  ContestConfig,
  HintGrantRecord,
  ParticipantRecord,
  ProblemRound,
  SideActivityRecord,
  Standing,
  SubmissionRecord,
  TeamRecord,
  TeamStanding,
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
  setId?: string | null;
  basePoints: number;
  round?: string;
  isGroupProblem?: boolean;
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
    groupPointsInsideMean?: boolean;
    sideActivitiesFlat?: boolean;
  };
  teams?: TeamRecord[];
  participants: {
    participantId: string;
    displayName: string;
    divisionId: string | null;
    teamId?: string | null;
    chosenSetId?: string | null;
  }[];
  sideActivities?: {
    teamId: string;
    label: string;
    points: number;
    enteredAt?: string;
  }[];
  submissions: {
    submissionId: string;
    participantId: string;
    contestProblemId: string;
    submittedAt: string;
    /** Optional. Absent means "the judge's answer is the current answer" — see the loader. */
    effectiveAt?: string;
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

export interface GoldenTeamInput extends GoldenInput {
  teams: TeamRecord[];
  sideActivities: SideActivityRecord[];
}

/**
 * `round` is authoritative; `isGroupProblem` is read only so a pre-team fixture still loads.
 *
 * The old boolean could not distinguish "individual, on set A" from "individual, on no set",
 * which is why it was replaced rather than kept alongside.
 */
function roundOf(p: RawProblem): ProblemRound {
  if (p.round === "GROUP" || p.round === "INDIVIDUAL") return p.round;
  return p.isGroupProblem === true ? "GROUP" : "INDIVIDUAL";
}

export function loadGoldenContest(): GoldenInput {
  const raw = JSON.parse(
    readFileSync(path.join(FIXTURES, "scoring", "golden-contest.json"), "utf8"),
  ) as RawGolden;

  return loadFrom(raw);
}

function loadFrom(raw: RawGolden): GoldenInput {
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
        setId: p.setId ?? null,
        basePoints: p.basePoints,
        round: roundOf(p),
      })),
      groupPointsInsideMean: raw.config.groupPointsInsideMean ?? true,
      sideActivitiesFlat: raw.config.sideActivitiesFlat ?? true,
    },
    participants: raw.participants.map((participant) => ({
      ...participant,
      teamId: participant.teamId ?? null,
      chosenSetId: participant.chosenSetId ?? null,
    })),
    submissions: raw.submissions.map((s) => ({
      submissionId: s.submissionId,
      participantId: s.participantId,
      contestProblemId: s.contestProblemId,
      submittedAt: new Date(s.submittedAt),
      /*
        Defaults to `submittedAt` for a fixture that does not state it.

        The golden contest has no overrides and no rejudges, so for every one of its submissions
        the judge's answer IS the current answer, and any instant at or before the cutoff gives the
        same result. Using `submittedAt` keeps G6 byte-identical to what it produced before this
        field existed — which is the property that makes the golden fixture worth having.

        A fixture that wants to exercise a frozen board against a late override states it.
      */
      effectiveAt: s.effectiveAt === undefined ? new Date(s.submittedAt) : new Date(s.effectiveAt),
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

/**
 * The team golden contest.
 *
 * Pins the organizer's real worked example — players at 400, 250, 400, 400, one 125-point group
 * problem, side activities 20 + 80 + 50 — plus a team of two, so the divisor is actually exercised.
 */
export function loadGoldenTeamContest(): GoldenTeamInput {
  const raw = JSON.parse(
    readFileSync(path.join(FIXTURES, "scoring", "golden-team-contest.json"), "utf8"),
  ) as RawGolden;

  const base = loadFrom(raw);
  return {
    ...base,
    teams: raw.teams ?? [],
    sideActivities: (raw.sideActivities ?? []).map((activity) => ({
      teamId: activity.teamId,
      label: activity.label,
      points: activity.points,
      // Older golden fixtures predate temporal side-activity replay. They describe awards that
      // existed for the whole contest, so the contest start is their honest default.
      enteredAt: new Date(activity.enteredAt ?? raw.config.startsAt),
    })),
  };
}

/** Canonical form of team standings, for byte-for-byte replay comparison. */
export function canonicalizeTeams(standings: readonly TeamStanding[]): unknown[] {
  return standings.map((t) => ({
    teamId: t.teamId,
    name: t.name,
    teamSize: t.teamSize,
    scoreHundredths: t.scoreHundredths,
    score: t.score,
    playerPoolPoints: t.playerPoolPoints,
    groupPoints: t.groupPoints,
    sideActivityPoints: t.sideActivityPoints,
    penaltyMinutes: t.penaltyMinutes,
    lastScoreIncreaseAt: t.lastScoreIncreaseAt?.toISOString() ?? null,
    rank: t.rank,
    isTied: t.isTied,
    players: t.players.map((p) => ({
      participantId: p.participantId,
      displayName: p.displayName,
      teamId: p.teamId,
      chosenSetId: p.chosenSetId,
      score: p.score,
      penaltyMinutes: p.penaltyMinutes,
      lastScoreIncreaseAt: p.lastScoreIncreaseAt?.toISOString() ?? null,
    })),
  }));
}
