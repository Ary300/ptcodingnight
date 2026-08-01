import { describe, expect, it } from "vitest";

import {
  checkFeasibility,
  planSets,
  setLabelAt,
  setSize,
  type AvailableProblem,
  type Difficulty,
  type SetComposition,
} from "@/lib/contest/set-plan";

/** A pool of `count` problems at one difficulty, ids stable so the tests are readable. */
function pool(spec: Partial<Record<Difficulty, number>>): AvailableProblem[] {
  const problems: AvailableProblem[] = [];
  for (const [difficulty, count] of Object.entries(spec) as [Difficulty, number][]) {
    for (let n = 1; n <= count; n += 1) {
      problems.push({
        problemId: `${difficulty}${String(n)}`,
        slug: `${difficulty.toLowerCase()}-${String(n)}`,
        title: `${difficulty} problem ${String(n)}`,
        difficulty,
      });
    }
  }
  return problems;
}

/** The historical Coding Night recipe: one Easy, one Medium, one Hard. */
const CLASSIC: SetComposition = [
  { difficulty: "E", count: 1 },
  { difficulty: "M", count: 1 },
  { difficulty: "H", count: 1 },
];

describe("planSets", () => {
  it("builds the requested number of sets, each matching the recipe", () => {
    const result = planSets({
      seed: "seed-1",
      setCount: 2,
      composition: CLASSIC,
      pool: pool({ E: 4, M: 4, H: 4 }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.sets).toHaveLength(2);
    for (const set of result.sets) {
      expect(set.problems).toHaveLength(3);
      const byDifficulty = set.problems.map((problem) => problem.difficulty);
      expect(byDifficulty).toEqual(["E", "M", "H"]);
    }
    expect(result.sets.map((set) => set.label)).toEqual(["A", "B"]);
  });

  it("NEVER puts the same problem in two sets", () => {
    /*
      The property the whole feature exists for. Structural rather than incidental: each
      difficulty is shuffled once and dealt without replacement, so a repeat is unrepresentable.
      Checked at the tightest possible fit, where a naive implementation would collide.
    */
    const result = planSets({
      seed: "seed-tight",
      setCount: 4,
      composition: CLASSIC,
      pool: pool({ E: 4, M: 4, H: 4 }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const used = result.sets.flatMap((set) => set.problems.map((problem) => problem.problemId));
    expect(used).toHaveLength(12);
    expect(new Set(used).size, "a problem was dealt into more than one set").toBe(12);
  });

  it("is deterministic: the same seed re-derives the same split byte for byte", () => {
    // An organizer must be able to re-run this in front of a student and show it was fixed
    // before anyone knew who was on which team (PRD §6.2).
    const input = {
      seed: "fixed-seed",
      setCount: 3,
      composition: CLASSIC,
      pool: pool({ E: 6, M: 6, H: 6 }),
    };
    expect(JSON.stringify(planSets(input))).toBe(JSON.stringify(planSets(input)));
  });

  it("a different seed generally deals differently", () => {
    const base = { setCount: 3, composition: CLASSIC, pool: pool({ E: 9, M: 9, H: 9 }) };
    const first = planSets({ ...base, seed: "seed-a" });
    const second = planSets({ ...base, seed: "seed-b" });
    expect(JSON.stringify(first)).not.toBe(JSON.stringify(second));
  });

  it("honours a recipe that is not one of each", () => {
    // The format has changed between years, so the recipe is an input. Two Easy and one Hard.
    const composition: SetComposition = [
      { difficulty: "E", count: 2 },
      { difficulty: "H", count: 1 },
    ];
    const result = planSets({
      seed: "seed-2",
      setCount: 3,
      composition,
      pool: pool({ E: 6, M: 99, H: 3 }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const set of result.sets) {
      expect(set.problems.map((problem) => problem.difficulty)).toEqual(["E", "E", "H"]);
    }
    // Medium was not asked for, so no Medium was dealt even though the pool was full of them.
    const used = result.sets.flatMap((set) => set.problems);
    expect(used.some((problem) => problem.difficulty === "M")).toBe(false);
  });

  it("refuses when the bank is short, and says exactly how short", () => {
    const result = planSets({
      seed: "seed-3",
      setCount: 4,
      composition: CLASSIC,
      pool: pool({ E: 10, M: 10, H: 2 }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.shortfalls).toEqual([{ difficulty: "H", needed: 4, available: 2 }]);
    // The arithmetic is in the sentence, because "not enough problems" sends an organizer
    // hunting for which kind and how many.
    expect(result.message).toContain("4 Hard problems are needed for 4 sets");
    expect(result.message).toContain("the bank has 2");
    expect(result.message).toContain("2 more Hard problems are required");
  });

  it("reports EVERY shortfall, not just the first", () => {
    const result = planSets({
      seed: "seed-4",
      setCount: 5,
      composition: CLASSIC,
      pool: pool({ E: 1, M: 5, H: 0 }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.shortfalls.map((shortfall) => shortfall.difficulty)).toEqual(["E", "H"]);
  });

  it("never draws a problem whose difficulty is unset", () => {
    // An unrated problem cannot satisfy a recipe line, so it must not be silently dealt as one.
    const unrated: AvailableProblem = {
      problemId: "X1",
      slug: "unrated",
      title: "Unrated",
      difficulty: null,
    };
    const result = planSets({
      seed: "seed-5",
      setCount: 1,
      composition: [{ difficulty: "E", count: 1 }],
      pool: [...pool({ E: 1 }), unrated],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sets[0]!.problems.map((problem) => problem.problemId)).toEqual(["E1"]);
  });

  it("refuses a zero set count and an empty recipe, in words an organizer can act on", () => {
    const noSets = planSets({
      seed: "s",
      setCount: 0,
      composition: CLASSIC,
      pool: pool({ E: 9, M: 9, H: 9 }),
    });
    expect(noSets.ok).toBe(false);
    if (!noSets.ok) expect(noSets.message).toContain("how many sets");

    const noRecipe = planSets({
      seed: "s",
      setCount: 2,
      composition: [],
      pool: pool({ E: 9, M: 9, H: 9 }),
    });
    expect(noRecipe.ok).toBe(false);
    if (!noRecipe.ok) expect(noRecipe.message).toContain("set is empty");
  });

  it("treats a zero-count recipe line as absent rather than as a constraint", () => {
    const result = planSets({
      seed: "seed-6",
      setCount: 2,
      composition: [
        { difficulty: "E", count: 1 },
        { difficulty: "H", count: 0 },
      ],
      pool: pool({ E: 2, H: 0 }),
    });
    // Zero Hard needed, zero Hard available: that is not a shortfall.
    expect(result.ok).toBe(true);
  });
});

describe("checkFeasibility", () => {
  it("answers without building anything, so a form can warn while it is being filled in", () => {
    expect(checkFeasibility(CLASSIC, pool({ E: 3, M: 3, H: 3 }), 3)).toEqual([]);
    expect(checkFeasibility(CLASSIC, pool({ E: 3, M: 3, H: 3 }), 4)).toEqual([
      { difficulty: "E", needed: 4, available: 3 },
      { difficulty: "M", needed: 4, available: 3 },
      { difficulty: "H", needed: 4, available: 3 },
    ]);
  });
});

describe("setSize and setLabelAt", () => {
  it("counts the problems one set holds", () => {
    expect(setSize(CLASSIC)).toBe(3);
    expect(setSize([{ difficulty: "E", count: 2 }, { difficulty: "H", count: 3 }])).toBe(5);
  });

  it("labels sets A, B, C and keeps going past Z", () => {
    expect(setLabelAt(0)).toBe("A");
    expect(setLabelAt(25)).toBe("Z");
    expect(setLabelAt(26)).toBe("AA");
  });
});
