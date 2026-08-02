import { NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { computeStandings } from "@/lib/scoring";
import { computeTeamStandings } from "@/lib/scoring/team";
import {
  StandingsResponseSchema,
  TeamStandingsResponseSchema,
  type StandingsResponse,
  type TeamPlayerProblem,
  type TeamStandingsResponse,
} from "@/lib/schemas/api";
import type {
  ContestConfig,
  HintGrantRecord,
  ParticipantRecord,
  ProblemStanding,
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

/** A participant row with the instant it first became part of this contest. */
export interface LoadedParticipant extends ParticipantRecord {
  readonly joinedAt: Date;
}

export interface ScoringInput {
  readonly contest: LoadedContest;
  readonly config: ContestConfig;
  readonly teams: readonly TeamRecord[];
  readonly participants: readonly LoadedParticipant[];
  readonly submissions: readonly SubmissionRecord[];
  readonly hintGrants: readonly HintGrantRecord[];
  readonly sideActivities: readonly SideActivityRecord[];
  readonly divisionNames: ReadonlyMap<string, string>;
  /** Set id to label ("A".."D"). Presentation only — the scoring engine never sees a set's name. */
  readonly problemSetLabels: readonly (readonly [string, string])[];
  /**
   * `contestProblemId` to what a reader needs to recognise the problem.
   *
   * Presentation only, and here for exactly the reason `problemSetLabels` is here: the scoring
   * engine must not know that a problem has a NAME. `ProblemStanding` carries a cuid and nothing
   * else, on purpose, and a breakdown showing `cms9iinaf002o…` is not a breakdown.
   */
  readonly problemLabels: readonly (readonly [string, ProblemLabel])[];
}

/** What the per-player breakdown needs to describe a problem. Never an input to a score. */
export interface ProblemLabel {
  readonly slotLabel: string;
  readonly title: string;
  readonly basePoints: number;
  readonly isGroupProblem: boolean;
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
const inputCache = new Map<
  string,
  { loadedAtMs: number; input: Promise<ScoringInput> }
>();

export function invalidateScoringInput(contestId: string): void {
  inputCache.delete(contestId);
}

export function loadScoringInput(
  contestId: string,
  now: Date,
): Promise<ScoringInput> {
  const cached = inputCache.get(contestId);
  if (
    cached !== undefined &&
    now.getTime() - cached.loadedAtMs < INPUT_TTL_MS
  ) {
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
          round: true,
          // `title` and `slotLabel` are read for the breakdown's benefit only. They are put on
          // `problemLabels` below and never on `config`, so nothing in `lib/scoring/` can see them.
          slotLabel: true,
          problem: { select: { title: true } },
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
          joinedAt: true,
        },
      },
      teams: { select: { id: true, name: true } },
      problemSets: {
        select: { id: true, label: true },
        orderBy: [{ label: "asc" }, { id: "asc" }],
      },
    },
  });

  if (contest === null) throw new NotFoundError("Contest");

  const [currentSubmissions, scoreRevisions, hintGrants, sideActivities] =
    await Promise.all([
      prisma.submission.findMany({
        // Compatibility fallback for a row written by an old process during a rolling deploy. New
        // score writes always append a revision in the same transaction.
        where: { contestProblem: { contestId }, verdict: { not: null } },
        select: {
          id: true,
          participantId: true,
          contestProblemId: true,
          submittedAt: true,
          effectiveAt: true,
          verdict: true,
          score: true,
        },
      }),
      prisma.submissionScoreRevision.findMany({
        where: { submission: { contestProblem: { contestId } } },
        select: {
          id: true,
          verdict: true,
          score: true,
          effectiveAt: true,
          submission: {
            select: {
              id: true,
              participantId: true,
              contestProblemId: true,
              submittedAt: true,
            },
          },
        },
        orderBy: { id: "asc" },
      }),
      prisma.hintGrant.findMany({
        where: { contestProblem: { contestId } },
        select: {
          participantId: true,
          contestProblemId: true,
          hintIndex: true,
          grantedAt: true,
        },
      }),
      // Admin-entered, no submission behind it. Ordered so replay is byte-identical: two activities
      // entered in the same millisecond would otherwise be summed in whatever order Postgres felt
      // like returning, and while addition commutes, the emitted JSON would not.
      prisma.teamSideActivity.findMany({
        where: { team: { contestId } },
        select: { teamId: true, label: true, points: true, enteredAt: true },
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
      round: cp.round,
    })),
    groupPointsInsideMean: contest.groupPointsInsideMean,
    sideActivitiesFlat: contest.sideActivitiesFlat,
  };
  const submissionsWithRevisions = new Set(
    scoreRevisions.map((revision) => revision.submission.id),
  );

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
      joinedAt: p.joinedAt,
    })),
    teams: contest.teams.map((t) => ({ teamId: t.id, name: t.name })),
    sideActivities,
    submissions: [
      ...scoreRevisions.map((revision) => ({
        submissionId: revision.submission.id,
        participantId: revision.submission.participantId,
        contestProblemId: revision.submission.contestProblemId,
        submittedAt: revision.submission.submittedAt,
        effectiveAt: revision.effectiveAt,
        verdict: revision.verdict,
        score: revision.score,
        revisionOrder: revision.id,
      })),
      // A revision wins whenever one exists. This fallback keeps standings available across a
      // rolling deploy where an older web process may still write only Submission for a moment.
      ...currentSubmissions
        .filter(
          (submission) =>
            submission.verdict !== null &&
            !submissionsWithRevisions.has(submission.id),
        )
        .map((submission) => ({
          submissionId: submission.id,
          participantId: submission.participantId,
          contestProblemId: submission.contestProblemId,
          submittedAt: submission.submittedAt,
          effectiveAt: submission.effectiveAt,
          verdict: submission.verdict,
          score: submission.score,
          revisionOrder: 0,
        })),
    ],
    hintGrants: hintGrants.map((h) => ({
      participantId: h.participantId,
      contestProblemId: h.contestProblemId,
      hintIndex: h.hintIndex,
      grantedAt: h.grantedAt,
    })),
    divisionNames: new Map(contest.divisions.map((d) => [d.id, d.name])),
    problemSetLabels: contest.problemSets.map(
      (set) => [set.id, set.label] as const,
    ),
    problemLabels: contest.contestProblems.map(
      (cp) =>
        [
          cp.id,
          {
            slotLabel: cp.slotLabel,
            title: cp.problem.title,
            basePoints: cp.basePoints,
            isGroupProblem: cp.round === "GROUP",
          },
        ] as const,
    ),
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
function cutoffFor(
  contest: LoadedContest,
  now: Date,
  admin: boolean,
): Date | null {
  if (admin) return null;
  if (!isPublicBoardFrozen(contest, now)) return null;
  return contest.freezeAt ?? contest.startsAt;
}

