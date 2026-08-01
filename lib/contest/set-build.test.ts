import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_POINTS_BY_DIFFICULTY,
  assignSlots,
  describeComposition,
  labelsFor,
  parseStoredComposition,
  pointsForEntry,
} from "@/lib/contest/set-build";
import { planSets, type AvailableProblem } from "@/lib/contest/set-plan";
import type { SetCompositionInput } from "@/lib/schemas/api";

/**
 * What is tested here, and what deliberately is not.
 *
 * `set-build.ts` is the I/O half of the set builder, so most of it — `previewSets`, `applySets`,
 * `readSetPlan`, `gatherPool` — is a Postgres transaction and is not meaningfully testable without
 * a database. Mocking Prisma would prove only that the mock was called, which is the shape of test
 * that passes while the product is broken. Those paths are covered by exercising the route against
 * the real database (see the report), not from here.
 *
 * What IS pure is the part that decides what each dealt problem is CALLED and what it is WORTH,
 * plus reading a stored recipe back. Those are the pieces where a silent mistake ends up in a
 * database row: a slot label that names the wrong difficulty, or a Hard scoring an Easy's points.
 */

/** The historical Coding Night recipe: one Easy, one Medium, one Hard. */
const CLASSIC: SetCompositionInput = [
  { difficulty: "E", count: 1 },
  { difficulty: "M", count: 1 },
  { difficulty: "H", count: 1 },
];

function problem(id: string, difficulty: "E" | "M" | "H"): AvailableProblem {
  return { problemId: id, slug: id.toLowerCase(), title: `Problem ${id}`, difficulty };
}

