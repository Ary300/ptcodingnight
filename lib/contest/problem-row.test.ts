import { describe, expect, it } from "vitest";

import { pickContestProblemForViewer } from "@/lib/contest/problems";

/**
 * One slug, several line-up rows: the set planner deals both divisions from the same bank, so a
 * problem can be Intermediate set D and Advanced set C in the same contest. The problem page is
 * addressed by slug, and it used to take whichever row the database produced first, which told
 * every student in the other division that their own problem "belongs to another division".
 */
describe("pickContestProblemForViewer", () => {
  const intermediateD = { id: "cp-1", divisionId: "int", setId: "int-D" };
  const advancedC = { id: "cp-2", divisionId: "adv", setId: "adv-C" };
  const rows = [intermediateD, advancedC];

  it("gives an Advanced student the Advanced row even when the Intermediate row comes first", () => {
    const picked = pickContestProblemForViewer(
      rows,
      { admin: false, divisionId: "adv", chosenSetId: "adv-C" },
      false,
    );
    expect(picked?.id).toBe("cp-2");
  });

  it("gives an Intermediate student the Intermediate row when it comes second", () => {
    const picked = pickContestProblemForViewer(
      [advancedC, intermediateD],
      { admin: false, divisionId: "int", chosenSetId: "int-D" },
      false,
    );
    expect(picked?.id).toBe("cp-1");
  });

  it("does not hand over another set's row in the student's own division", () => {
    const sameDivisionOtherSet = { id: "cp-3", divisionId: "adv", setId: "adv-A" };
    const picked = pickContestProblemForViewer(
      [sameDivisionOtherSet, advancedC],
      { admin: false, divisionId: "adv", chosenSetId: "adv-C" },
      false,
    );
    expect(picked?.id).toBe("cp-2");
  });

  it("falls back to the first row when none is the viewer's, so the refusal still names why", () => {
    const picked = pickContestProblemForViewer(
      rows,
      { admin: false, divisionId: "adv", chosenSetId: "adv-A" },
      false,
    );
    expect(picked?.id).toBe("cp-1");
  });

  it("returns the first row to an organizer, who may read every one", () => {
    const picked = pickContestProblemForViewer(
      rows,
      { admin: true, divisionId: null, chosenSetId: null },
      false,
    );
    expect(picked?.id).toBe("cp-1");
  });

  it("returns null for a slug with no row", () => {
    expect(
      pickContestProblemForViewer([], { admin: false, divisionId: "adv", chosenSetId: null }, false),
    ).toBeNull();
  });
});
