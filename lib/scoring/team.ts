import {
  POINT_SCALE,
  divideRoundHalfAway,
  type ContestConfig,
  type HintGrantRecord,
  type ParticipantRecord,
  type PlayerStanding,
  type ScoringOptions,
  type SideActivityRecord,
  type SubmissionRecord,
  type TeamRecord,
  type TeamStanding,
} from "@/lib/types/scoring";

import { computeStandings } from "@/lib/scoring/index";
import { rankDivision, type RankKey } from "@/lib/scoring/rank";

/**
 * Team scoring — the thing that replaces the spreadsheet.
 *
 * ```
 * teamScore = (sum of ALL player points, group problems included) / teamSize
 *             + sideActivityPoints
 * ```
 *
 * Pure, like everything in `lib/scoring/`: no I/O, no `Date.now()`, no randomness. Every fact
 * arrives as an argument including the clock, which is what makes standings replayable.
 *
 * ## Why this could not be done in HackerRank
 *
 * HackerRank ranks individuals on identical problem sets. Coding Night runs players on *different*
 * sets, totals each team, and divides by the team's actual size so a team of two and a team of five
 * are comparable. That single mismatch is what forced the spreadsheet, and this function is the
 * whole reason this platform exists.
 *
 * ## Arithmetic is integer hundredths
 *
 * The mean makes fractional scores normal — 543.75 is a real result from a real scoring sheet — and
 * floats are not acceptable in a scoring engine. `3 * 0.15 * 250` already evaluated to
 * `112.49999999999999` once in this codebase and cost a student a point. Every value below is
 * hundredths of a point, with exactly one rounding site: the mean.
 *
 * See `docs/SCORING.md`.
 */

/** What this module needs out of a per-participant standing. */
interface PlayerStandingSource {
  readonly participantId: string;
  readonly displayName: string;
  readonly divisionId: string | null;
  readonly penaltyMinutes: number;
  readonly lastScoreIncreaseAt: Date | null;
  readonly problems: readonly {
    readonly contestProblemId: string;
    readonly score: number;
  }[];
}