function pool(spec: Partial<Record<"E" | "M" | "H", number>>): AvailableProblem[] {
  const problems: AvailableProblem[] = [];
  for (const [difficulty, count] of Object.entries(spec) as ["E" | "M" | "H", number][]) {
    for (let n = 1; n <= count; n += 1) problems.push(problem(`${difficulty}${String(n)}`, difficulty));
  }
  return problems;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("assignSlots", () => {
  it("names each slot after its set and its recipe line", () => {
    const slots = assignSlots("A", [problem("E1", "E"), problem("M1", "M"), problem("H1", "H")], CLASSIC);

    expect(slots.map((slot) => slot.slotLabel)).toEqual(["A-E1", "A-M1", "A-H1"]);
  });

  it("numbers within a line, so two Mediums are M1 and M2 rather than both M1", () => {
    const composition: SetCompositionInput = [{ difficulty: "M", count: 2 }];
    const slots = assignSlots("C", [problem("M1", "M"), problem("M2", "M")], composition);

    expect(slots.map((slot) => slot.slotLabel)).toEqual(["C-M1", "C-M2"]);
  });

  it("prices each problem by its difficulty, so a Hard is not worth an Easy", () => {
    const slots = assignSlots("A", [problem("E1", "E"), problem("M1", "M"), problem("H1", "H")], CLASSIC);

    expect(slots.map((slot) => slot.basePoints)).toEqual([
      DEFAULT_POINTS_BY_DIFFICULTY.E,
      DEFAULT_POINTS_BY_DIFFICULTY.M,
      DEFAULT_POINTS_BY_DIFFICULTY.H,
    ]);
  });

  it("lets the recipe override the points per line", () => {
    const composition: SetCompositionInput = [
      { difficulty: "E", count: 1, points: 50 },
      { difficulty: "H", count: 1, points: 500 },
    ];
    const slots = assignSlots("B", [problem("E1", "E"), problem("H1", "H")], composition);

    expect(slots.map((slot) => slot.basePoints)).toEqual([50, 500]);
  });

  it("ignores a line asking for zero problems", () => {
    const composition: SetCompositionInput = [
      { difficulty: "E", count: 0 },
      { difficulty: "H", count: 1 },
    ];
    const slots = assignSlots("A", [problem("H1", "H")], composition);

    expect(slots.map((slot) => slot.slotLabel)).toEqual(["A-H1"]);
  });

  /*
    The invariant, not a validation. Slot labels are derived by walking the recipe in the order
    planSets deals it, so a set whose length disagrees with the recipe means the two have stopped
    describing the same thing — and the labels written to the database would be attached to the
    wrong problems, silently. Loud is the only acceptable behaviour.
  */
  it("refuses to label a set that does not match the recipe it claims to follow", () => {
    expect(() => assignSlots("A", [problem("E1", "E")], CLASSIC)).toThrow(/recipe/);
    expect(() =>
      assignSlots("A", [problem("E1", "E"), problem("M1", "M"), problem("H1", "H")], [
        { difficulty: "E", count: 1 },
      ]),
    ).toThrow(/recipe/);
  });
});

describe("assignSlots over a real deal", () => {
  it("gives every problem in the contest a distinct slot label and uses none twice", () => {
    const plan = planSets({ seed: "seed-1", setCount: 4, composition: CLASSIC, pool: pool({ E: 4, M: 4, H: 4 }) });
    if (!plan.ok) throw new Error(plan.message);

    const slots = plan.sets.flatMap((set) => assignSlots(set.label, set.problems, CLASSIC));

    expect(slots).toHaveLength(12);
    expect(new Set(slots.map((slot) => slot.slotLabel)).size).toBe(12);
    expect(new Set(slots.map((slot) => slot.problemId)).size).toBe(12);
  });

  it("labels a slot with the difficulty the problem actually has", () => {
    const plan = planSets({ seed: "seed-2", setCount: 2, composition: CLASSIC, pool: pool({ E: 2, M: 2, H: 2 }) });
    if (!plan.ok) throw new Error(plan.message);

    for (const set of plan.sets) {
      for (const slot of assignSlots(set.label, set.problems, CLASSIC)) {
        expect(slot.slotLabel).toBe(`${set.label}-${slot.difficulty ?? "?"}${slot.slotLabel.slice(-1)}`);
      }
    }
  });
});

describe("describeComposition", () => {
  it("reads as a sentence, because it lands in an audit row somebody has to read", () => {
    expect(describeComposition(CLASSIC)).toBe("1 Easy, 1 Medium, 1 Hard");
  });

  it("leaves out the lines asking for nothing", () => {
    expect(
      describeComposition([
        { difficulty: "E", count: 2 },
        { difficulty: "M", count: 0 },
      ]),
    ).toBe("2 Easy");
  });
});

describe("pointsForEntry", () => {
  it("falls back to the difficulty default when the recipe is silent", () => {
    expect(pointsForEntry({ difficulty: "M", count: 1 })).toBe(DEFAULT_POINTS_BY_DIFFICULTY.M);
  });

  it("takes an explicit zero rather than treating it as absent", () => {
    expect(pointsForEntry({ difficulty: "H", count: 1, points: 0 })).toBe(0);
  });
});

describe("parseStoredComposition", () => {
  it("reads back what was stored", () => {
    expect(parseStoredComposition(JSON.parse(JSON.stringify(CLASSIC)) as unknown)).toEqual(CLASSIC);
  });

  it("treats an unplanned contest as having no recipe", () => {
    expect(parseStoredComposition(null)).toBeNull();
  });

  /*
    A Json column is `unknown` on the way OUT as well as in: a row written by an older build is
    external data to the build reading it. Null rather than a throw, because the screen that calls
    this is the one an organizer would use to fix it, and a 500 here leaves psql as the only way
    back.
  */
  it("returns null for a row it cannot read, and says so in the log", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(parseStoredComposition({ difficulty: "E" })).toBeNull();
    expect(parseStoredComposition([{ difficulty: "X", count: 1 }])).toBeNull();
    expect(parseStoredComposition("1 Easy, 1 Medium, 1 Hard")).toBeNull();
    expect(logged).toHaveBeenCalledTimes(3);
  });

  it("rejects a recipe that names one difficulty twice, which would price it two ways", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(
      parseStoredComposition([
        { difficulty: "E", count: 1, points: 100 },
        { difficulty: "E", count: 1, points: 250 },
      ]),
    ).toBeNull();
  });
});

describe("labelsFor", () => {
  it("names the columns the way the organizer's sheet does", () => {
    expect(labelsFor(4)).toEqual(["A", "B", "C", "D"]);
  });

  it("has no columns to name for a plan of no sets", () => {
    expect(labelsFor(0)).toEqual([]);
  });
});
