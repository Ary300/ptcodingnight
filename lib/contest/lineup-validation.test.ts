import { describe, expect, it } from "vitest";

import {
  divisionScopesOverlap,
  problemDivisionConflicts,
  slotLabelDivisionConflicts,
} from "./lineup-validation";

/**
 * The two-division line-up rules, pinned.
 *
 * `ContestProblem` is unique on `(contestId, problemId, divisionId)` and the seed history really
 * does hold the same problem in two divisions (Bill Division: Intermediate/M and Advanced/E). So
 * "duplicate" cannot mean "same problemId appears twice". It means "the same players would meet
 * it twice": same division, or one of the rows is division-null, which `inScope` shows to every
 * player. These tests are what stops a later simplification from re-tightening the rule to
 * plain problemId uniqueness and silently outlawing the historical format.
 */

const row = (problemId: string, divisionId: string | null, slotLabel: string) => ({
  problemId,
  divisionId,
  slotLabel,
});

describe("divisionScopesOverlap", () => {
  it("treats null as overlapping everything, because inScope shows null to every player", () => {
    expect(divisionScopesOverlap(null, null)).toBe(true);
    expect(divisionScopesOverlap(null, "adv")).toBe(true);
    expect(divisionScopesOverlap("adv", null)).toBe(true);
  });

  it("treats two different divisions as disjoint", () => {
    expect(divisionScopesOverlap("int", "adv")).toBe(false);
  });

  it("treats the same division as overlapping", () => {
    expect(divisionScopesOverlap("adv", "adv")).toBe(true);
  });
});

describe("problemDivisionConflicts", () => {
  it("allows the same problem in two different divisions (the Bill Division case)", () => {
    expect(
      problemDivisionConflicts([row("p1", "int", "M3"), row("p1", "adv", "E1")]),
    ).toEqual([]);
  });

  it("rejects the same problem twice in one division", () => {
    expect(
      problemDivisionConflicts([row("p1", "adv", "E1"), row("p1", "adv", "E2")]),
    ).toEqual([0, 1]);
  });

  it("rejects the same problem twice with no divisions at all", () => {
    // The no-division contest is the common case and must behave exactly as before.
    expect(problemDivisionConflicts([row("p1", null, "A1"), row("p1", null, "A2")])).toEqual([
      0, 1,
    ]);
  });

  it("rejects a division-null row beside a division-scoped row of the same problem", () => {
    // The null row is in every player's scope, so an Advanced player would see the problem in
    // two slots at once. The database constraint permits this pair; the product must not.
    expect(problemDivisionConflicts([row("p1", null, "A1"), row("p1", "adv", "E1")])).toEqual([
      0, 1,
    ]);
  });

  it("does not flag different problems", () => {
    expect(problemDivisionConflicts([row("p1", null, "A1"), row("p2", null, "A2")])).toEqual([]);
  });

  it("flags every row involved when three rows collide", () => {
    expect(
      problemDivisionConflicts([
        row("p1", null, "A1"),
        row("p1", "int", "M1"),
        row("p1", "adv", "E1"),
      ]),
    ).toEqual([0, 1, 2]);
  });
});

describe("slotLabelDivisionConflicts", () => {
  it("allows one label on two rows in different divisions", () => {
    // The boards key columns by SET label and per-player rows by contestProblemId, and a player
    // only ever sees their own division's problems, so a shared label across divisions never
    // renders twice on one screen.
    const result = slotLabelDivisionConflicts([row("p1", "int", "E1"), row("p2", "adv", "E1")]);
    expect(result.labels).toEqual([]);
    expect(result.rowIndexes).toEqual([]);
  });

  it("rejects one label on two rows in the same division", () => {
    const result = slotLabelDivisionConflicts([row("p1", "adv", "E1"), row("p2", "adv", "E1")]);
    expect(result.labels).toEqual(["E1"]);
    expect(result.rowIndexes).toEqual([0, 1]);
  });

  it("rejects one label shared between a division-null row and a scoped row", () => {
    const result = slotLabelDivisionConflicts([row("p1", null, "E1"), row("p2", "adv", "E1")]);
    expect(result.labels).toEqual(["E1"]);
    expect(result.rowIndexes).toEqual([0, 1]);
  });

  it("compares labels case-insensitively and trimmed, as the server always has", () => {
    const result = slotLabelDivisionConflicts([row("p1", null, "e1 "), row("p2", null, "E1")]);
    expect(result.labels).toEqual(["e1"]);
    expect(result.rowIndexes).toEqual([0, 1]);
  });

  it("ignores blank labels, which are a separate refusal with their own message", () => {
    const result = slotLabelDivisionConflicts([row("p1", null, ""), row("p2", null, "  ")]);
    expect(result.labels).toEqual([]);
    expect(result.rowIndexes).toEqual([]);
  });

  it("reports each conflicted label once, and every row bearing it", () => {
    const result = slotLabelDivisionConflicts([
      row("p1", null, "E1"),
      row("p2", "int", "E1"),
      row("p3", "adv", "E1"),
    ]);
    expect(result.labels).toEqual(["E1"]);
    // int and adv do not overlap each other, but both overlap the null row.
    expect(result.rowIndexes).toEqual([0, 1, 2]);
  });
});
