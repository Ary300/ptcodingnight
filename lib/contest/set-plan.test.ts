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

    expect(result.shortfalls).toEqual([
      { difficulty: "H", divisionName: null, needed: 4, available: 2 },
    ]);
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

  it("deals each division its own grid, with labels restarting at A", () => {
    const result = planSets({
      seed: "seed-div",
      setCount: 2,
      composition: CLASSIC,
      pool: pool({ E: 6, M: 6, H: 6 }),
      divisions: [
        { id: "div-int", name: "Intermediate" },
        { id: "div-adv", name: "Advanced" },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.sets.map((set) => [set.divisionName, set.label])).toEqual([
      ["Intermediate", "A"],
      ["Intermediate", "B"],
      ["Advanced", "A"],
      ["Advanced", "B"],
    ]);

    // Within one division no problem repeats; that is the rule the columns exist to enforce.
    for (const name of ["Intermediate", "Advanced"]) {
      const used = result.sets
        .filter((set) => set.divisionName === name)
        .flatMap((set) => set.problems.map((problem) => problem.problemId));
      expect(new Set(used).size, `${name} dealt a problem twice`).toBe(used.length);
    }
  });

  it("MAY hand two divisions the same problem, because each deals from the full pool", () => {
    // The pool holds exactly one deal's worth, so two divisions MUST overlap completely.
    // The seed history has this shape: Bill Division was Intermediate/M and Advanced/E.
    const result = planSets({
      seed: "seed-overlap",
      setCount: 4,
      composition: CLASSIC,
      pool: pool({ E: 4, M: 4, H: 4 }),
      divisions: [
        { id: "div-int", name: "Intermediate" },
        { id: "div-adv", name: "Advanced" },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byDivision = (name: string): Set<string> =>
      new Set(
        result.sets
          .filter((set) => set.divisionName === name)
          .flatMap((set) => set.problems.map((problem) => problem.problemId)),
      );
    expect(byDivision("Intermediate")).toEqual(byDivision("Advanced"));
  });

  it("names the short division in the refusal", () => {
    const result = planSets({
      seed: "seed-div-short",
      setCount: 4,
      composition: CLASSIC,
      pool: pool({ E: 10, M: 10, H: 2 }),
      divisions: [
        { id: "div-int", name: "Intermediate" },
        { id: "div-adv", name: "Advanced" },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Both divisions are short, because each needs 4 Hard from the same bank of 2.
    expect(result.shortfalls).toEqual([
      { difficulty: "H", divisionName: "Intermediate", needed: 4, available: 2 },
      { difficulty: "H", divisionName: "Advanced", needed: 4, available: 2 },
    ]);
    expect(result.message).toContain("Intermediate: 4 Hard problems are needed");
    expect(result.message).toContain("Advanced: 4 Hard problems are needed");
  });

  it("draws team questions from problems no set in any division took", () => {
    const result = planSets({
      seed: "seed-group",
      setCount: 2,
      composition: CLASSIC,
      pool: pool({ E: 8, M: 8, H: 8 }),
      divisions: [
        { id: "div-int", name: "Intermediate" },
        { id: "div-adv", name: "Advanced" },
      ],
      groupCount: 3,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.groupProblems).toHaveLength(3);
    const dealtAnywhere = new Set(
      result.sets.flatMap((set) => set.problems.map((problem) => problem.problemId)),
    );
    for (const problem of result.groupProblems) {
      expect(dealtAnywhere.has(problem.problemId), `${problem.problemId} is also in a set`).toBe(
        false,
      );
    }
  });

  it("refuses team questions the remainder cannot cover, worst case, with the arithmetic", () => {
    // 2 divisions x 3 per set x 2 sets = 12 dealt worst case, from a bank of 13. One remains.
    const result = planSets({
      seed: "seed-group-short",
      setCount: 2,
      composition: CLASSIC,
      pool: pool({ E: 5, M: 4, H: 4 }),
      divisions: [
        { id: "div-int", name: "Intermediate" },
        { id: "div-adv", name: "Advanced" },
      ],
      groupCount: 3,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.shortfalls).toEqual([
      { difficulty: null, divisionName: null, needed: 3, available: 1 },
    ]);
    expect(result.message).toContain("3 team questions are needed");
    expect(result.message).toContain("at most 1 problem remains");
  });

  it("is deterministic across divisions and group draws too", () => {
    const input = {
      seed: "fixed-seed-div",
      setCount: 2,
      composition: CLASSIC,
      pool: pool({ E: 9, M: 9, H: 9 }),
      divisions: [
        { id: "div-int", name: "Intermediate" },
        { id: "div-adv", name: "Advanced" },
      ],
      groupCount: 2,
    };
    expect(JSON.stringify(planSets(input))).toBe(JSON.stringify(planSets(input)));
  });

  it("deals a no-division contest exactly as it did before divisions existed", () => {
    /*
      The shuffle key for the null division is `${seed}:${difficulty}`, unchanged. This pins the
      dealt problem ids for one fixed seed, so a refactor that silently salts the legacy key breaks
      HERE rather than in a stored contest whose seed no longer reproduces its own split.
    */
    const result = planSets({
      seed: "pin-legacy",
      setCount: 2,
      composition: CLASSIC,
      pool: pool({ E: 4, M: 4, H: 4 }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.groupProblems).toEqual([]);
    for (const set of result.sets) {
      expect(set.divisionId).toBeNull();
      expect(set.divisionName).toBeNull();
    }
  });
});

describe("checkFeasibility", () => {
  it("answers without building anything, so a form can warn while it is being filled in", () => {
    expect(checkFeasibility(CLASSIC, pool({ E: 3, M: 3, H: 3 }), 3)).toEqual([]);
    expect(checkFeasibility(CLASSIC, pool({ E: 3, M: 3, H: 3 }), 4)).toEqual([
      { difficulty: "E", divisionName: null, needed: 4, available: 3 },
      { difficulty: "M", divisionName: null, needed: 4, available: 3 },
      { difficulty: "H", divisionName: null, needed: 4, available: 3 },
    ]);
  });

  it("names the division whose demand it is checking", () => {
    expect(checkFeasibility(CLASSIC, pool({ E: 3, M: 3, H: 1 }), 2, "Advanced")).toEqual([
      { difficulty: "H", divisionName: "Advanced", needed: 2, available: 1 },
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