/**
 * A frozen board is a view of the whole contest at one instant, including who had joined by then.
 * Late sign-in remains useful during a freeze, but it must not add a new zero-score row, change a
 * tie, or move anyone's rank on the public board before the reveal.
 */
function participantsAt(
  participants: readonly LoadedParticipant[],
  upTo: Date | null,
): readonly LoadedParticipant[] {
  if (upTo === null) return participants;
  const cutoffMs = upTo.getTime();
  return participants.filter(
    (participant) => participant.joinedAt.getTime() <= cutoffMs,
  );
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
  const visibleParticipants = participantsAt(input.participants, upTo);

  return {
    input,
    standings: computeStandings(
      input.config,
      visibleParticipants,
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
 *
 * ## Who sees the per-player breakdown, and why
 *
 * `TeamPlayerRow.problems` is the per-problem detail: what each player scored on each problem, how
 * many rejected submissions it took, and what their hints cost. Both team-standings routes are
 * **unauthenticated** — the projector has no session — so THIS FUNCTION is the disclosure boundary.
 * A component cannot be it; by the time a component renders, the data has already crossed the wire
 * and is in the browser's network tab.
 *
 * | who is asking | `problems` | why |
 * |---|---|---|
 * | anonymous, and the projector | `null` | Per-problem scores, wrong-attempt counts and hint usage for every player of every team, with no login, is live competitive intel on a wall — and personally embarrassing about a named minor. The freeze exists precisely to stop the room reading live progress; this would hand the room more than the unfrozen board ever did. |
 * | competitor, their OWN team | full array | Their teammates' points are the divisor in their own score. `/team` exists so a student can check arithmetic they are being ranked on, and a mean cannot be checked from the total alone. |
 * | competitor, ANOTHER team | `null` | Another student's attempt history is not theirs to read. Their team's total, rank and per-player points stay visible, because those are already on the projector. |
 * | organizer | full array, every team | Needs it to spot a stuck player mid-round, and to settle a dispute on `/admin/awards` after. An organizer already sees through the freeze. |
 *
 * The freeze needs no second decision here: the detail comes out of the same
 * `computeTeamStandings(..., { upTo })` call as the totals, so a frozen board's detail is frozen
 * for free and an organizer's is live for free. No route can leak an unfrozen breakdown by
 * forgetting a parameter, which is the property `cutoffFor` was built to guarantee.
 */
export async function getTeamStandings(
  contestId: string,
  viewer: Viewer,
  now: Date,
): Promise<TeamStandingsResponse> {
  const admin = isAdmin(viewer);
  const input = await loadScoringInput(contestId, now);
  const upTo = cutoffFor(input.contest, now, admin);
  const visibleParticipants = participantsAt(input.participants, upTo);

  const teams = computeTeamStandings(
    input.config,
    input.teams,
    visibleParticipants,
    input.submissions,
    input.hintGrants,
    input.sideActivities,
    { upTo },
  );

  // Set labels are a presentation concern, so they are looked up here rather than threaded through
  // the scoring engine — which must not know that a set has a name.
  const setLabel = new Map(input.problemSetLabels);
  const problemLabel = new Map(input.problemLabels);

  /**
   * The viewer's own team, or null.
   *
   * No new query and no change to `Viewer`: `CompetitorViewer` carries no `teamId`, but the
   * participant rows this function already holds do. A competitor viewing another contest's board
   * matches nothing here and lands on null, which is the safe side.
   */
  const viewerTeamId =
    viewer.kind === "competitor"
      ? (visibleParticipants.find(
          (p) => p.participantId === viewer.participantId,
        )?.teamId ?? null)
      : null;

  return TeamStandingsResponseSchema.parse({
    contestId,
    frozen: !admin && isPublicBoardFrozen(input.contest, now),
    asOf: (upTo ?? now).toISOString(),
    endsAt: input.contest.endsAt.toISOString(),
    setLabels: input.problemSetLabels.map(([, label]) => label),
    groupPointsInsideMean: input.config.groupPointsInsideMean,
    sideActivitiesFlat: input.config.sideActivitiesFlat,
    teams: teams.map((team) => {
      // Decided once, per team, here — the one place that knows both who is asking and whose row
      // this is. A component cannot make this decision, because by the time it renders the data
      // has already crossed the wire.
      const mayReadDetail =
        admin || (viewerTeamId !== null && team.teamId === viewerTeamId);

      return {
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
          chosenSetLabel:
            player.chosenSetId === null
              ? null
              : (setLabel.get(player.chosenSetId) ?? null),
          // Computed here, off the same problems `score` sums, so a solve count can never
          // disagree with the total printed beside it.
          solvedCount: player.problems.filter(
            (p) =>
              p.score > 0 &&
              problemLabel.get(p.contestProblemId)?.isGroupProblem !== true,
          ).length,
          lastScoreIncreaseAt:
            player.lastScoreIncreaseAt?.toISOString() ?? null,
          problems: mayReadDetail
            ? detailFor(player.problems, problemLabel)
            : null,
        })),
      };
    }),
  });
}

