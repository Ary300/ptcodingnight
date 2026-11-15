import { describe, expect, it } from "vitest";

import type { ContestState, ProblemState } from "@prisma/client";

import { DomainError, DraftProblemError, ForbiddenError } from "@/lib/errors";
import {
  assertCanMutateStandingsInputs,
  assertCanJoin,
  assertCanReadProblems,
  assertCanSubmit,
  assertProblemIsLive,
  assertUnlocked,
  effectiveUnlockAt,
  isPublicBoardFrozen,
  clockShouldEnd,
  isUnlocked,
  assertCanListProblems,
  standingsCutoff,
  type ContestGateInput,
} from "@/lib/contest/gate";

const STARTS = new Date("2026-07-29T18:00:00.000Z");
const FREEZE = new Date("2026-07-29T19:30:00.000Z");
const ENDS = new Date("2026-07-29T20:00:00.000Z");

function contest(overrides: Partial<ContestGateInput> = {}): ContestGateInput {
  return { state: "RUNNING", startsAt: STARTS, endsAt: ENDS, freezeAt: null, ...overrides };
}

describe("assertCanJoin", () => {
  it.each<ContestState>(["SCHEDULED", "RUNNING", "FROZEN"])("allows %s", (state) => {
    expect(() => assertCanJoin(state)).not.toThrow();
  });

  it.each<ContestState>(["DRAFT", "ENDED", "ARCHIVED"])("refuses %s", (state) => {
    expect(() => assertCanJoin(state)).toThrow(DomainError);
  });
});

describe("assertCanReadProblems", () => {
  it.each<ContestState>(["RUNNING", "FROZEN", "ENDED"])("allows %s", (state) => {
    expect(() => assertCanReadProblems(contest({ state }), STARTS)).not.toThrow();
  });

  it("refuses a contest that has not started, so problems cannot be read early", () => {
    expect(() => assertCanReadProblems(contest({ state: "SCHEDULED" }), STARTS)).toThrow(
      DomainError,
    );
  });

  it.each<ContestState>(["RUNNING", "FROZEN", "ENDED"])(
    "refuses future %s rows even when their state says statements are readable",
    (state) => {
      expect(() =>
        assertCanReadProblems(contest({ state }), new Date(STARTS.getTime() - 1)),
      ).toThrow(/not started/i);
    },
  );

  it("opens at the exact start instant", () => {
    expect(() => assertCanReadProblems(contest(), STARTS)).not.toThrow();
  });
});

describe("assertCanSubmit", () => {
  it("accepts a submission inside the window", () => {
    expect(() => assertCanSubmit(contest(), new Date("2026-07-29T19:00:00.000Z"))).not.toThrow();
  });

  it("still accepts submissions during a freeze — judging never stops", () => {
    expect(() =>
      assertCanSubmit(contest({ state: "FROZEN", freezeAt: FREEZE }), new Date("2026-07-29T19:45:00.000Z")),
    ).not.toThrow();
  });

  it("refuses before the start and after the end", () => {
    expect(() => assertCanSubmit(contest(), new Date("2026-07-29T17:59:59.000Z"))).toThrow(
      DomainError,
    );
    expect(() => assertCanSubmit(contest(), new Date("2026-07-29T20:00:01.000Z"))).toThrow(
      DomainError,
    );
  });

  it("refuses past the end even if the state was never advanced", () => {
    // A contest left in RUNNING overnight must not accept work; the clock is the authority.
    expect(() => assertCanSubmit(contest(), new Date("2026-07-30T09:00:00.000Z"))).toThrow(
      DomainError,
    );
  });

  it.each<ContestState>(["DRAFT", "SCHEDULED", "ENDED", "ARCHIVED"])("refuses in %s", (state) => {
    expect(() => assertCanSubmit(contest({ state }), new Date("2026-07-29T19:00:00.000Z"))).toThrow(
      DomainError,
    );
  });

  it("accepts at the end instant to the millisecond and refuses one millisecond after", () => {
    expect(() => assertCanSubmit(contest(), new Date(ENDS.getTime() - 100))).not.toThrow();
    expect(() => assertCanSubmit(contest(), ENDS)).not.toThrow();
    expect(() => assertCanSubmit(contest(), new Date(ENDS.getTime() + 100))).toThrow(
      "This contest is over",
    );
  });

  /*
    Coding Night's own shape: the scheduled freeze fired at 8:00, so `clockShouldEnd` leaves the
    contest RUNNING past 8:15 for the organizer's reveal. The window check must refuse on its own,
    with the message a student can act on, whatever the state column says.
  */
  it("refuses after the end while a scheduled freeze keeps the contest RUNNING", () => {
    const night = contest({ state: "RUNNING", freezeAt: FREEZE });
    const afterEnd = new Date(ENDS.getTime() + 100);

    expect(clockShouldEnd(night, afterEnd), "the premise: the clock leaves it running").toBe(false);
    expect(() => assertCanSubmit(night, afterEnd)).toThrow("This contest is over");
    expect(() => assertCanSubmit(contest({ state: "FROZEN", freezeAt: FREEZE }), afterEnd)).toThrow(
      "This contest is over",
    );
  });
});

