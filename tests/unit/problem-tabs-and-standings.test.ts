import { describe, expect, it } from "vitest";

import { searchWithTab, tabFromSearch } from "@/components/contest/problem/problem-tab";
import {
  standingsState,
  teamOfParticipant,
} from "@/components/contest/standings/standings-state";
import {
  forProblem,
  mergeLiveSubmissions,
  rememberStreamed,
} from "@/components/contest/submissions/live-rows";
import type { SubmissionView, TeamStandingRow } from "@/lib/schemas/api";

function submission(overrides: Partial<SubmissionView> & { submissionId: string }): SubmissionView {
  return {
    contestProblemId: "cp-1",
    language: "PYTHON_312",
    submittedAt: "2026-11-18T00:00:00.000Z",
    verdict: null,
    score: 0,
    runtimeMs: null,
    testResults: [],
    compileError: null,
    ...overrides,
  };
}

describe("the problem page's tab in the address", () => {
  it("reads only ?tab=submissions as the submissions tab", () => {
    expect(tabFromSearch("")).toBe("problem");
    expect(tabFromSearch("?tab=submissions")).toBe("submissions");
    expect(tabFromSearch("?tab=other")).toBe("problem");
    expect(tabFromSearch("?x=1&tab=submissions")).toBe("submissions");
  });

  it("writes the tab and keeps every other parameter", () => {
    expect(searchWithTab("", "submissions")).toBe("?tab=submissions");
    expect(searchWithTab("?tab=submissions", "problem")).toBe("");
    expect(searchWithTab("?x=1&tab=submissions", "problem")).toBe("?x=1");
    expect(searchWithTab("?x=1", "submissions")).toBe("?x=1&tab=submissions");
  });
});

describe("mergeLiveSubmissions", () => {
  it("adds a streamed submission the list has not seen, newest first", () => {
    const listed = submission({ submissionId: "a", submittedAt: "2026-11-18T00:00:00.000Z", verdict: "WA" });
    const streamed = submission({ submissionId: "b", submittedAt: "2026-11-18T00:05:00.000Z" });
    expect(mergeLiveSubmissions([listed], [streamed]).map((row) => row.submissionId)).toEqual([
      "b",
      "a",
    ]);
  });

  it("prefers a judged copy over an unjudged one from either side", () => {
    const judging = submission({ submissionId: "a" });
    const judged = submission({ submissionId: "a", verdict: "AC", score: 100 });
    expect(mergeLiveSubmissions([judging], [judged])[0]?.verdict).toBe("AC");
    expect(mergeLiveSubmissions([judged], [judging])[0]?.verdict).toBe("AC");
  });

  it("keeps the list's copy when both are judged, because only the list carries an override", () => {
    const listed = submission({ submissionId: "a", verdict: "AC", score: 100, overridden: true });
    const streamed = submission({ submissionId: "a", verdict: "WA", score: 0 });
    expect(mergeLiveSubmissions([listed], [streamed])[0]).toBe(listed);
  });

  it("does not modify its inputs", () => {
    const fetched = [submission({ submissionId: "a" })];
    const live = [submission({ submissionId: "b" })];
    mergeLiveSubmissions(fetched, live);
    expect(fetched.map((row) => row.submissionId)).toEqual(["a"]);
    expect(live.map((row) => row.submissionId)).toEqual(["b"]);
  });

  it("filters to one problem, or none at all", () => {
    const rows = [
      submission({ submissionId: "a", contestProblemId: "cp-1" }),
      submission({ submissionId: "b", contestProblemId: "cp-2" }),
    ];
    expect(forProblem(rows, "cp-2").map((row) => row.submissionId)).toEqual(["b"]);
    expect(forProblem(rows, null)).toHaveLength(2);
  });

  it("remembers each streamed submission once, latest copy first", () => {
    const first = submission({ submissionId: "a" });
    const second = submission({ submissionId: "b" });
    const firstJudged = submission({ submissionId: "a", verdict: "AC" });
    const seen = rememberStreamed(rememberStreamed(rememberStreamed([], first), second), firstJudged);
    expect(seen.map((row) => `${row.submissionId}:${row.verdict ?? "-"}`)).toEqual(["a:AC", "b:-"]);
  });
});

describe("the student standings page", () => {
  const base = {
    asOf: "2026-11-18T01:00:00.000Z",
    endsAt: "2026-11-18T01:15:00.000Z",
    isPractice: false,
  };

  it("says frozen whenever the public board is frozen, before or after the end", () => {
    expect(standingsState({ ...base, frozen: true })).toBe("frozen");
    expect(standingsState({ ...base, asOf: base.endsAt, frozen: true })).toBe("frozen");
  });

  it("says final only once the board is unfrozen at or past the end", () => {
    expect(standingsState({ ...base, frozen: false })).toBe("live");
    expect(standingsState({ ...base, asOf: base.endsAt, frozen: false })).toBe("final");
    expect(standingsState({ ...base, asOf: base.endsAt, frozen: false, isPractice: true })).toBe(
      "live",
    );
  });

  it("finds the viewer's team by their place on its roster", () => {
    const team = (teamId: string, ids: string[]) =>
      ({ teamId, players: ids.map((participantId) => ({ participantId })) }) as unknown as TeamStandingRow;
    const teams = [team("t1", ["p1"]), team("t2", ["p2", "p3"])];
    expect(teamOfParticipant(teams, "p3")).toBe("t2");
    expect(teamOfParticipant(teams, "p9")).toBeNull();
    expect(teamOfParticipant(teams, null)).toBeNull();
  });
});
