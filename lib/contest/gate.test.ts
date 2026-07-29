import { describe, expect, it } from "vitest";

import type { ContestState, ProblemState } from "@prisma/client";

import { DomainError, DraftProblemError, ForbiddenError } from "@/lib/errors";
import {
  assertCanJoin,
  assertCanReadProblems,
  assertCanSubmit,
  assertProblemIsLive,
  assertUnlocked,
  isPublicBoardFrozen,
  isUnlocked,
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
    expect(() => assertCanReadProblems(state)).not.toThrow();
  });

  it("refuses a contest that has not started, so problems cannot be read early", () => {
    expect(() => assertCanReadProblems("SCHEDULED")).toThrow(DomainError);
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
