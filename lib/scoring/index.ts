import type {
  ContestConfig,
  HintGrantRecord,
  ParticipantRecord,
  ProblemStanding,
  ScoringOptions,
  ScoringProblem,
  Standing,
  SubmissionRecord,
} from "@/lib/types/scoring";
import { CLASSIC_PRESET, ICPC_PRESET } from "@/lib/types/scoring";
import { rankDivision, type RankKey } from "@/lib/scoring/rank";
import { isAccepted, isRejection, isScorable } from "@/lib/scoring/verdicts";

/**
 * The scoring engine. Pure: no I/O, no Date.now(), no randomness, no Prisma. Every fact —
 * including the clock and the freeze instant — arrives as an argument.
 *
 * That is what makes PRD §6.3's hard requirement achievable: recomputing standings from the
 * raw submission log produces byte-identical output every time, so a result disputed weeks
 * later can be re-derived and explained.
 *
 * Spec: docs/PRD.md §6. Rule interpretations: docs/DECISIONS.md D12–D16.
 */

/** Per-problem intermediate state, before hints are applied. */
interface ProblemAccumulator {
  bestScore: number;
  rejections: number;
  firstScoredAtMs: number | null;
}

function emptyAccumulator(): ProblemAccumulator {
  return { bestScore: 0, rejections: 0, firstScoredAtMs: null };
}

/**
 * Submissions in the window, oldest first.
 *
 * Sorted by (submittedAt, submissionId) rather than submittedAt alone: two submissions can
 * share a timestamp, and without the id tiebreak their relative order would depend on the
 * order the caller happened to read them from the database — which would break replay
 * stability.
 */
function submissionsInWindow(
  submissions: readonly SubmissionRecord[],
  upTo: Date | null | undefined,
): SubmissionRecord[] {
  const cutoff = upTo == null ? Number.POSITIVE_INFINITY : upTo.getTime();

  return submissions
    .filter((s) => isScorable(s.verdict) && s.submittedAt.getTime() <= cutoff)
    .sort((a, b) => {
      const at = a.submittedAt.getTime();
      const bt = b.submittedAt.getTime();
      if (at !== bt) return at - bt;
      return a.submissionId < b.submissionId ? -1 : a.submissionId > b.submissionId ? 1 : 0;
    });
}

function hintsInWindow(
  hintGrants: readonly HintGrantRecord[],
  upTo: Date | null | undefined,
): HintGrantRecord[] {
  const cutoff = upTo == null ? Number.POSITIVE_INFINITY : upTo.getTime();
  return hintGrants.filter((h) => h.grantedAt.getTime() <= cutoff);
}

/**
 * Hint cost for one problem.
 *
 * Rounded once on the total rather than per hint, so three hints on a 250-point problem cost
 * 113 rather than 3 x 37.5 rounded three separate ways. The deduction follows the *grant*,
 * not the problem type: if a HintGrant row exists, the student received help and pays for
 * it. In valid data grants only ever exist on group problems, so this is identical to
 * checking the problem's round — but it fails safe if hint issuance is ever buggy.
 */
function hintDeduction(hintsTaken: number, basePoints: number, percent: number): number {
  if (hintsTaken <= 0) return 0;
  // Multiply in integers, divide once at the end. Doing `hints * 0.15 * basePoints` instead
  // makes 3 hints on a 250-point problem cost 112 rather than 113, because 0.15 is not
  // representable in binary.
  return Math.round((hintsTaken * basePoints * percent) / 100);
}

interface ParticipantResult {
  readonly score: number;
  readonly penaltyMinutes: number;
  readonly lastScoreIncreaseMs: number | null;
  readonly problems: ProblemStanding[];
}

/**
 * Coding Night Classic (PRD §6.1) — partial credit, 5-minute penalties, hint costs.
 */