export function computeTeamStandings(
  config: ContestConfig,
  teams: readonly TeamRecord[],
  participants: readonly ParticipantRecord[],
  submissions: readonly SubmissionRecord[],
  hintGrants: readonly HintGrantRecord[],
  sideActivities: readonly SideActivityRecord[],
  options?: ScoringOptions,
): readonly TeamStanding[] {
  // Per-player scores come from the existing engine, unchanged. Team scoring is an aggregation
  // on top of it rather than a second implementation of per-problem scoring — there is still
  // exactly one place that decides what a submission is worth.
  const playerStandings = computeStandings(config, participants, submissions, hintGrants, options);
  const byParticipant = new Map(playerStandings.map((s) => [s.participantId, s]));

  const groupProblemIds = new Set(
    config.problems.filter((p) => p.round === "GROUP").map((p) => p.contestProblemId),
  );

  /*
   * A group problem belongs to the TEAM, including its attempt log. Scoring every member first
   * and then taking the best score gets the points right, but not the event semantics:
   *
   * - a second teammate's equal AC is not another team score increase;
   * - Classic penalties apply to each team attempt exactly once once the team scores;
   * - ICPC attempts after the team's first solve are free, even if that particular teammate had
   *   not submitted an AC before.
   *
   * Replaying the union of the team's group submissions as one synthetic participant gives us
   * those rules directly from the canonical per-problem engine. It also keeps freeze/effectiveAt,
   * hint deductions, same-instant ordering, and preset differences in one implementation.
   */
  const participantTeam = new Map(
    participants.flatMap((participant) =>
      participant.teamId === null
        ? []
        : ([[participant.participantId, participant.teamId]] as const),
    ),
  );
  const groupProblems = config.problems.filter((problem) => problem.round === "GROUP");
  const teamAsParticipants: ParticipantRecord[] = teams.map((team) => ({
    participantId: team.teamId,
    displayName: team.name,
    divisionId: null,
    teamId: null,
    chosenSetId: null,
  }));
  const groupSubmissions: SubmissionRecord[] = submissions.flatMap((submission) => {
    if (!groupProblemIds.has(submission.contestProblemId)) return [];
    const teamId = participantTeam.get(submission.participantId);
    return teamId === undefined ? [] : [{ ...submission, participantId: teamId }];
  });
  const groupHintGrants: HintGrantRecord[] = hintGrants.flatMap((grant) => {
    if (!groupProblemIds.has(grant.contestProblemId)) return [];
    const teamId = participantTeam.get(grant.participantId);
    return teamId === undefined ? [] : [{ ...grant, participantId: teamId }];
  });
  const groupStandings = computeStandings(
    { ...config, divisions: [], problems: groupProblems },
    teamAsParticipants,
    groupSubmissions,
    groupHintGrants,
    options,
  );
  const groupByTeam = new Map(groupStandings.map((standing) => [standing.participantId, standing]));

  // A player's row is their own contribution, so group events must not leak into its penalty or
  // last-increase columns. Keep the full standing above for the authorized per-problem detail,
  // and replay only non-group events for the row and for the individual part of team ranking.
  const individualStandings = computeStandings(
    { ...config, problems: config.problems.filter((problem) => problem.round !== "GROUP") },
    participants,
    submissions.filter((submission) => !groupProblemIds.has(submission.contestProblemId)),
    hintGrants.filter((grant) => !groupProblemIds.has(grant.contestProblemId)),
    options,
  );
  const individualByParticipant = new Map(
    individualStandings.map((standing) => [standing.participantId, standing]),
  );

  const participantsByTeam = new Map<string, ParticipantRecord[]>();
  for (const participant of participants) {
    if (participant.teamId === null) continue; // contributes to no team score
    const list = participantsByTeam.get(participant.teamId) ?? [];
    list.push(participant);
    participantsByTeam.set(participant.teamId, list);
  }

  const sideByTeam = new Map<string, number>();
  for (const activity of sideActivities) {
    if (options?.upTo != null && activity.enteredAt.getTime() > options.upTo.getTime()) continue;
    sideByTeam.set(activity.teamId, (sideByTeam.get(activity.teamId) ?? 0) + activity.points);
  }

  interface Computed {
    readonly team: TeamRecord;
    readonly teamSize: number;
    readonly scoreHundredths: number;
    readonly individualPoints: number;
    readonly groupPoints: number;
    readonly sideActivityPoints: number;
    readonly penaltyMinutes: number;
    readonly lastScoreIncreaseAt: Date | null;
    readonly players: readonly PlayerStanding[];
  }

  const computed: Computed[] = teams.map((team) => {
    const members = participantsByTeam.get(team.teamId) ?? [];
    // The divisor is the team's ACTUAL size. A team of one is legal and scores as itself; a team
    // of zero would divide by zero, so it scores nothing rather than crashing the board.
    const teamSize = members.length;

    const sources: PlayerStandingSource[] = members.map((member) => {
      const standing = byParticipant.get(member.participantId);
      const individualStanding = individualByParticipant.get(member.participantId);
      return {
        participantId: member.participantId,
        displayName: member.displayName,
        divisionId: member.divisionId,
        penaltyMinutes: individualStanding?.penaltyMinutes ?? 0,
        lastScoreIncreaseAt: individualStanding?.lastScoreIncreaseAt ?? null,
        problems: standing?.problems ?? [],
      };
    });

    // A player's own points are their INDIVIDUAL problems only. Group points are a team fact and
    // are added once at team level — attributing them to whichever teammate happened to press
    // submit would make the breakdown misleading and, if two teammates submitted, double-count.
    const players: PlayerStanding[] = sources.map((source, index) => {
      const member = members[index];
      const individual = source.problems
        .filter((p) => !groupProblemIds.has(p.contestProblemId))
        .reduce((sum, p) => sum + p.score, 0);

      return {
        participantId: source.participantId,
        displayName: source.displayName,
        divisionId: source.divisionId,
        teamId: team.teamId,
        chosenSetId: member?.chosenSetId ?? null,
        score: individual,
        penaltyMinutes: source.penaltyMinutes,
        lastScoreIncreaseAt: source.lastScoreIncreaseAt,
        problems: byParticipant.get(source.participantId)?.problems ?? [],
      };
    });

    // Sorted by id, not left in input order.
    //
    // Ranks and scores were already correct without this — addition commutes — but the EMITTED
    // JSON was not, so replaying the same contest with the roster read back in a different order
    // produced different bytes. PRD §6.6 requires byte-identical replay, and "the numbers were
    // right" is not the requirement. Postgres is free to return rows in any order it likes.
    players.sort((a, b) =>
      a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0,
    );

    const individualPoints = players.reduce((sum, p) => sum + p.score, 0);
    const groupStanding = groupByTeam.get(team.teamId);
    const groupPoints = groupStanding?.score ?? 0;
    const sideActivityPoints = sideByTeam.get(team.teamId) ?? 0;

    // --- the formula, in hundredths -------------------------------------------
    const individualHundredths = individualPoints * POINT_SCALE;
    const groupHundredths = groupPoints * POINT_SCALE;
    const sideHundredths = sideActivityPoints * POINT_SCALE;

    // Group points go inside the pool by default, so they are divided by team size like everything
    // else. With the flag off they are added after the mean, which makes a group problem worth
    // teamSize times as much — a real format, but not the one Coding Night runs.
    const poolHundredths = config.groupPointsInsideMean
      ? individualHundredths + groupHundredths
      : individualHundredths;

    // The ONLY rounding site in the engine.
    const meanHundredths = teamSize === 0 ? 0 : divideRoundHalfAway(poolHundredths, teamSize);

    const sideContribution = config.sideActivitiesFlat
      ? sideHundredths
      : teamSize === 0
        ? 0
        : divideRoundHalfAway(sideHundredths, teamSize);

    const afterMean = config.groupPointsInsideMean ? 0 : groupHundredths;

    const scoreHundredths = meanHundredths + afterMean + sideContribution;

    const penaltyMinutes =
      players.reduce((sum, p) => sum + p.penaltyMinutes, 0) +
      (groupStanding?.penaltyMinutes ?? 0);

    const lastIndividualIncreaseAt = players.reduce<Date | null>((latest, p) => {
      if (p.lastScoreIncreaseAt === null) return latest;
      if (latest === null) return p.lastScoreIncreaseAt;
      return p.lastScoreIncreaseAt > latest ? p.lastScoreIncreaseAt : latest;
    }, null);
    const groupIncreaseAt = groupStanding?.lastScoreIncreaseAt ?? null;
    const lastScoreIncreaseAt =
      lastIndividualIncreaseAt === null
        ? groupIncreaseAt
        : groupIncreaseAt === null || lastIndividualIncreaseAt > groupIncreaseAt
          ? lastIndividualIncreaseAt
          : groupIncreaseAt;

    return {
      team,
      teamSize,
      scoreHundredths,
      individualPoints,
      groupPoints,
      sideActivityPoints,
      penaltyMinutes,
      lastScoreIncreaseAt,
      players,
    };
  });

  // Rank teams. rankDivision is reused verbatim: its `participantId` is just an opaque id, and
  // the tie semantics wanted here are exactly the ones it already guarantees.
  const keys: RankKey[] = computed.map((entry) => ({
    participantId: entry.team.teamId,
    primary: entry.scoreHundredths,
    penalty: entry.penaltyMinutes,
    lastScoreIncreaseMs: entry.lastScoreIncreaseAt?.getTime() ?? null,
  }));

  const ranking = new Map(
    rankDivision(keys).map((e) => [e.participantId, { rank: e.rank, isTied: e.isTied }]),
  );

  return computed
    .map((entry): TeamStanding => {
      const rank = ranking.get(entry.team.teamId);
      return {
        teamId: entry.team.teamId,
        name: entry.team.name,
        divisionId: entry.team.divisionId,
        teamSize: entry.teamSize,
        scoreHundredths: entry.scoreHundredths,
        // Display only. Never compared, never summed — scoreHundredths is authoritative.
        score: entry.scoreHundredths / POINT_SCALE,
        playerPoolPoints: config.groupPointsInsideMean
          ? entry.individualPoints + entry.groupPoints
          : entry.individualPoints,
        groupPoints: entry.groupPoints,
        sideActivityPoints: entry.sideActivityPoints,
        penaltyMinutes: entry.penaltyMinutes,
        lastScoreIncreaseAt: entry.lastScoreIncreaseAt,
        rank: rank?.rank ?? 1,
        isTied: rank?.isTied ?? false,
        players: entry.players,
      };
    })
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      // Genuine tie: order by id so the emitted array is byte-identical run to run.
      return a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0;
    });
}

