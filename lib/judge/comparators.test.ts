import { afterEach, describe, expect, it } from "vitest";

import {
  clearSpecialCheckers,
  matches,
  registerSpecialChecker,
  UnknownCheckerError,
} from "@/lib/judge/comparators";

afterEach(() => {
  clearSpecialCheckers();
});

describe("whitespace comparator (the default)", () => {
  const ws = { kind: "whitespace" } as const;

  it("accepts a missing trailing newline", () => {
    // The single most common way a correct solution gets wrongly rejected.
    expect(matches(ws, "5", "5\n")).toBe(true);
  });

  it("accepts extra trailing newlines", () => {
    expect(matches(ws, "5\n\n\n", "5\n")).toBe(true);
  });

  it("accepts trailing spaces at end of line", () => {
    expect(matches(ws, "5   \n", "5\n")).toBe(true);
  });

  it("accepts CRLF line endings", () => {
    expect(matches(ws, "1\r\n2\r\n", "1\n2\n")).toBe(true);
  });

  it("still rejects a genuinely different answer", () => {
    expect(matches(ws, "6\n", "5\n")).toBe(false);
  });

  it("does NOT ignore leading whitespace, which can be part of the answer", () => {
    expect(matches(ws, "  5\n", "5\n")).toBe(false);
  });

  it("does not ignore differences in interior blank lines", () => {
    expect(matches(ws, "1\n\n2\n", "1\n2\n")).toBe(false);
  });
});

describe("exact comparator", () => {
  const exact = { kind: "exact" } as const;

  it("requires byte equality", () => {
    expect(matches(exact, "5\n", "5\n")).toBe(true);
    expect(matches(exact, "5", "5\n")).toBe(false);
  });
});

describe("float comparator", () => {
  const float = { kind: "float", epsilon: 1e-6 } as const;

  it("accepts values within epsilon", () => {
    expect(matches(float, "3.1415926", "3.1415927")).toBe(true);
  });

  it("rejects values outside epsilon", () => {
    expect(matches(float, "3.14", "3.15")).toBe(false);
  });

  it("compares token counts", () => {
    expect(matches(float, "1.0 2.0", "1.0")).toBe(false);
  });

  it("compares non-numeric tokens exactly", () => {
    expect(matches(float, "yes 1.0", "yes 1.0")).toBe(true);
    expect(matches(float, "no 1.0", "yes 1.0")).toBe(false);
  });

  it("rejects a non-numeric token where a number is expected", () => {
    expect(matches(float, "abc", "1.0")).toBe(false);
  });

  it("rejects infinity as a way to satisfy any tolerance", () => {
    expect(matches(float, "Infinity", "1.0")).toBe(false);
  });
});

describe("special comparator", () => {
  const special = { kind: "special", checkerRef: "multi-answer" } as const;

  it("defers to the registered checker", () => {
    registerSpecialChecker("multi-answer", (actual) => actual.trim().length > 0);
    expect(matches(special, "any non-empty", "ignored")).toBe(true);
    expect(matches(special, "   ", "ignored")).toBe(false);
  });

  it("passes the test input through to the checker", () => {
    registerSpecialChecker("multi-answer", (_actual, input) => input === "2 3\n");
    expect(matches(special, "whatever", "ignored", "2 3\n")).toBe(true);
  });

  it("throws rather than silently failing everyone when the checker is missing", () => {
    // Returning false here would present a configuration mistake as a hard problem, and
    // every student would lose the points without anyone noticing.
    expect(() => matches(special, "x", "y")).toThrow(UnknownCheckerError);
  });
});
