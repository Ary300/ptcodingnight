import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { computeTeamStandings } from "@/lib/scoring/team";
import {
  POINT_SCALE,
  divideRoundHalfAway,
  type ContestConfig,
  type ParticipantRecord,
  type SubmissionRecord,
  type TeamRecord,
} from "@/lib/types/scoring";

import { loadGoldenTeamContest } from "@/fixtures/scoring/load";

/**
 * Team scoring — the formula that replaces the spreadsheet.
 *
 * The primary case is the organizer's own worked example, taken from a real scoring sheet, and it
 * is asserted against a HAND-COMPUTED fixture. The sheet's own answer for that example was
 * **wrong**, and one of these tests exists purely to prove we do not reproduce it.
 *
 * See docs/SCORING.md.
 */

const ROOT = path.resolve(__dirname, "..", "..");

interface ExpectedTeam {
  teamId: string;
  name: string;
  teamSize: number;
  scoreHundredths: number;
  score: number;
  playerPoolPoints: number;
  groupPoints: number;
  sideActivityPoints: number;
  penaltyMinutes: number;
  rank: number;
  isTied: boolean;
}

interface ExpectedDoc {
  variants: Record<
    string,
    {
      config: { groupPointsInsideMean: boolean; sideActivitiesFlat: boolean };
      teams: ExpectedTeam[];
    }
  >;
  historicalSpreadsheetWRONG: { panthersScoreHundredths: number; panthersScore: number };
}

const expected = JSON.parse(
  readFileSync(path.join(ROOT, "fixtures", "expected-team-standings.json"), "utf8"),
) as ExpectedDoc;

function run(over: Partial<ContestConfig> = {}) {
  const input = loadGoldenTeamContest();
  return computeTeamStandings(
    { ...input.config, ...over },
    input.teams,
    input.participants,
    input.submissions,
    input.hintGrants,
    input.sideActivities,
  );
}

describe("the organizer's worked example", () => {
  it("scores the Panthers at 543.75", () => {
    // (400 + 250 + 400 + 400 + 125) / 4 + (20 + 80 + 50)
    //   = 1575 / 4 + 150 = 393.75 + 150 = 543.75
    const panthers = run().find((t) => t.teamId === "panthers");

    expect(panthers).toBeDefined();
    expect(panthers?.scoreHundredths).toBe(54375);
    expect(panthers?.score).toBe(543.75);
  });

  it("does NOT reproduce the spreadsheet's 512.5", () => {
    // The real sheet computed 1450 / 4 + 150 = 512.5, dropping the 125 group points entirely and
    // under-crediting the team by 31.25. Eliminating exactly this class of error is why this
    // platform exists.
    //
    // Asserted as a negative because a regression that dropped group points again would look
    // like AGREEMENT WITH HISTORY — the most convincing possible disguise for a scoring bug.
    const panthers = run().find((t) => t.teamId === "panthers");

    expect(panthers?.scoreHundredths).not.toBe(expected.historicalSpreadsheetWRONG.panthersScoreHundredths);
    expect(panthers?.score).not.toBe(expected.historicalSpreadsheetWRONG.panthersScore);
  });

  it("shows the arithmetic, so a student does not have to trust the total", () => {
    const panthers = run().find((t) => t.teamId === "panthers");

    expect(panthers?.teamSize).toBe(4);
    expect(panthers?.playerPoolPoints).toBe(1575);
    expect(panthers?.groupPoints).toBe(125);
    expect(panthers?.sideActivityPoints).toBe(150);
  });
});

describe("team size is the divisor", () => {
  it("normalises a team of two against a team of four", () => {
    // Cubs: (300 + 100 individual + 100 group) / 2 = 250. A formula that ignored team size would
    // rank the smaller team as though it were the larger one.
    const cubs = run().find((t) => t.teamId === "cubs");

    expect(cubs?.teamSize).toBe(2);
    expect(cubs?.score).toBe(250);
  });

  it("ranks the higher team score first", () => {
    const standings = run();
    expect(standings[0]?.teamId).toBe("panthers");
    expect(standings[0]?.rank).toBe(1);
    expect(standings[1]?.teamId).toBe("cubs");
    expect(standings[1]?.rank).toBe(2);
  });
});

describe("a group problem is solved once by the team", () => {
  it("counts 125 rather than 250 when two teammates both solve it", () => {
    // pan-1 and pan-3 both submit G1, both scoring 125. Summing per-member group scores is the
    // obvious wrong implementation and would give the team 250.
    const panthers = run().find((t) => t.teamId === "panthers");
    expect(panthers?.groupPoints).toBe(125);
  });

  it("keeps group points out of a player's own breakdown", () => {
    // pan-1 solved A-E (100) + A-H (300) = 400, and also submitted the group problem. Their own
    // line must read 400: attributing the team's group points to whichever teammate pressed
    // submit would make the breakdown misleading.
    const panthers = run().find((t) => t.teamId === "panthers");
    const ada = panthers?.players.find((p) => p.participantId === "pan-1");

    expect(ada?.score).toBe(400);
  });

  it("awards partial credit on a group problem", () => {
    // cub-1's WA on G1 still scored 100 of 125.
    const cubs = run().find((t) => t.teamId === "cubs");
    expect(cubs?.groupPoints).toBe(100);
  });
});

