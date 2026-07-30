import { NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { computeStandings } from "@/lib/scoring";
import { computeTeamStandings } from "@/lib/scoring/team";
import {
  StandingsResponseSchema,
  TeamStandingsResponseSchema,
  type StandingsResponse,
  type TeamStandingsResponse,
} from "@/lib/schemas/api";
import type {
  ContestConfig,
  HintGrantRecord,
  ParticipantRecord,
  ScoringPresetId,
  SideActivityRecord,
  Standing,
  SubmissionRecord,
  TeamRecord,
} from "@/lib/types/scoring";
import { isPublicBoardFrozen, type ContestGateInput } from "@/lib/contest/gate";
import { rankSnapshots } from "@/lib/contest/delta";
import { isAdmin, type Viewer } from "@/lib/contest/viewer";

/**
 * Standings.
 *
 * This module reads rows and calls `computeStandings`. It does not add, subtract, or compare a
 * single point — scoring lives in exactly one place (CLAUDE.md), and the freeze is expressed by
 * *what instant we ask about*, never by filtering the answer afterwards (PRD §6.3, D16).
 */

export interface LoadedContest extends ContestGateInput {
  readonly id: string;
  readonly name: string;
  readonly presetId: ScoringPresetId;
}

export interface ScoringInput {
  readonly contest: LoadedContest;
  readonly config: ContestConfig;
  readonly teams: readonly TeamRecord[];
  readonly participants: readonly ParticipantRecord[];
  readonly submissions: readonly SubmissionRecord[];
  readonly hintGrants: readonly HintGrantRecord[];
  readonly sideActivities: readonly SideActivityRecord[];
  readonly divisionNames: ReadonlyMap<string, string>;
  /** Set id to label ("A".."D"). Presentation only — the scoring engine never sees a set's name. */
  readonly problemSetLabels: readonly (readonly [string, string])[];
}

/** The unlabelled group: participants an organizer has not put in a division yet. */
const UNASSIGNED_DIVISION_ID = "";
const UNASSIGNED_DIVISION_NAME = "Unassigned";

function asPresetId(value: string): ScoringPresetId {
  return value === "icpc" ? "icpc" : "coding-night-classic";
}

/**
 * A short-lived memo of the scoring input.
 *
 * Twenty phones polling plus a projector plus an SSE tick each want the same rows a second
 * apart. One second of staleness is invisible on a leaderboard and turns a burst into a single
 * query set. It is a cache of *inputs*, never of scores, so replay is untouched.
 */
const INPUT_TTL_MS = 1_000;
const inputCache = new Map<string, { loadedAtMs: number; input: Promise<ScoringInput> }>();

export function invalidateScoringInput(contestId: string): void {
  inputCache.delete(contestId);
}

export function loadScoringInput(contestId: string, now: Date): Promise<ScoringInput> {
  const cached = inputCache.get(contestId);
  if (cached !== undefined && now.getTime() - cached.loadedAtMs < INPUT_TTL_MS) {
    return cached.input;
  }

  const input = queryScoringInput(contestId);
  inputCache.set(contestId, { loadedAtMs: now.getTime(), input });
  // A failed load must not be cached, or one blip poisons the board for a second.
  input.catch(() => inputCache.delete(contestId));
  return input;
}

async function queryScoringInput(contestId: string): Promise<ScoringInput> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: {
      id: true,
      name: true,
      startsAt: true,
      endsAt: true,
      freezeAt: true,
      state: true,
      scoringPresetId: true,
      groupPointsInsideMean: true,
      sideActivitiesFlat: true,
      divisions: { select: { id: true, name: true, sortOrder: true } },
      contestProblems: {
        select: {
          id: true,
          divisionId: true,
          basePoints: true,
          problem: { select: { round: true } },
          setId: true,
        },
      },
      participants: {
        select: {
          id: true,
          displayName: true,
          divisionId: true,
          teamId: true,
          chosenSetId: true,
        },
      },
      teams: { select: { id: true, name: true } },
      problemSets: { select: { id: true, label: true } },
    },
  });

  if (contest === null) throw new NotFoundError("Contest");

  const [submissions, hintGrants, sideActivities] = await Promise.all([
    prisma.submission.findMany({
      where: { contestProblem: { contestId }, verdict: { not: null } },
      select: {
        id: true,
        participantId: true,
        contestProblemId: true,
        submittedAt: true,
        verdict: true,
        score: true,
      },
    }),
    prisma.hintGrant.findMany({
      where: { contestProblem: { contestId } },
      select: { participantId: true, contestProblemId: true, hintIndex: true, grantedAt: true },
    }),
    // Admin-entered, no submission behind it. Ordered so replay is byte-identical: two activities
    // entered in the same millisecond would otherwise be summed in whatever order Postgres felt
    // like returning, and while addition commutes, the emitted JSON would not.
    prisma.teamSideActivity.findMany({
      where: { team: { contestId } },
      select: { teamId: true, label: true, points: true },
      orderBy: [{ enteredAt: "asc" }, { id: "asc" }],
    }),
  ]);

  const config: ContestConfig = {
    contestId: contest.id,
    presetId: asPresetId(contest.scoringPresetId),
    startsAt: contest.startsAt,
    endsAt: contest.endsAt,
    freezeAt: contest.freezeAt,
    divisions: contest.divisions.map((d) => ({
      divisionId: d.id,
      name: d.name,
      sortOrder: d.sortOrder,
    })),
    problems: contest.contestProblems.map((cp) => ({
      contestProblemId: cp.id,
      divisionId: cp.divisionId,
      basePoints: cp.basePoints,
      setId: cp.setId,
      round: cp.problem.round,
    })),
    groupPointsInsideMean: contest.groupPointsInsideMean,
    sideActivitiesFlat: contest.sideActivitiesFlat,
  };

  return {
    contest: {
      id: contest.id,
      name: contest.name,
      startsAt: contest.startsAt,
      endsAt: contest.endsAt,
      freezeAt: contest.freezeAt,
      state: contest.state,
      presetId: config.presetId,
    },
    config,
    participants: contest.participants.map((p) => ({
      participantId: p.id,
      displayName: p.displayName,
      divisionId: p.divisionId,
      teamId: p.teamId,
      chosenSetId: p.chosenSetId,
    })),
    teams: contest.teams.map((t) => ({ teamId: t.id, name: t.name })),
    sideActivities,
    submissions: submissions
      .filter((s): s is typeof s & { verdict: NonNullable<typeof s.verdict> } => s.verdict !== null)
      .map((s) => ({
        submissionId: s.id,
        participantId: s.participantId,
        contestProblemId: s.contestProblemId,
        submittedAt: s.submittedAt,
        verdict: s.verdict,
        score: s.score,
      })),
    hintGrants: hintGrants.map((h) => ({
      participantId: h.participantId,
      contestProblemId: h.contestProblemId,
      hintIndex: h.hintIndex,
      grantedAt: h.grantedAt,
    })),
    divisionNames: new Map(contest.divisions.map((d) => [d.id, d.name])),
    problemSetLabels: contest.problemSets.map((set) => [set.id, set.label] as const),
  };
}

