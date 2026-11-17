import { describe, expect, it } from "vitest";

import { FROZEN_AND_CLOSED_HINT, contestStateHint, isWindowClosed } from "@/components/admin/StatusPill";
import { endedBoardLine } from "@/components/contest/lobby/ContestEndedPanel";
import { playerProgress, setLetterFor } from "@/components/contest/lobby/my-team-progress";
import {
  BOARD_FROZEN_EXPLANATION,
  boardFrozenTitle,
  submissionsClosedAt,
} from "@/lib/contest/board-freeze-copy";
import { standingsForViewer } from "@/lib/contest/standings-visibility";
import type { StandingsResponse, TeamPlayerProblem, TeamPlayerRow } from "@/lib/schemas/api";

/**
 * The organizers' 2026-11-17 decisions: individual scores only inside the student's own team, and
 * a freeze nobody can miss. These are the pure parts; the screens are in
 * tests/e2e/student-boards.spec.ts.
 */

// 8:00 PM in Indianapolis on the night (EST, UTC-5).
const EIGHT_PM = "2026-11-19T01:00:00.000Z";

describe("the freeze, in words", () => {
  it("names the freeze instant in Indiana time", () => {
    expect(boardFrozenTitle(EIGHT_PM)).toBe("Board frozen at 8:00 PM");
  });

  it("falls back to the bare phrase on an unreadable instant", () => {
    expect(boardFrozenTitle("not a date")).toBe("Board frozen");
    expect(boardFrozenTitle(new Date(Number.NaN))).toBe("Board frozen");
  });

  it("says the sentence the organizers wrote, with no em dash or middle dot", () => {
    expect(BOARD_FROZEN_EXPLANATION).toBe(
      "Rankings stopped updating so the final result is a surprise. Points scored after this are still counted and appear when the organizers reveal the final standings.",
    );
    expect(BOARD_FROZEN_EXPLANATION).not.toMatch(/[—·]/);
  });

  it("reads submissions as closed once the window has passed, and never in the practice arena", () => {
    const board = { endsAt: EIGHT_PM, isPractice: false };
    expect(submissionsClosedAt(board, Date.parse(EIGHT_PM) - 1)).toBe(false);
    expect(submissionsClosedAt(board, Date.parse(EIGHT_PM))).toBe(true);
    expect(submissionsClosedAt({ ...board, isPractice: true }, Date.parse(EIGHT_PM) + 1)).toBe(false);
  });
});

describe("the ended lobby panel", () => {
  it("does not call a frozen board final", () => {
    const line = endedBoardLine(true, EIGHT_PM);
    expect(line).toBe(
      "The board froze at 8:00 PM and stays frozen until the organizers reveal the final standings.",
    );
  });

  it("calls the standings final only after the reveal", () => {
    expect(endedBoardLine(false, null)).toBe("These are the final standings.");
  });
});

describe("the organizer status pill", () => {
  it("says submissions are closed when FROZEN outlives the window", () => {
    expect(contestStateHint("FROZEN", true)).toBe(FROZEN_AND_CLOSED_HINT);
    expect(FROZEN_AND_CLOSED_HINT).toBe(
      "Submissions closed. The public board is frozen until you press Unfreeze and reveal.",
    );
  });

  it("keeps the live wording while the window is open", () => {
    expect(contestStateHint("FROZEN", false)).toBe("Live, and the public board has stopped updating.");
    expect(contestStateHint("RUNNING", true)).toBe("Live. Students are submitting now.");
  });

  it("decides the window from endsAt", () => {
    const now = new Date(EIGHT_PM);
    expect(isWindowClosed(EIGHT_PM, now)).toBe(true);
    expect(isWindowClosed(new Date(now.getTime() + 1), now)).toBe(false);
    expect(isWindowClosed("garbage", now)).toBe(false);
  });
});

describe("the individual board for a student", () => {
  const board: StandingsResponse = {
    contestId: "c1",
    frozen: false,
    asOf: EIGHT_PM,
    endsAt: EIGHT_PM,
    divisions: [
      {
        divisionId: "int",
        name: "Intermediate",
        rows: [
          { rank: 1, isTied: false, participantId: "p1", displayName: "Rival", score: 300, penaltyMinutes: 4, delta: 0 },
        ],
      },
    ],
  };

  it("withholds every row from a signed-in competitor but keeps the clock fields", () => {
    const seen = standingsForViewer(board, {
      kind: "competitor",
      participantId: "p2",
      contestId: "c1",
      displayName: "Me",
      sessionId: "s",
      userId: null,
    });
    expect(seen.divisions.flatMap((division) => division.rows)).toEqual([]);
    expect(seen.endsAt).toBe(board.endsAt);
    expect(seen.divisions.map((division) => division.name)).toEqual(["Intermediate"]);
    // The memoised original is untouched: other callers share it.
    expect(board.divisions[0]?.rows).toHaveLength(1);
  });

  it("leaves the projector and organizers their board", () => {
    expect(standingsForViewer(board, { kind: "anonymous" })).toBe(board);
    expect(
      standingsForViewer(board, { kind: "admin", displayName: "Org", sessionId: "s", userId: "u" }),
    ).toBe(board);
  });
});

function problem(slotLabel: string, score: number, rejectedCount: number, isGroupProblem = false): TeamPlayerProblem {
  return {
    contestProblemId: `cp-${slotLabel}`,
    slotLabel,
    title: slotLabel,
    basePoints: 100,
    score,
    rejectedCount,
    penaltyMinutes: 0,
    hintsTaken: 0,
    hintDeduction: 0,
    firstScoredAt: null,
    isGroupProblem,
  };
}

function teammate(problems: TeamPlayerProblem[] | null): TeamPlayerRow {
  return {
    participantId: "p1",
    displayName: "Ada",
    score: 0,
    penaltyMinutes: 0,
    chosenSetLabel: "Intermediate A",
    solvedCount: 2,
    lastScoreIncreaseAt: null,
    problems,
  };
}

describe("a teammate's progress on the lobby card", () => {
  it("lists solved and attempted individual problems in slot order", () => {
    const progress = playerProgress(
      teammate([problem("A-M1", 0, 2), problem("A-E1", 100, 1), problem("A-M2", 0, 0), problem("Group 1", 200, 0, true)]),
    );
    expect(progress.problems.map((p) => [p.slotLabel, p.status])).toEqual([
      ["A-E1", "solved"],
      ["A-M1", "attempted"],
    ]);
    expect(progress.summary).toBe("1 solved, 1 attempted");
  });

  it("says so when nothing has been submitted", () => {
    expect(playerProgress(teammate([])).summary).toBe("No submissions yet");
  });

  it("falls back to the solved count when the breakdown is not readable", () => {
    expect(playerProgress(teammate(null))).toEqual({ problems: [], summary: "2 solved" });
  });

  it("shows the set letter, not the qualified label", () => {
    const sets = [{ label: "A", qualifiedLabel: "Intermediate A", divisionId: "int" }];
    expect(setLetterFor("Intermediate A", sets)).toBe("A");
    expect(setLetterFor("Unknown B", sets)).toBe("Unknown B");
    expect(setLetterFor(null, sets)).toBeNull();
  });
});
