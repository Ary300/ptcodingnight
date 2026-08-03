import { describe, expect, it } from "vitest";

import { computeTeamStandings } from "@/lib/scoring/team";
import type {
  ContestConfig,
  ParticipantRecord,
  SubmissionRecord,
  TeamRecord,
} from "@/lib/types/scoring";

import { loadGoldenTeamContest } from "@/fixtures/scoring/load";

/**
 * The contest FORMAT the organizer confirmed, pinned at the scoring layer.
 *
 * Verbatim from the organizer: group questions are the same for every team, and for the
 * individual round every member of a team holds a DIFFERENT set while the same set label means
 * the SAME questions across teams (John on team 1 and Mark on team 2 both hold set A and see
 * identical problems).
 *
 * The structural halves of that live elsewhere and are tested there: `ProblemSet` is keyed
 * `(contestId, label)` with no team column, `planSets` takes no team input at all, and
 * `assignSets` balances sets within a team. What THIS file pins is the scoring consequences:
 * a set problem is one contest-level row scoreable by its holders on any team, and the divisor
 * counts every member of the roster whether or not a set was ever assigned to them.
 *
 * `team.test.ts` already pins the third format property, that a group problem is scored once
 * per team rather than once per member; it is not repeated here.
 */

describe("the same set label is the same questions across teams", () => {
  it("scores members of different teams on the same contest problem, independently", () => {
    // One contest-level set problem. If sets were per-team, alpha's copy and beta's copy would
    // be different rows and this single contestProblemId could not serve both.
    const start = new Date("2026-04-10T18:00:00.000Z");
    const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
    const teams: TeamRecord[] = [
      { teamId: "alpha", name: "Alpha", divisionId: null },
      { teamId: "beta", name: "Beta", divisionId: null },
    ];
    // John and Mark, one per team, both holding set A: the organizer's own example.
    const participants: ParticipantRecord[] = [
      { participantId: "john", displayName: "John", divisionId: null, teamId: "alpha", chosenSetId: "A" },
      { participantId: "mark", displayName: "Mark", divisionId: null, teamId: "beta", chosenSetId: "A" },
    ];
    const config: ContestConfig = {
      contestId: "shared-set",
      presetId: "coding-night-classic",
      startsAt: start,
      endsAt: at(120),
      freezeAt: null,
      divisions: [],
      problems: [
        {
          contestProblemId: "A-E1",
          divisionId: null,
          setId: "A",
          basePoints: 100,
          round: "INDIVIDUAL",
        },
      ],
      groupPointsInsideMean: true,
      sideActivitiesFlat: true,
    };
    const submissions: SubmissionRecord[] = [
      {
        submissionId: "john-ac",
        participantId: "john",
        contestProblemId: "A-E1",
        submittedAt: at(10),
        effectiveAt: at(10),
        verdict: "AC",
        score: 100,
      },
      {
        submissionId: "mark-ac",
        participantId: "mark",
        contestProblemId: "A-E1",
        submittedAt: at(20),
        effectiveAt: at(20),
        verdict: "AC",
        score: 100,
      },
    ];

    const standings = computeTeamStandings(config, teams, participants, submissions, [], []);
    const alpha = standings.find((team) => team.teamId === "alpha");
    const beta = standings.find((team) => team.teamId === "beta");

    // Each team is credited in full: an individual problem shared across teams is not a group
    // problem, so one team scoring it must not consume it for the other.
    expect(alpha?.scoreHundredths).toBe(10000);
    expect(beta?.scoreHundredths).toBe(10000);
    expect(alpha?.players[0]?.problems.map((p) => p.contestProblemId)).toContain("A-E1");
    expect(beta?.players[0]?.problems.map((p) => p.contestProblemId)).toContain("A-E1");
  });

  it("holds in the golden contest: Panthers' and Cubs' set-A holders scored the same rows", () => {
    // pan-1 (Panthers) and cub-1 (Cubs) both hold set A, and the fixture models set A as ONE
    // group of contest-level rows. Both breakdowns therefore cite the same contestProblemId.
    const input = loadGoldenTeamContest();
    const standings = computeTeamStandings(
      input.config,
      input.teams,
      input.participants,
      input.submissions,
      input.hintGrants,
      input.sideActivities,
    );

    const panthers = standings.find((team) => team.teamId === "panthers");
    const cubs = standings.find((team) => team.teamId === "cubs");
    const ada = panthers?.players.find((player) => player.participantId === "pan-1");
    const esi = cubs?.players.find((player) => player.participantId === "cub-1");

    expect(ada?.chosenSetId).toBe("A");
    expect(esi?.chosenSetId).toBe("A");
    const adaScored = ada?.problems.filter((p) => p.score > 0).map((p) => p.contestProblemId);
    const esiScored = esi?.problems.filter((p) => p.score > 0).map((p) => p.contestProblemId);
    expect(adaScored).toContain("A-E");
    expect(esiScored).toContain("A-E");
    // And there is exactly one A-E in the contest: the row is shared, not copied per team.
    expect(
      input.config.problems.filter((problem) => problem.contestProblemId === "A-E"),
    ).toHaveLength(1);
  });
});

describe("a member with no set assignment", () => {
  it("still counts in the divisor", () => {
    // The divisor is the team's ACTUAL roster size, derived from membership alone. A student who
    // joined the team but was never dealt a set (assignment not run yet, or a late join that was
    // refused a set) dilutes the mean exactly like any other member; dropping them would inflate
    // the team's score.
    const input = loadGoldenTeamContest();
    const late: ParticipantRecord = {
      participantId: "pan-5",
      displayName: "Eve",
      divisionId: null,
      teamId: "panthers",
      chosenSetId: null,
    };

    const standings = computeTeamStandings(
      input.config,
      input.teams,
      [...input.participants, late],
      input.submissions,
      input.hintGrants,
      input.sideActivities,
    );
    const panthers = standings.find((team) => team.teamId === "panthers");

    // Pool is unchanged at 1575 (Eve scored nothing); the divisor moves from 4 to 5:
    // 157500 / 5 = 31500, + 15000 flat side activities = 46500 hundredths.
    expect(panthers?.teamSize).toBe(5);
    expect(panthers?.scoreHundredths).toBe(46500);
    expect(panthers?.score).toBe(465);

    // And the member is on the board, not silently absent: a row with no set and no points.
    const eve = panthers?.players.find((player) => player.participantId === "pan-5");
    expect(eve).toBeDefined();
    expect(eve?.chosenSetId).toBeNull();
    expect(eve?.score).toBe(0);
  });
});
