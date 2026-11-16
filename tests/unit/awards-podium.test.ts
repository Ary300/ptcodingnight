import { describe, expect, it } from "vitest";

import { podiumsFor } from "@/components/leaderboard/team-tabs";
import type { TeamStandingRow } from "@/lib/schemas/api";

/**
 * The awards screen's podium. It filtered the contest-wide rank to 1 to 3, so on a night with two
 * divisions it showed three Intermediate teams and left the Advanced winner off entirely.
 * Measured on the walkthrough: Five Alarm, Byte Pair, Triple Loop on the podium, Big O nowhere.
 */

function row(
  teamId: string,
  divisionId: string | null,
  rank: number,
  scoreHundredths: number,
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
    players: [],
  };
}

const divisions = [
  { divisionId: "int", name: "Intermediate" },
  { divisionId: "adv", name: "Advanced" },
];

// Contest-wide ranks, as the payload carries them: Intermediate holds the top three.
const teams = [
  row("five-alarm", "int", 1, 17560),
  row("byte-pair", "int", 2, 5333),
  row("triple-loop", "int", 3, 5000),
  row("quad-core", "int", 4, 2500),
  row("big-o", "adv", 5, 2500),
  row("heap-sort", "adv", 6, 1000),
  row("two-phase", "adv", 7, 0),
  row("three-body", "adv", 8, -500),
];

describe("podiumsFor", () => {
  it("gives every division its own podium, ranked from 1 within the division", () => {
    const podiums = podiumsFor(divisions, teams);
    expect(podiums.map((podium) => podium.label)).toEqual(["Intermediate", "Advanced"]);

    const [intermediate, advanced] = podiums;
    expect(intermediate?.teams.map((team) => [team.teamId, team.rank])).toEqual([
      ["five-alarm", 1],
      ["byte-pair", 2],
      ["triple-loop", 3],
    ]);
    expect(advanced?.teams.map((team) => [team.teamId, team.rank])).toEqual([
      ["big-o", 1],
      ["heap-sort", 2],
      ["two-phase", 3],
    ]);
  });

  it("keeps a single podium for a contest with no divisions", () => {
    const open = teams.map((team) => ({ ...team, divisionId: null }));
    const podiums = podiumsFor([], open);
    expect(podiums).toHaveLength(1);
    expect(podiums[0]?.label).toBeNull();
    expect(podiums[0]?.teams.map((team) => team.teamId)).toEqual([
      "five-alarm",
      "byte-pair",
      "triple-loop",
    ]);
  });
});