/**
 * Re-rank an already-ranked team list WITHIN one division, dense with ties preserved.
 *
 * The engine ranks every team on one board (that is the night's headline number); a division
 * tab shows only that division's teams, and showing the global ranks there would read as gaps
 * ("1, 4, 5"). Within a division the order is the ordered sublist of the global order, so the
 * derivation is pure: walk the filtered list in its given order, start at 1, and two adjacent
 * teams share a rank exactly when they compare equal on the authoritative key
 * (`scoreHundredths`) - the same key the global ranking used, so the two views can never
 * disagree about who beat whom.
 *
 * Lives here rather than in a component because it IS scoring output (a division winner is a
 * scored fact), and scoring lives in exactly one place.
 */
export function rankTeamsWithinDivision(
  ranked: readonly TeamStanding[],
  divisionId: string | null,
): TeamStanding[] {
  const subset = ranked.filter((team) => team.divisionId === divisionId);
  let lastScore: number | null = null;
  let lastRank = 0;
  const reRanked = subset.map((team, index) => {
    const rank = team.scoreHundredths === lastScore ? lastRank : index + 1;
    lastScore = team.scoreHundredths;
    lastRank = rank;
    return { team, rank };
  });
  return reRanked.map(({ team, rank }, index) => ({
    ...team,
    rank,
    isTied:
      (index > 0 && reRanked[index - 1]?.rank === rank) ||
      (index + 1 < reRanked.length && reRanked[index + 1]?.rank === rank),
  }));
}
