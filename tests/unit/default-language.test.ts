import { describe, expect, it } from "vitest";

import { defaultLanguageFor, initialLanguageFor } from "@/components/contest/problem/default-language";

describe("defaultLanguageFor", () => {
  it("opens in Java 21 when the problem offers it, wherever it sits in the list", () => {
    expect(defaultLanguageFor(["PYTHON_312", "JAVA_21", "CPP_17"])).toBe("JAVA_21");
  });

  it("falls back to the first allowed language when Java is not offered", () => {
    expect(defaultLanguageFor(["PYTHON_312", "CPP_17"])).toBe("PYTHON_312");
  });

  it("uses Java while the problem is still loading", () => {
    expect(defaultLanguageFor(undefined)).toBe("JAVA_21");
  });
});

describe("initialLanguageFor", () => {
  it("opens in the language the student last picked when the problem offers it", () => {
    expect(initialLanguageFor(["PYTHON_312", "JAVA_21", "CPP_17"], "PYTHON_312")).toBe("PYTHON_312");
  });

  it("ignores a remembered language the problem does not offer, or junk", () => {
    expect(initialLanguageFor(["PYTHON_312", "JAVA_21"], "CPP_17")).toBe("JAVA_21");
    expect(initialLanguageFor(["PYTHON_312", "JAVA_21"], "not-a-language")).toBe("JAVA_21");
  });

  it("defaults to Java when nothing is remembered", () => {
    expect(initialLanguageFor(["PYTHON_312", "JAVA_21", "CPP_17"], null)).toBe("JAVA_21");
  });
});
