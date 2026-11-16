import { describe, expect, it } from "vitest";

import { planEndTime, type EndTimeContest } from "@/lib/contest/end-time";
import { DomainError } from "@/lib/errors";

/**
 * Organizer mistakes on the night, recovered without psql: an early Open now, a judge outage that
 * deserves more time, and an End contest pressed by mistake.
 */

const at = (minute: number): Date => new Date(Date.UTC(2026, 10, 19, 0, minute));

function contest(overrides: Partial<EndTimeContest> = {}): EndTimeContest {
  // 7:00 PM to 8:15 PM Eastern is 00:00 to 01:15 UTC; freeze 15 minutes before the end.
  return {
    state: "RUNNING",
    isPractice: false,
    startsAt: at(0),
    endsAt: at(75),
    freezeAt: at(60),
    ...overrides,
  };
}

function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error: unknown) {
    if (error instanceof DomainError) return error.publicMessage;
    throw error;
  }
  throw new Error("expected a refusal");
}

describe("planEndTime", () => {
  it("extends a live contest and slides a scheduled freeze with it", () => {
    const plan = planEndTime(contest(), at(85), at(40));
    expect(plan).toEqual({ state: "RUNNING", endsAt: at(85), freezeAt: at(70), resumed: false });
  });

  it("leaves a freeze that has already fired where the frozen board was cut", () => {
    const plan = planEndTime(contest(), at(85), at(65));
    expect(plan.freezeAt).toEqual(at(60));
  });

  it("leaves a freeze pressed by hand where it is", () => {
    const plan = planEndTime(contest({ state: "FROZEN", freezeAt: at(50) }), at(85), at(55));
    expect(plan).toMatchObject({ state: "FROZEN", freezeAt: at(50) });
  });

  it("freezes from now rather than retroactively when the end is pulled in past the freeze", () => {
    // At 7:40 the end moves to 7:50; the freeze would slide to 7:35, which the room already saw.
    const plan = planEndTime(contest(), at(50), at(40));
    expect(plan.freezeAt).toEqual(at(40));
  });

  it("reopens an ENDED contest given a future end", () => {
    // End contest at 7:30 pulled the end to 7:30 and erased the future freeze.
    const plan = planEndTime(contest({ state: "ENDED", endsAt: at(30), freezeAt: null }), at(75), at(31));
    expect(plan).toEqual({ state: "RUNNING", endsAt: at(75), freezeAt: null, resumed: true });
  });

  it("sets the end of a contest that has not started, even to a time already past today", () => {
    const plan = planEndTime(contest({ state: "SCHEDULED", freezeAt: null }), at(90), at(-30));
    expect(plan).toMatchObject({ state: "SCHEDULED", endsAt: at(90) });
  });

  it("refuses an end in the past on a started contest and names End contest instead", () => {
    expect(refusal(() => planEndTime(contest(), at(30), at(40)))).toMatch(/End contest/);
  });

  it("refuses an end before the start", () => {
    expect(refusal(() => planEndTime(contest({ state: "SCHEDULED" }), at(-5), at(-30)))).toMatch(
      /after the start/,
    );
  });

  it("refuses a window over twelve hours, which is a wrong AM or PM", () => {
    expect(refusal(() => planEndTime(contest(), at(13 * 60), at(40)))).toMatch(/AM or PM/);
  });

  it("never moves the practice arena", () => {
    expect(refusal(() => planEndTime(contest({ isPractice: true }), at(85), at(40)))).toMatch(
      /practice/,
    );
  });
});
