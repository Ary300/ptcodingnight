import { describe, expect, it } from "vitest";

import {
  resultsSummary,
  SUBMISSIONS_CLOSED_SUMMARY,
  type ResultsSummaryInput,
} from "@/components/contest/problem/results-summary";
import { msUntilClose } from "@/components/contest/problem/window-closed";
import { CONTEST_OVER_MESSAGE } from "@/lib/contest/gate";

/*
  After 8:15 a press on Submit came back refused and the Results header read "Did not finish",
  which sounds like the student's code failed. A refusal because the window closed reads
  "Submissions are closed"; every other failure still reads "Did not finish".
*/

const IDLE: ResultsSummaryInput = {
  action: "judged",
  error: null,
  sampleBusy: false,
  sampleResults: [],
  submitBusy: false,
  judging: false,
  verdict: null,
};

describe("the Results header after the window closes", () => {
  it("reads Submissions are closed when the server refused a late submit", () => {
    expect(resultsSummary({ ...IDLE, error: CONTEST_OVER_MESSAGE })).toBe(
      SUBMISSIONS_CLOSED_SUMMARY,
    );
    expect(SUBMISSIONS_CLOSED_SUMMARY).toBe("Submissions are closed");
  });

  it("reads Submissions are closed for any refusal once the page knows the window closed", () => {
    expect(resultsSummary({ ...IDLE, error: "Could not reach the server.", windowClosed: true })).toBe(
      "Submissions are closed",
    );
  });

  it("still reads Did not finish for any other failure in an open window", () => {
    expect(resultsSummary({ ...IDLE, error: "Could not reach the server." })).toBe("Did not finish");
    expect(resultsSummary({ ...IDLE, error: "Could not reach the server.", windowClosed: false })).toBe(
      "Did not finish",
    );
  });
});

describe("msUntilClose", () => {
  const window = {
    endsAt: "2026-11-17T20:15:00.000-05:00",
    serverTime: "2026-11-17T20:14:00.000-05:00",
    closedAtLoad: false,
  };

  it("counts in server time, so a laptop clock that is wrong does not move the close", () => {
    // This laptop's clock reads ten minutes slow: mounted at what it thinks is 8:04.
    const mountedAt = Date.parse("2026-11-17T20:04:00.000-05:00");
    expect(msUntilClose(window, mountedAt, mountedAt)).toBe(60_000);
    expect(msUntilClose(window, mountedAt, mountedAt + 60_000)).toBe(0);
  });
});