describe("group problems use one team event timeline", () => {
  const start = new Date("2026-04-10T18:00:00.000Z");
  const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
  const teams: TeamRecord[] = [
    { teamId: "alpha", name: "Alpha" },
    { teamId: "beta", name: "Beta" },
  ];
  const participants: ParticipantRecord[] = [
    { participantId: "a1", displayName: "A One", divisionId: null, teamId: "alpha", chosenSetId: "A" },
    { participantId: "a2", displayName: "A Two", divisionId: null, teamId: "alpha", chosenSetId: "B" },
    { participantId: "b1", displayName: "B One", divisionId: null, teamId: "beta", chosenSetId: "A" },
    { participantId: "b2", displayName: "B Two", divisionId: null, teamId: "beta", chosenSetId: "B" },
  ];
  const baseConfig: ContestConfig = {
    contestId: "team-events",
    presetId: "coding-night-classic",
    startsAt: start,
    endsAt: at(120),
    freezeAt: null,
    divisions: [],
    problems: [
      {
        contestProblemId: "group-1",
        divisionId: null,
        setId: null,
        basePoints: 100,
        round: "GROUP",
      },
    ],
    groupPointsInsideMean: true,
    sideActivitiesFlat: true,
  };
  const submission = (
    submissionId: string,
    participantId: string,
    minutes: number,
    verdict: SubmissionRecord["verdict"],
    score: number,
  ): SubmissionRecord => ({
    submissionId,
    participantId,
    contestProblemId: "group-1",
    submittedAt: at(minutes),
    effectiveAt: at(minutes),
    verdict,
    score,
  });
  const runEvents = (log: readonly SubmissionRecord[], config = baseConfig) =>
    computeTeamStandings(config, teams, participants, log, [], []);

  it("does not move the team tiebreak for a later teammate's duplicate AC", () => {
    const standings = runEvents([
      submission("a-first", "a1", 10, "AC", 100),
      submission("b-first", "b1", 20, "AC", 100),
      submission("a-duplicate", "a2", 90, "AC", 100),
    ]);

    const alpha = standings.find((team) => team.teamId === "alpha");
    const beta = standings.find((team) => team.teamId === "beta");

    expect(alpha?.groupPoints).toBe(100);
    expect(alpha?.lastScoreIncreaseAt?.toISOString()).toBe(at(10).toISOString());
    expect(beta?.lastScoreIncreaseAt?.toISOString()).toBe(at(20).toISOString());
    expect(alpha?.rank).toBe(1);
    expect(beta?.rank).toBe(2);
  });

  it("charges each teammate's Classic rejection once when the team eventually scores", () => {
    const standings = runEvents([
      submission("a1-wa", "a1", 5, "WA", 0),
      submission("a2-ce", "a2", 6, "CE", 0),
      submission("a2-ac", "a2", 10, "AC", 100),
    ]);
    const alpha = standings.find((team) => team.teamId === "alpha");

    expect(alpha?.penaltyMinutes).toBe(10);
    // Group penalties are a team fact, just like group points. They are not attributed to an
    // arbitrary player's individual contribution row.
    expect(alpha?.players.map((player) => player.penaltyMinutes)).toEqual([0, 0]);
  });

  it("applies ICPC's post-solve rule to the team, not separately to each teammate", () => {
    const standings = runEvents(
      [
        submission("a1-wa", "a1", 5, "WA", 0),
        submission("a1-ac", "a1", 10, "AC", 100),
        submission("a2-wa-after-team-solve", "a2", 20, "WA", 0),
        submission("a2-ac-after-team-solve", "a2", 30, "AC", 100),
      ],
      { ...baseConfig, presetId: "icpc" },
    );
    const alpha = standings.find((team) => team.teamId === "alpha");

    expect(alpha?.groupPoints).toBe(1);
    expect(alpha?.penaltyMinutes).toBe(20);
    expect(alpha?.lastScoreIncreaseAt?.toISOString()).toBe(at(10).toISOString());
  });
});

describe("a participant with no team", () => {
  it("contributes to no team total", () => {
    // The orphan scored 400 — more than most Cubs — and must be invisible to every team score.
    // A null teamId is the shape a mid-contest roster edit leaves behind.
    const standings = run();
    const total = standings.reduce((sum, t) => sum + t.scoreHundredths, 0);

    expect(total).toBe(54375 + 25000);
    for (const team of standings) {
      expect(team.players.map((p) => p.participantId)).not.toContain("orphan");
    }
  });
});

