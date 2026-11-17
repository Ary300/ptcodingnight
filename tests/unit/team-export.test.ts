import { describe, expect, it } from "vitest";

import {
  TEAM_EXPORT_HEADERS,
  teamSafeFilename,
  teamStandingsToGrid,
} from "@/components/admin/export";
import type { TeamPlayerRow, TeamStandingRow, TeamStandingsResponse } from "@/lib/schemas/api";

/**
 * The awards export. It ranked across both divisions with no Division column, so an Advanced
 * winner read as 4th. It now carries Division, a per-division Rank by the podium's rule, the last
 * time a member scored in Indiana time, and an Indiana-time stamp in the filename.
 */

function player(name: string, lastScoreIncreaseAt: string | null): TeamPlayerRow {
  return {
    participantId: `p-${name}`,
    displayName: name,
    score: 100,
    penaltyMinutes: 0,
    chosenSetLabel: null,
    solvedCount: 1,
    lastScoreIncreaseAt,
    problems: null,
  };
}

function team(
  teamId: string,
  divisionId: string | null,
  rank: number,
  scoreHundredths: number,
  players: TeamPlayerRow[] = [],
): TeamStandingRow {
  return {
    teamId,
    name: teamId,
    divisionId,
    rank,
    isTied: false,
    score: scoreHundredths / 100,
    scoreHundredths,
    teamSize: 4,
    playerPoolPoints: 0,
    groupPoints: 0,
    sideActivityPoints: 0,
    penaltyMinutes: 0,
    players,
  };
}

function board(teams: TeamStandingRow[], divisions = DIVISIONS): TeamStandingsResponse {
  return {
    contestId: "c1",
    frozen: false,
    asOf: "2026-11-19T00:41:09.000Z",
    endsAt: "2026-11-19T01:15:00.000Z",
    isPractice: false,
    divisions,
    setLabels: [],
    sets: [],
    groupPointsInsideMean: true,
    sideActivitiesFlat: true,
    teams,
  };
}

const DIVISIONS = [
  { divisionId: "int", name: "Intermediate" },
  { divisionId: "adv", name: "Advanced" },
];

const column = (name: (typeof TEAM_EXPORT_HEADERS)[number]): number =>
  TEAM_EXPORT_HEADERS.indexOf(name);

describe("teamStandingsToGrid", () => {
  it("ranks each division from 1 and names the division on every row", () => {
    const grid = teamStandingsToGrid(
      board([
        team("five-alarm", "int", 1, 17560),
        team("byte-pair", "int", 2, 5333),
        team("triple-loop", "int", 3, 5000),
        team("big-o", "adv", 4, 2500),
        team("heap-sort", "adv", 5, 1000),
      ]),
    );

    expect(grid[0]?.slice(0, 2)).toEqual(["Division", "Rank"]);
    const body = grid.slice(1).map((row) => [row[column("Division")], row[column("Rank")], row[column("Team")]]);
    expect(body).toEqual([
      ["Intermediate", 1, "five-alarm"],
      ["Intermediate", 2, "byte-pair"],
      ["Intermediate", 3, "triple-loop"],
      ["Advanced", 1, "big-o"],
      ["Advanced", 2, "heap-sort"],
    ]);
  });

  it("keeps a tie as a tie inside its division", () => {
    const grid = teamStandingsToGrid(
      board([
        team("five-alarm", "int", 1, 9000),
        team("big-o", "adv", 2, 2500),
        team("heap-sort", "adv", 2, 2500),
      ]),
    );
    const advanced = grid.slice(1).filter((row) => row[column("Division")] === "Advanced");
    expect(advanced.map((row) => [row[column("Rank")], row[column("Tied")]])).toEqual([
      [1, "yes"],
      [1, "yes"],
    ]);
  });

  it("stamps the last time any member scored, in Indiana time with seconds", () => {
    const grid = teamStandingsToGrid(
      board([
        team("five-alarm", "int", 1, 9000, [
          player("Ada", "2026-11-19T00:12:00.000Z"),
          player("Grace", "2026-11-19T00:41:09.000Z"),
          player("Hopper", null),
        ]),
        team("idle", "int", 2, 0, [player("Nomad", null)]),
      ]),
    );
    const [, scored, idle] = grid;
    expect(scored?.[column("Last scored at")]).toBe("2026-11-18 7:41:09 PM ET");
    expect(idle?.[column("Last scored at")]).toBe("");
  });

  it("keeps the contest rank and an empty division for a contest with no divisions", () => {
    const grid = teamStandingsToGrid(
      board([team("solo", null, 1, 100), team("duo", null, 2, 50)], []),
    );
    expect(grid.slice(1).map((row) => [row[column("Division")], row[column("Rank")]])).toEqual([
      ["", 1],
      ["", 2],
    ]);
  });
});

describe("teamSafeFilename", () => {
  it("stamps the file in Indiana time, so an evening export is dated the evening it was made", () => {
    // 7:41:09 PM on the 18th in Indianapolis is 00:41:09 on the 19th in UTC.
    expect(teamSafeFilename("Coding Night 2026!", "csv", "2026-11-19T00:41:09.000Z")).toBe(
      "coding-night-2026-team-results-2026-11-18_19-41-09.csv",
    );
  });
});