/**
 * The instant a viewer's board reflects.
 *
 * Organizers always see live truth. The public board sees the freeze point.
 *
 * The `?? startsAt` fallback fails **closed**: a contest marked FROZEN with no `freezeAt` is a
 * state the API cannot produce — freezing always stamps the instant — but if bad data ever
 * produced it, showing an empty board is the wrong-but-safe answer and showing live scores
 * during a freeze is the wrong-and-unsafe one.
 */
function cutoffFor(contest: LoadedContest, now: Date, admin: boolean): Date | null {
  if (admin) return null;
  if (!isPublicBoardFrozen(contest, now)) return null;
  return contest.freezeAt ?? contest.startsAt;
}

export interface ComputedStandings {
  readonly input: ScoringInput;
  readonly standings: readonly Standing[];
  readonly frozen: boolean;
  readonly asOf: Date;
}

export async function computeFor(
  contestId: string,
  viewer: Viewer,
  now: Date,
): Promise<ComputedStandings> {
  const admin = isAdmin(viewer);
  const input = await loadScoringInput(contestId, now);
  const upTo = cutoffFor(input.contest, now, admin);

  return {
    input,
    standings: computeStandings(
      input.config,
      input.participants,
      input.submissions,
      input.hintGrants,
      { upTo },
    ),
    frozen: !admin && isPublicBoardFrozen(input.contest, now),
    asOf: upTo ?? now,
  };
}

/**
 * The standings response. Public by design — the projector has no login (PRD §4) — so nothing
 * here may be anything a spectator should not read. It is rank, name, score, penalty.
 */
