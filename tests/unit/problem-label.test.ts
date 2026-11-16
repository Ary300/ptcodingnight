import { describe, expect, it } from "vitest";

import { problemLabel } from "@/components/contest/problem/problem-label";

describe("problemLabel", () => {
  it("puts the title in parentheses after the slot label", () => {
    expect(problemLabel("P1", "Two Tables, One Total")).toBe("P1 (Two Tables, One Total)");
  });

  it("trims both parts", () => {
    expect(problemLabel("  B2 ", " A Very Big Sum ")).toBe("B2 (A Very Big Sum)");
  });

  it("falls back to the title when the slot has no label", () => {
    expect(problemLabel("", "A Very Big Sum")).toBe("A Very Big Sum");
  });

  it("does not repeat a title that is the slot label", () => {
    expect(problemLabel("Warmup", "Warmup")).toBe("Warmup");
    expect(problemLabel("P1", "")).toBe("P1");
  });
});