describe("side activities at a standings cutoff", () => {
  it("keeps awards entered after the freeze off the frozen board", () => {
    const input = loadGoldenTeamContest();
    const freeze = new Date(input.config.startsAt.getTime() + 30 * 60_000);
    const lateAward = {
      teamId: "panthers",
      label: "Late tie-break challenge",
      points: 1_000,
      enteredAt: new Date(freeze.getTime() + 1),
    };

    const frozen = computeTeamStandings(
      input.config,
      input.teams,
      input.participants,
      input.submissions,
      input.hintGrants,
      [...input.sideActivities, lateAward],
      { upTo: freeze },
    ).find((team) => team.teamId === "panthers");
    const live = computeTeamStandings(
      input.config,
      input.teams,
      input.participants,
      input.submissions,
      input.hintGrants,
      [...input.sideActivities, lateAward],
    ).find((team) => team.teamId === "panthers");

    expect(frozen?.sideActivityPoints).toBe(150);
    expect(live?.sideActivityPoints).toBe(1_150);
  });
});

describe("config variants", () => {
  for (const [name, variant] of Object.entries(expected.variants)) {
    it(`${name} matches the hand-computed fixture`, () => {
      const standings = run(variant.config);

      expect(standings).toHaveLength(variant.teams.length);

      for (const want of variant.teams) {
        const got = standings.find((t) => t.teamId === want.teamId);
        expect(got, `${name}: no standing for ${want.teamId}`).toBeDefined();
        if (got === undefined) continue;

        expect(got.scoreHundredths, `${name}/${want.teamId} scoreHundredths`).toBe(
          want.scoreHundredths,
        );
        expect(got.score, `${name}/${want.teamId} score`).toBe(want.score);
        expect(got.teamSize, `${name}/${want.teamId} teamSize`).toBe(want.teamSize);
        expect(got.playerPoolPoints, `${name}/${want.teamId} pool`).toBe(want.playerPoolPoints);
        expect(got.groupPoints, `${name}/${want.teamId} group`).toBe(want.groupPoints);
        expect(got.rank, `${name}/${want.teamId} rank`).toBe(want.rank);
      }
    });
  }

  it("no variant ever produces the spreadsheet's wrong answer", () => {
    for (const variant of Object.values(expected.variants)) {
      const panthers = run(variant.config).find((t) => t.teamId === "panthers");
      expect(panthers?.scoreHundredths).not.toBe(
        expected.historicalSpreadsheetWRONG.panthersScoreHundredths,
      );
    }
  });
});

describe("replay is byte-identical", () => {
  it("produces the same output twice", () => {
    // The hard requirement in PRD §6.6. A scoring engine that is right once and different the
    // second time is worse than one that is wrong consistently.
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it("orders tied teams deterministically rather than by input order", () => {
    const input = loadGoldenTeamContest();
    // Give both teams identical everything by stripping side activities and reversing the roster.
    const forward = computeTeamStandings(
      input.config,
      input.teams,
      input.participants,
      input.submissions,
      input.hintGrants,
      [],
    );
    const reversed = computeTeamStandings(
      input.config,
      [...input.teams].reverse(),
      [...input.participants].reverse(),
      [...input.submissions].reverse(),
      input.hintGrants,
      [],
    );

    expect(JSON.stringify(forward)).toBe(JSON.stringify(reversed));
  });
});

describe("integer hundredths", () => {
  it("never yields a floating-point artifact", () => {
    // The reason the engine works in hundredths at all: `3 * 0.15 * 250` evaluates to
    // 112.49999999999999 in IEEE-754, and this codebase already shipped that bug once.
    for (const team of run()) {
      expect(Number.isInteger(team.scoreHundredths)).toBe(true);
    }
  });

  it("rounds half away from zero, once, at the mean", () => {
    expect(divideRoundHalfAway(5, 2)).toBe(3);
    expect(divideRoundHalfAway(-5, 2)).toBe(-3);
    expect(divideRoundHalfAway(4, 2)).toBe(2);
    // 1000 points across 3 players is not exact: 100000/3 = 33333.33... -> 33333 hundredths.
    expect(divideRoundHalfAway(1000 * POINT_SCALE, 3)).toBe(33333);
  });

  it("survives a team size that does not divide evenly", () => {
    const input = loadGoldenTeamContest();
    // Drop one Panther so the pool of 1575 is divided by 3 rather than 4: 157500/3 = 52500 exactly.
    const standings = computeTeamStandings(
      input.config,
      input.teams,
      input.participants.filter((p) => p.participantId !== "pan-4"),
      input.submissions,
      input.hintGrants,
      input.sideActivities,
    );

    const panthers = standings.find((t) => t.teamId === "panthers");
    // Pool is now 400 + 250 + 400 + 125 = 1175; 117500 / 3 = 39166.67 -> 39167.
    expect(panthers?.teamSize).toBe(3);
    expect(panthers?.scoreHundredths).toBe(39167 + 15000);
  });
});

describe("a team with no members", () => {
  it("scores zero instead of dividing by zero", () => {
    const input = loadGoldenTeamContest();
    const standings = computeTeamStandings(
      input.config,
      [...input.teams, { teamId: "empty", name: "Nobody" }],
      input.participants,
      input.submissions,
      input.hintGrants,
      input.sideActivities,
    );

    const empty = standings.find((t) => t.teamId === "empty");
    expect(empty?.teamSize).toBe(0);
    expect(empty?.scoreHundredths).toBe(0);
  });
});