describe("the DRAFT gate", () => {
  it("refuses a DRAFT problem with the dedicated error", () => {
    expect(() => assertProblemIsLive("DRAFT", "bill-division")).toThrow(DraftProblemError);
  });

  it("refuses a RETIRED problem too", () => {
    expect(() => assertProblemIsLive("RETIRED", "bill-division")).toThrow(DomainError);
  });

  it("allows only PUBLISHED", () => {
    const states: ProblemState[] = ["DRAFT", "PUBLISHED", "RETIRED"];
    const allowed = states.filter((state) => {
      try {
        assertProblemIsLive(state, "x");
        return true;
      } catch {
        return false;
      }
    });
    expect(allowed).toEqual(["PUBLISHED"]);
  });
});

describe("unlocking", () => {
  it("treats a null unlock time as always open", () => {
    expect(isUnlocked(null, STARTS)).toBe(true);
  });

  it("opens at the unlock instant, not after it", () => {
    expect(isUnlocked(FREEZE, FREEZE)).toBe(true);
    expect(isUnlocked(FREEZE, new Date(FREEZE.getTime() - 1))).toBe(false);
  });

  it("throws for a locked problem", () => {
    expect(() => assertUnlocked(FREEZE, STARTS, "gaming-array")).toThrow(ForbiddenError);
  });
});

describe("effectiveUnlockAt", () => {
  /*
    The night opens with an individual stretch and the team questions follow. The contest column
    says how long that stretch is, in minutes after the start; every reader derives the GROUP rows'
    opening from it here, and nothing writes the derived instant into a row.
  */
  const THIRTY_IN = new Date(STARTS.getTime() + 30 * 60_000);
  const withClock = { startsAt: STARTS, groupUnlockMinutes: 30 };
  const noClock = { startsAt: STARTS, groupUnlockMinutes: null };

  it("opens a GROUP row at startsAt plus the contest's minutes", () => {
    expect(effectiveUnlockAt({ round: "GROUP", unlockAt: null }, withClock)).toEqual(THIRTY_IN);
  });

  it("leaves a GROUP row's own unlock alone when the contest has no group clock", () => {
    expect(effectiveUnlockAt({ round: "GROUP", unlockAt: FREEZE }, noClock)).toEqual(FREEZE);
    expect(effectiveUnlockAt({ round: "GROUP", unlockAt: null }, noClock)).toBeNull();
  });

  it("takes the LATER of the row's own unlock and the group clock", () => {
    // Row later than the clock: the row wins.
    expect(effectiveUnlockAt({ round: "GROUP", unlockAt: FREEZE }, withClock)).toEqual(FREEZE);
    // Row earlier than the clock: the clock wins. A per-row unlock cannot open a team question
    // before the individual stretch is over.
    const early = new Date(STARTS.getTime() + 5 * 60_000);
    expect(effectiveUnlockAt({ round: "GROUP", unlockAt: early }, withClock)).toEqual(THIRTY_IN);
  });

  it("never applies the group clock to an INDIVIDUAL row", () => {
    expect(effectiveUnlockAt({ round: "INDIVIDUAL", unlockAt: null }, withClock)).toBeNull();
    expect(effectiveUnlockAt({ round: "INDIVIDUAL", unlockAt: FREEZE }, withClock)).toEqual(FREEZE);
  });

  it("feeds isUnlocked, so a team question is shut during the stretch and open at the instant", () => {
    const opensAt = effectiveUnlockAt({ round: "GROUP", unlockAt: null }, withClock);
    expect(isUnlocked(opensAt, new Date(THIRTY_IN.getTime() - 1))).toBe(false);
    expect(isUnlocked(opensAt, THIRTY_IN)).toBe(true);
    expect(() => assertUnlocked(opensAt, STARTS, "e2e-group-problem")).toThrow(ForbiddenError);
  });

  it("is derived from the start, so a contest started early opens its team questions early", () => {
    const earlierStart = new Date(STARTS.getTime() - 10 * 60_000);
    const opensAt = effectiveUnlockAt(
      { round: "GROUP", unlockAt: null },
      { startsAt: earlierStart, groupUnlockMinutes: 30 },
    );
    expect(opensAt).toEqual(new Date(earlierStart.getTime() + 30 * 60_000));
  });
});

describe("isPublicBoardFrozen", () => {
  it("is frozen when an organizer pressed freeze", () => {
    expect(isPublicBoardFrozen(contest({ state: "FROZEN", freezeAt: FREEZE }), ENDS)).toBe(true);
  });

  it("freezes automatically once freezeAt passes", () => {
    const c = contest({ freezeAt: FREEZE });
    expect(isPublicBoardFrozen(c, new Date(FREEZE.getTime() - 1))).toBe(false);
    expect(isPublicBoardFrozen(c, FREEZE)).toBe(true);
  });

  it("is never frozen once the contest has ended — that is the reveal", () => {
    expect(isPublicBoardFrozen(contest({ state: "ENDED", freezeAt: FREEZE }), ENDS)).toBe(false);
    expect(isPublicBoardFrozen(contest({ state: "ARCHIVED", freezeAt: FREEZE }), ENDS)).toBe(false);
  });

  it("is not frozen with no freeze time configured", () => {
    expect(isPublicBoardFrozen(contest(), ENDS)).toBe(false);
  });
});

