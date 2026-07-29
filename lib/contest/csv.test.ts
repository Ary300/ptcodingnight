import { describe, expect, it } from "vitest";

import type { StandingsResponse } from "@/lib/schemas/api";
import { exportFilename, standingsToCsv } from "@/lib/contest/csv";

function standings(rows: StandingsResponse["divisions"][number]["rows"]): StandingsResponse {
  return {
    contestId: "c-1",
    frozen: false,
    asOf: "2026-07-29T20:00:00.000Z",
    endsAt: "2026-07-29T20:00:00.000Z",
    divisions: [{ divisionId: "d-1", name: "Advanced", rows }],
  };
}

function row(overrides: Partial<StandingsResponse["divisions"][number]["rows"][number]> = {}) {
  return {
    rank: 1,
    isTied: false,
    participantId: "p-1",
    displayName: "Ada",
    score: 300,
    penaltyMinutes: 10,
    delta: 0,
    ...overrides,
  };
}

describe("standingsToCsv", () => {
  it("writes a header and one line per participant", () => {
    const csv = standingsToCsv(standings([row(), row({ rank: 2, participantId: "p-2", displayName: "Grace" })]));
    const lines = csv.trimEnd().split("\r\n");

    expect(lines[0]).toBe("division,rank,tied,participantId,displayName,score,penaltyMinutes");
    expect(lines[1]).toBe("Advanced,1,false,p-1,Ada,300,10");
    expect(lines).toHaveLength(3);
  });

  it("quotes a name containing a comma and doubles embedded quotes", () => {
    const csv = standingsToCsv(standings([row({ displayName: 'Ada, "the" first' })]));
    expect(csv).toContain('"Ada, ""the"" first"');
  });

  it("neutralizes a name a spreadsheet would run as a formula", () => {
    const csv = standingsToCsv(standings([row({ displayName: "=HYPERLINK(\"http://x\")" })]));
    // Leading apostrophe, and quoted because the value also contains a comma-free quote pair.
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toContain(",=HYPERLINK");
  });

  it.each(["+1", "-1", "@SUM(A1)"])("neutralizes a name starting with %s", (name) => {
    const csv = standingsToCsv(standings([row({ displayName: name })]));
    expect(csv).toContain(`'${name}`);
  });

  it("produces only a header when nobody has joined", () => {
    const csv = standingsToCsv({ ...standings([]), divisions: [] });
    expect(csv.trimEnd().split("\r\n")).toHaveLength(1);
  });
});

describe("exportFilename", () => {
  it("slugs the contest name and makes the timestamp filename-safe", () => {
    expect(exportFilename("Coding Night 2026!", "2026-07-29T20:00:00.000Z")).toBe(
      "coding-night-2026-standings-2026-07-29T20-00-00.000Z.csv",
    );
  });

  it("falls back to a usable name when the contest name has nothing sluggable", () => {
    expect(exportFilename("!!!", "2026-07-29T20:00:00.000Z")).toContain("contest-standings-");
  });
});