export async function getStandings(
  contestId: string,
  viewer: Viewer,
  now: Date,
): Promise<StandingsResponse> {
  const computed = await computeFor(contestId, viewer, now);
  const { input, standings } = computed;

  const deltaKey = `${contestId}:${isAdmin(viewer) ? "admin" : "public"}`;
  const deltas = rankSnapshots.deltasFor(deltaKey, standings, now);

  const grouped = new Map<string, Standing[]>();
  for (const standing of standings) {
    const key = standing.divisionId ?? UNASSIGNED_DIVISION_ID;
    const rows = grouped.get(key) ?? [];
    rows.push(standing);
    grouped.set(key, rows);
  }

  // Configured divisions first, in their sort order, then anyone unassigned.
  const orderedKeys = [
    ...input.config.divisions
      .toSorted((a, b) => a.sortOrder - b.sortOrder)
      .map((d) => d.divisionId)
      .filter((id) => grouped.has(id)),
    ...(grouped.has(UNASSIGNED_DIVISION_ID) ? [UNASSIGNED_DIVISION_ID] : []),
  ];

  return StandingsResponseSchema.parse({
    contestId,
    frozen: computed.frozen,
    asOf: computed.asOf.toISOString(),
    endsAt: input.contest.endsAt.toISOString(),
    divisions: orderedKeys.map((divisionId) => ({
      divisionId,
      name: input.divisionNames.get(divisionId) ?? UNASSIGNED_DIVISION_NAME,
      rows: (grouped.get(divisionId) ?? [])
        .toSorted((a, b) => a.rank - b.rank)
        .map((standing) => ({
          rank: standing.rank,
          isTied: standing.isTied,
          participantId: standing.participantId,
          displayName: standing.displayName,
          score: standing.score,
          penaltyMinutes: standing.penaltyMinutes,
          delta: deltas.get(standing.participantId) ?? 0,
        })),
    })),
  });
}

/** One participant's per-problem detail, for the problem list. Never recomputed by hand. */
export async function problemStandingsFor(
  contestId: string,
  participantId: string,
  now: Date,
): Promise<Map<string, { score: number; hintsTaken: number }>> {
  const input = await loadScoringInput(contestId, now);
  const standings = computeStandings(
    input.config,
    input.participants,
    input.submissions,
    input.hintGrants,
    { upTo: null },
  );

  const mine = standings.find((s) => s.participantId === participantId);
  const byProblem = new Map<string, { score: number; hintsTaken: number }>();
  for (const problem of mine?.problems ?? []) {
    byProblem.set(problem.contestProblemId, {
      score: problem.score,
      hintsTaken: problem.hintsTaken,
    });
  }
  return byProblem;
}


/**
 * Team standings — **the board Coding Night actually ranks by** (PRD §9.3).
 *
 * Public, like the individual board, because the projector has no login. That constrains what may
 * appear: rank, team name, score, the arithmetic behind it, and each member's own points. A
 * spectator seeing a player's point total is fine; a spectator seeing their source code is not, and
 * nothing here reaches for it.
 *
 * The freeze works the same way and for the same reason — by asking about an earlier INSTANT rather
 * than by filtering the answer afterwards, so the frozen board is a real board from a real moment
 * and the unfreeze is the same function called again (D16).
 */
export async function getTeamStandings(
  contestId: string,
  viewer: Viewer,
  now: Date,
): Promise<TeamStandingsResponse> {
  const admin = isAdmin(viewer);
  const input = await loadScoringInput(contestId, now);
  const upTo = cutoffFor(input.contest, now, admin);

  const teams = computeTeamStandings(
    input.config,
    input.teams,
    input.participants,
    input.submissions,
    input.hintGrants,
    input.sideActivities,
    { upTo },
  );

  // Set labels are a presentation concern, so they are looked up here rather than threaded through
  // the scoring engine — which must not know that a set has a name.
  const setLabel = new Map(input.problemSetLabels);

  return TeamStandingsResponseSchema.parse({
    contestId,
    frozen: !admin && isPublicBoardFrozen(input.contest, now),
    asOf: (upTo ?? now).toISOString(),
    endsAt: input.contest.endsAt.toISOString(),
    teams: teams.map((team) => ({
      teamId: team.teamId,
      name: team.name,
      rank: team.rank,
      isTied: team.isTied,
      score: team.score,
      scoreHundredths: team.scoreHundredths,
      teamSize: team.teamSize,
      playerPoolPoints: team.playerPoolPoints,
      groupPoints: team.groupPoints,
      sideActivityPoints: team.sideActivityPoints,
      penaltyMinutes: team.penaltyMinutes,
      players: team.players.map((player) => ({
        participantId: player.participantId,
        displayName: player.displayName,
        score: player.score,
        penaltyMinutes: player.penaltyMinutes,
        chosenSetLabel: player.chosenSetId === null ? null : setLabel.get(player.chosenSetId) ?? null,
      })),
    })),
  });
}