describe("assertCanMutateStandingsInputs", () => {
  it("refuses mutations after a scheduled freeze cutoff", () => {
    expect(() =>
      assertCanMutateStandingsInputs(contest({ freezeAt: FREEZE }), FREEZE),
    ).toThrow(/public board is frozen/i);
  });

  it("refuses mutations while manually frozen and allows them again after unfreeze", () => {
    expect(() =>
      assertCanMutateStandingsInputs(contest({ state: "FROZEN", freezeAt: FREEZE }), ENDS),
    ).toThrow(DomainError);
    expect(() => assertCanMutateStandingsInputs(contest(), ENDS)).not.toThrow();
  });

  it.each<ContestState>(["ENDED", "ARCHIVED"])(
    "keeps %s results immutable after the reveal",
    (state) => {
      expect(() => assertCanMutateStandingsInputs(contest({ state }), ENDS)).toThrow(
        /final standings/i,
      );
    },
  );
});

describe("standingsCutoff", () => {
  it("gives an organizer live truth even during a freeze", () => {
    expect(standingsCutoff(contest({ state: "FROZEN", freezeAt: FREEZE }), ENDS, true)).toBeNull();
  });

  it("gives the public board the freeze instant", () => {
    expect(standingsCutoff(contest({ freezeAt: FREEZE }), ENDS, false)).toEqual(FREEZE);
  });

  it("gives the public board everything when it is not frozen", () => {
    expect(standingsCutoff(contest(), ENDS, false)).toBeNull();
  });
});


describe("listing a contest's problems is looser than reading one", () => {
  /*
    The bug this pins, reported by the organizer with a screenshot: a student an organizer had just
    put on a team opened the lobby before the contest started and got a bare red line, "This contest
    has not started yet", with a Try again link and nothing else — while the standings panel beside
    it rendered their name perfectly well.

    One predicate served both the list and the statement, and it excluded SCHEDULED. Splitting them
    is what lets a pre-start lobby exist at all.
  */
  it("a SCHEDULED contest can be listed but its statements cannot be read", () => {
    expect(() => assertCanListProblems("SCHEDULED")).not.toThrow();
    expect(() => assertCanReadProblems(contest({ state: "SCHEDULED" }), STARTS)).toThrow();
  });

  it("a DRAFT contest is not listable either, and says why", () => {
    // DRAFT means an organizer has not published it. That is a different sentence from "not
    // started", and the student can do nothing about either — but only one of them is a mistake.
    expect(() => assertCanListProblems("DRAFT")).toThrow(/published/i);
  });

  it("everything from RUNNING onwards allows both", () => {
    for (const state of ["RUNNING", "FROZEN", "ENDED"] as const) {
      expect(() => assertCanListProblems(state), state).not.toThrow();
      expect(() => assertCanReadProblems(contest({ state }), STARTS), state).not.toThrow();
    }
  });

  it("listing never implies submitting", () => {
    // The whole point of the split: a student may SEE a scheduled contest and must not be able to
    // submit to it. `assertCanSubmit` checks the clock independently, so relaxing the list gate
    // cannot leak into the judge.
    const scheduled = contest({ state: "SCHEDULED" });
    expect(() => assertCanListProblems(scheduled.state)).not.toThrow();
    expect(() => assertCanSubmit(scheduled, scheduled.startsAt)).toThrow();
  });
});

describe("clockShouldEnd", () => {
  it("ends a running contest once its end time has passed", () => {
    expect(clockShouldEnd(contest({ state: "RUNNING" }), ENDS)).toBe(true);
    expect(clockShouldEnd(contest({ state: "RUNNING" }), new Date(ENDS.getTime() - 1))).toBe(false);
  });

  it("leaves a frozen board to the organizer, because ending it would reveal it", () => {
    // Pressed freeze, then the clock ran out: the reveal is the organizer's press, not the poll.
    expect(clockShouldEnd(contest({ state: "FROZEN", freezeAt: FREEZE }), ENDS)).toBe(false);
    // A scheduled freeze that has fired is the same board, still RUNNING on paper.
    expect(clockShouldEnd(contest({ state: "RUNNING", freezeAt: FREEZE }), ENDS)).toBe(false);
  });

  it("ends a running contest whose scheduled freeze never arrived before the end", () => {
    const lateFreeze = new Date(ENDS.getTime() + 60_000);
    expect(clockShouldEnd(contest({ state: "RUNNING", freezeAt: lateFreeze }), ENDS)).toBe(true);
  });

  it("never touches a contest that is not live", () => {
    for (const state of ["DRAFT", "SCHEDULED", "ENDED", "ARCHIVED"] as const) {
      expect(clockShouldEnd(contest({ state }), ENDS)).toBe(false);
    }
  });
});
