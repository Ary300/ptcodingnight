import { describe, expect, it } from "vitest";

import { compileHint } from "@/components/contest/verdict/compile-hint";

/**
 * The compiler output these strings came from was produced by the real judge on 2026-11-16, from
 * code shaped the way an IDE writes it.
 */

const WRONG_NAME =
  "/work/Main.java:1: error: class Solution is public, should be declared in a file named Solution.java\npublic class Solution {";

describe("compileHint", () => {
  it("tells a Java student to rename a public class to Main", () => {
    expect(compileHint("JAVA_21", WRONG_NAME, "public class Solution {}")).toBe(
      "Rename the class Solution to Main. The judge saves your code as Main.java, so the public class must be called Main.",
    );
  });

  it("explains the bare 'Compilation failed' a package line produces", () => {
    expect(
      compileHint("JAVA_21", "Compilation failed", "package com.example;\n\npublic class Main {}"),
    ).toMatch(/^Delete the package line/);
  });

  it("stays quiet for every other compile error, and for other languages", () => {
    expect(compileHint("JAVA_21", "error: ';' expected", "public class Main {}")).toBeNull();
    expect(compileHint("CPP_17", WRONG_NAME, "package x;")).toBeNull();
    expect(compileHint("JAVA_21", null, "package x;")).toBeNull();
  });
});