/**
 * The per-problem breakdown for one player, labelled and re-sorted for a reader.
 *
 * The engine emits `problems` sorted by `contestProblemId` — stable, and byte-identical on replay,
 * but meaningless to a student looking for "the second easy one". Sorting for display therefore
 * happens HERE, in presentation, never in `lib/scoring/`.
 *
 * The sort key is the PAIR `(slotLabel, contestProblemId)`. `prisma/schema.prisma` puts no
 * uniqueness constraint on `slotLabel`, so two problems may share one, and a single-key sort over a
 * non-unique key is not stable — which would break byte-identical replay in exactly the way the
 * per-player breakdown already broke it once.
 */
function detailFor(
  problems: readonly ProblemStanding[],
  labels: ReadonlyMap<string, ProblemLabel>,
): readonly TeamPlayerProblem[] {
  const unknownProblem: ProblemLabel = {
    // A submission whose ContestProblem was removed from the line-up. Rare, but it must render as
    // something a human can act on rather than vanish from a total it still contributes to.
    slotLabel: "?",
    title: "Removed from the line-up",
    basePoints: 0,
    isGroupProblem: false,
  };

  return problems
    .map((problem) => {
      const label = labels.get(problem.contestProblemId) ?? unknownProblem;
      return {
        contestProblemId: problem.contestProblemId,
        slotLabel: label.slotLabel,
        title: label.title,
        basePoints: label.basePoints,
        score: problem.score,
        rejectedCount: problem.rejectedCount,
        penaltyMinutes: problem.penaltyMinutes,
        hintsTaken: problem.hintsTaken,
        hintDeduction: problem.hintDeduction,
        firstScoredAt: problem.firstScoredAt?.toISOString() ?? null,
        isGroupProblem: label.isGroupProblem,
      };
    })
    .sort((a, b) => {
      const bySlot = a.slotLabel.localeCompare(b.slotLabel);
      if (bySlot !== 0) return bySlot;
      return a.contestProblemId < b.contestProblemId
        ? -1
        : a.contestProblemId > b.contestProblemId
          ? 1
          : 0;
    });
}
