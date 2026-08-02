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
  isPublicBoardFrozen,
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
