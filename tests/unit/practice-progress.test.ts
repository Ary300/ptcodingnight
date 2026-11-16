import { describe, expect, it } from "vitest";

import { practiceProgress } from "@/components/contest/lobby/practice-progress";
import type { ProblemSummary } from "@/lib/schemas/api";

function row(overrides: Partial<ProblemSummary> & { slotLabel: string }): ProblemSummary {
  return {
    contestProblemId: `cp-${overrides.slotLabel}`,
    slug: `slug-${overrides.slotLabel}`,
    title: `Title ${overrides.slotLabel}`,
    difficulty: "E",
    basePoints: 100,
    isGroupProblem: false,
    bestScore: null,
    solved: false,
    unlocked: true,
    unlockAt: null,
    ...overrides,
  };
}

describe("practiceProgress", () => {
  it("counts solves, sums best scores and splits by difficulty", () => {
    const progress = practiceProgress([
      row({ slotLabel: "P1", solved: true, bestScore: 100 }),
      row({ slotLabel: "P2", bestScore: 40 }),
      row({ slotLabel: "P3", difficulty: "M", basePoints: 200 }),
      row({ slotLabel: "P4", difficulty: "H", basePoints: 300, solved: true, bestScore: 300 }),
    ]);

    expect(progress.solved).toBe(2);
    expect(progress.total).toBe(4);
    expect(progress.points).toBe(440);
    expect(progress.possiblePoints).toBe(700);
    expect(progress.byDifficulty).toEqual([
      { difficulty: "E", solved: 1, total: 2 },
      { difficulty: "M", solved: 0, total: 1 },
      { difficulty: "H", solved: 1, total: 1 },
    ]);
    expect(progress.next).toEqual({ slug: "slug-P2", slotLabel: "P2", title: "Title P2" });
  });

  it("never suggests a locked or redacted row", () => {
    const progress = practiceProgress([
      row({ slotLabel: "P1", unlocked: false }),
      row({ slotLabel: "P2", slug: "" }),
      row({ slotLabel: "P3" }),
    ]);
    expect(progress.next?.slotLabel).toBe("P3");
  });

  it("suggests nothing once everything is solved, and handles an empty list", () => {
    expect(
      practiceProgress([row({ slotLabel: "P1", solved: true, bestScore: 100 })]).next,
    ).toBeNull();
    const empty = practiceProgress([]);
    expect(empty).toMatchObject({ solved: 0, total: 0, points: 0, next: null });
    expect(empty.byDifficulty.map((entry) => entry.total)).toEqual([0, 0, 0]);
  });
});