function scoreClassic(
  problemsById: ReadonlyMap<string, ScoringProblem>,
  submissions: readonly SubmissionRecord[],
  hintCounts: ReadonlyMap<string, number>,
): ParticipantResult {
  const byProblem = new Map<string, ProblemAccumulator>();
  let lastScoreIncreaseMs: number | null = null;

  // Chronological replay. Raising the running best on any problem is what makes a
  // submission "score-increasing" — the third ranking key in PRD §6.1.
  for (const submission of submissions) {
    const id = submission.contestProblemId;
    const accumulator = byProblem.get(id) ?? emptyAccumulator();

    if (isRejection(submission.verdict)) accumulator.rejections += 1;

    if (submission.score > accumulator.bestScore) {
      accumulator.bestScore = submission.score;
      lastScoreIncreaseMs = submission.submittedAt.getTime();
    }

    if (submission.score > 0 && accumulator.firstScoredAtMs === null) {
      accumulator.firstScoredAtMs = submission.submittedAt.getTime();
    }

    byProblem.set(id, accumulator);
  }

  // Any problem with a hint grant but no submission still owes its deduction, so seed those
  // in before totalling.
  for (const contestProblemId of hintCounts.keys()) {
    if (!byProblem.has(contestProblemId)) byProblem.set(contestProblemId, emptyAccumulator());
  }

  const problems: ProblemStanding[] = [];
  let score = 0;
  let penaltyMinutes = 0;

  // Sorted so the emitted array is identical run to run.
  for (const contestProblemId of [...byProblem.keys()].sort()) {
    const accumulator = byProblem.get(contestProblemId);
    if (accumulator === undefined) continue;

    const problem = problemsById.get(contestProblemId);
    const basePoints = problem?.basePoints ?? 0;
    const hintsTaken = hintCounts.get(contestProblemId) ?? 0;
    const deduction = hintDeduction(hintsTaken, basePoints, CLASSIC_PRESET.hintCostPercent);

    const problemScore = Math.max(0, accumulator.bestScore - deduction);

    // "5 minutes per rejected submission on a problem that is EVENTUALLY scored above zero.
    // Rejected submissions on never-scored problems cost nothing." The condition is on the
    // problem's final score, which is why penalty cannot be accumulated incrementally
    // during the replay above — it is not knowable until the whole log has been read.
    const problemPenalty =
      problemScore > 0 ? accumulator.rejections * CLASSIC_PRESET.penaltyMinutesPerRejection : 0;

    score += problemScore;
    penaltyMinutes += problemPenalty;

    problems.push({
      contestProblemId,
      score: problemScore,
      rejectedCount: accumulator.rejections,
      penaltyMinutes: problemPenalty,
      hintsTaken,
      hintDeduction: deduction,
      firstScoredAt:
        accumulator.firstScoredAtMs === null ? null : new Date(accumulator.firstScoredAtMs),
    });
  }

  return { score, penaltyMinutes, lastScoreIncreaseMs, problems };
}

/**
 * ICPC (PRD §6.2) — binary AC, 20 minutes per wrong submission on solved problems, ranked
 * by solve count then penalty.
 */
function scoreIcpc(
  submissions: readonly SubmissionRecord[],
  hintCounts: ReadonlyMap<string, number>,
): ParticipantResult {
  const byProblem = new Map<string, ProblemAccumulator>();
  let lastScoreIncreaseMs: number | null = null;

  for (const submission of submissions) {
    const id = submission.contestProblemId;
    const accumulator = byProblem.get(id) ?? emptyAccumulator();
    const alreadySolved = accumulator.bestScore > 0;

    if (isAccepted(submission.verdict)) {
      if (!alreadySolved) {
        accumulator.bestScore = 1;
        accumulator.firstScoredAtMs = submission.submittedAt.getTime();
        lastScoreIncreaseMs = submission.submittedAt.getTime();
      }
    } else if (isRejection(submission.verdict) && !alreadySolved) {
      // Attempts after the solve are free — under binary scoring there is nothing left to
      // gain, so they cannot be attempts "on the way to" the result.
      accumulator.rejections += 1;
    }

    byProblem.set(id, accumulator);
  }

  const problems: ProblemStanding[] = [];
  let score = 0;
  let penaltyMinutes = 0;

  for (const contestProblemId of [...byProblem.keys()].sort()) {
    const accumulator = byProblem.get(contestProblemId);
    if (accumulator === undefined) continue;

    const solved = accumulator.bestScore > 0;
    const problemPenalty = solved
      ? accumulator.rejections * ICPC_PRESET.penaltyMinutesPerRejection
      : 0;

    if (solved) score += 1;
    penaltyMinutes += problemPenalty;

    problems.push({
      contestProblemId,
      score: solved ? 1 : 0,
      rejectedCount: accumulator.rejections,
      penaltyMinutes: problemPenalty,
      hintsTaken: hintCounts.get(contestProblemId) ?? 0,
      hintDeduction: 0,
      firstScoredAt:
        accumulator.firstScoredAtMs === null ? null : new Date(accumulator.firstScoredAtMs),
    });
  }

  return { score, penaltyMinutes, lastScoreIncreaseMs, problems };
}

