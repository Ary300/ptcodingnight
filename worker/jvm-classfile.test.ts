import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { canRecurse, ClassFormatError, parseClass } from "./jvm-classfile";

/**
 * Real class files, compiled by the judge's own javac flags (fixtures/judge/classfiles/compile.sh),
 * so this exercises the parser against what javac actually emits — lambdas, string concatenation,
 * bridge methods and nest members included.
 */
const DIR = path.join(process.cwd(), "fixtures", "judge", "classfiles");

function classesOf(name: string) {
  const dir = path.join(DIR, name);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".class"))
    .map((f) => parseClass(readFileSync(path.join(dir, f))));
}

describe("canRecurse", () => {
  it.each([
    ["plain", false],
    ["comparator", false],
    // The editor starter every student begins from: a static nextToken() helper beside
    // StringTokenizer.nextToken() must not read as recursion, or no starter-based submission
    // would ever use the harness.
    ["starter", false],
    ["direct", true],
    ["mutual", true],
    ["lambda-field", true],
    ["foreach-dfs", true],
    ["tostring-chain", true],
    ["student-interface", true],
  ])("%s -> %s", (name, expected) => {
    expect(canRecurse(classesOf(name))).toBe(expected);
  });
});

describe("parseClass", () => {
  it("reads the methods and the calls they make", () => {
    const [main] = classesOf("direct");
    const fact = main?.methods.find((m) => m.name === "fact");
    expect(fact?.descriptor).toBe("(I)J");
    expect(fact?.calls.some((c) => c.owner === "Main" && c.name === "fact")).toBe(true);
  });

  it("refuses something that is not a class file", () => {
    expect(() => parseClass(Buffer.from("not a class"))).toThrow(ClassFormatError);
    expect(() => parseClass(Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0, 0]))).toThrow(ClassFormatError);
  });
});
