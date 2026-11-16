import { describe, expect, it } from "vitest";

import { assertCanSubmit } from "@/lib/contest/gate";
import {
  LOST_JOB_GRACE_MS,
  REPEAT_SUBMISSION_WINDOW_MS,
  isRepeatSubmission,
  lostJobAction,
} from "@/lib/contest/submissions";
import { DomainError } from "@/lib/errors";

/**
 * The rules that keep a submission from being lost, doubled, or refused with the wrong words.
 * The end-to-end proof is tests/e2e/night-failure-modes.api.spec.ts; these pin the decisions.
 */

const T = new Date("2026-11-19T01:14:58.000Z");
const later = (ms: number): Date => new Date(T.getTime() + ms);

const first = {
  contestProblemId: "cp1",
  language: "JAVA_21" as const,
  sourceCode: "class Main {}",
  submittedAt: T,
};
const again = { contestProblemId: "cp1", language: "JAVA_21" as const, sourceCode: "class Main {}" };

describe("isRepeatSubmission", () => {
  it("treats the same code to the same problem seconds later as the same submission", () => {
    expect(isRepeatSubmission(first, again, later(800))).toBe(true);
    expect(isRepeatSubmission(first, again, later(REPEAT_SUBMISSION_WINDOW_MS))).toBe(true);
  });

  it("matches in either order, because two copies of one POST stamp their time before inserting", () => {
    expect(isRepeatSubmission(first, again, later(-40))).toBe(true);
  });

  it("does not fold a changed program, another problem, another language, or an old one", () => {
    expect(isRepeatSubmission(first, { ...again, sourceCode: "class Main { }" }, later(500))).toBe(false);
    expect(isRepeatSubmission(first, { ...again, contestProblemId: "cp2" }, later(500))).toBe(false);
    expect(isRepeatSubmission(first, { ...again, language: "PYTHON_312" }, later(500))).toBe(false);
    expect(isRepeatSubmission(first, again, later(REPEAT_SUBMISSION_WINDOW_MS + 1))).toBe(false);
  });
});

describe("lostJobAction", () => {
  it("waits while the submit request may still be enqueueing", () => {
    expect(lostJobAction(T, later(LOST_JOB_GRACE_MS))).toBe("wait");
  });

  it("builds the job again after that, however old the submission, rather than writing IE", () => {
    expect(lostJobAction(T, later(LOST_JOB_GRACE_MS + 1))).toBe("requeue");
    expect(lostJobAction(T, later(60 * 60_000))).toBe("requeue");
  });
});

describe("assertCanSubmit before the start", () => {
  it("says the contest has not started, for a published contest still waiting", () => {
    const run = (): void =>
      assertCanSubmit(
        { state: "SCHEDULED", startsAt: later(60_000), endsAt: later(3_600_000), freezeAt: null },
        T,
      );
    expect(run).toThrow(DomainError);
    expect(run).toThrow("This contest has not started yet");
  });
});