/**
 * Compute standings for every participant, ranked independently within each division.
 *
 * @param options.upTo Consider only submissions at or before this instant. The frozen public
 *                     board passes `config.freezeAt`; the admin view and the final unfreeze
 *                     pass null.
 */
export function computeStandings(
  config: ContestConfig,
  participants: readonly ParticipantRecord[],
  submissions: readonly SubmissionRecord[],
  hintGrants: readonly HintGrantRecord[],
  options?: ScoringOptions,
): readonly Standing[] {
  const upTo = options?.upTo ?? null;

  const problemsById = new Map(config.problems.map((p) => [p.contestProblemId, p]));

  const submissionsByParticipant = new Map<string, SubmissionRecord[]>();
  for (const submission of submissionsInWindow(submissions, upTo)) {
    const list = submissionsByParticipant.get(submission.participantId) ?? [];
    list.push(submission);
    submissionsByParticipant.set(submission.participantId, list);
  }

  const hintsByParticipant = new Map<string, Map<string, number>>();
  for (const grant of hintsInWindow(hintGrants, upTo)) {
    const perProblem = hintsByParticipant.get(grant.participantId) ?? new Map<string, number>();
    perProblem.set(grant.contestProblemId, (perProblem.get(grant.contestProblemId) ?? 0) + 1);
    hintsByParticipant.set(grant.participantId, perProblem);
  }

  const noHints: ReadonlyMap<string, number> = new Map();
  const results = new Map<string, ParticipantResult>();

  for (const participant of participants) {
    const theirSubmissions = submissionsByParticipant.get(participant.participantId) ?? [];
    const theirHints = hintsByParticipant.get(participant.participantId) ?? noHints;

    results.set(
      participant.participantId,
      config.presetId === "icpc"
        ? scoreIcpc(theirSubmissions, theirHints)
        : scoreClassic(problemsById, theirSubmissions, theirHints),
    );
  }

  // Rank within each division. Divisions are independent — there is an Intermediate winner
  // and an Advanced winner (PRD §6.1). Participants with no division are ranked together in
  // their own group rather than being dropped.
  const byDivision = new Map<string, ParticipantRecord[]>();
  for (const participant of participants) {
    const key = participant.divisionId ?? "";
    const list = byDivision.get(key) ?? [];
    list.push(participant);
    byDivision.set(key, list);
  }

  const rankByParticipant = new Map<string, { rank: number; isTied: boolean }>();
  for (const group of byDivision.values()) {
    const keys: RankKey[] = group.map((participant) => {
      const result = results.get(participant.participantId);
      return {
        participantId: participant.participantId,
        primary: result?.score ?? 0,
        penalty: result?.penaltyMinutes ?? 0,
        lastScoreIncreaseMs: result?.lastScoreIncreaseMs ?? null,
      };
    });

    for (const entry of rankDivision(keys)) {
      rankByParticipant.set(entry.participantId, { rank: entry.rank, isTied: entry.isTied });
    }
  }

  const divisionOrder = new Map(config.divisions.map((d) => [d.divisionId, d.sortOrder]));

  return participants
    .map((participant): Standing => {
      const result = results.get(participant.participantId);
      const ranking = rankByParticipant.get(participant.participantId);

      return {
        participantId: participant.participantId,
        displayName: participant.displayName,
        divisionId: participant.divisionId,
        score: result?.score ?? 0,
        penaltyMinutes: result?.penaltyMinutes ?? 0,
        lastScoreIncreaseAt:
          result?.lastScoreIncreaseMs == null ? null : new Date(result.lastScoreIncreaseMs),
        rank: ranking?.rank ?? 1,
        isTied: ranking?.isTied ?? false,
        problems: result?.problems ?? [],
      };
    })
    .sort((a, b) => {
      const aOrder = divisionOrder.get(a.divisionId ?? "") ?? Number.MAX_SAFE_INTEGER;
      const bOrder = divisionOrder.get(b.divisionId ?? "") ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      if (a.rank !== b.rank) return a.rank - b.rank;
      // Genuine tie: order by id so the emitted array is byte-identical run to run.
      return a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0;
    });
}
