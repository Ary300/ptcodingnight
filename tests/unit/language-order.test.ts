import { describe, expect, it } from "vitest";

import { orderLanguages } from "@/components/contest/editor/language-order";
import { LANGUAGE_IDS } from "@/lib/judge/runtimes";

describe("orderLanguages", () => {
  it("puts Java 21, Python 3 and C++17 first, in that order, whatever order the problem lists", () => {
    expect(orderLanguages(["PYTHON_312", "CPP_17", "JAVA_21"])).toEqual(["JAVA_21", "PYTHON_312", "CPP_17"]);
  });

  it("follows the leading three with the rest in registry order", () => {
    expect(orderLanguages(["GO_123", "CPP_17", "JAVA_8", "PYTHON_312", "C_17", "JAVA_21"])).toEqual([
      "JAVA_21",
      "PYTHON_312",
      "CPP_17",
      "JAVA_8",
      "C_17",
      "GO_123",
    ]);
  });

  it("offers every allowed language exactly once and nothing the problem does not allow", () => {
    const all = orderLanguages(LANGUAGE_IDS);
    expect(all).toHaveLength(LANGUAGE_IDS.length);
    expect(new Set(all)).toEqual(new Set(LANGUAGE_IDS));
    expect(orderLanguages(["CPP_17", "C_17"])).toEqual(["CPP_17", "C_17"]);
    expect(orderLanguages(["PYTHON_312", "PYTHON_312"])).toEqual(["PYTHON_312"]);
  });

  it("returns nothing for a problem that allows nothing", () => {
    expect(orderLanguages([])).toEqual([]);
  });
});
