import { describe, expect, it } from "vitest";

import { resultsSummary } from "@/components/contest/problem/results-summary";
import { runDiagnostics } from "@/components/contest/editor/decorations/run-diagnostics";
import { toRunSamplesResponse } from "@/lib/contest/serialize";
import { RunSamplesResponseSchema } from "@/lib/schemas/api";

/**
 * Run examples on code that does not compile. The response used to carry the compiler's output on
 * a synthetic row with ordinal 0, which the wire schema rejects (ordinals are 1-based), so every
 * such run was a 400 "Too small: expected number to be >0" and the student saw no compiler output,
 * no line links and no gutter marks, in every language.
 */

const JAVAC = [
  "Main.java:7: error: ';' expected",
  "        int x = 1",
  "                 ^",
  "1 error",
].join("\n");

const CASES = [
  { testCaseId: "a", ordinal: 1, isSample: true },
  { testCaseId: "b", ordinal: 2, isSample: true },
] as const;

describe("toRunSamplesResponse", () => {
  it("answers a compile error with no rows and the compiler output in full", () => {
    const response = toRunSamplesResponse({ verdict: "CE", compileError: JAVAC, testResults: [] }, CASES);
    expect(response).toEqual({ results: [], compileError: JAVAC });
    expect(RunSamplesResponseSchema.safeParse(response).success).toBe(true);
  });

  it("does not cut a long compiler message to the 200-character diff cap", () => {
    const long = `${"main.cpp:3:13: error: expected primary-expression before ';' token\n".repeat(10)}`;
    const response = toRunSamplesResponse({ verdict: "CE", compileError: long, testResults: [] }, CASES);
    expect(response.compileError).toBe(long);
  });

  it("answers rows by ordinal with no compile error when the code compiled", () => {
    const response = toRunSamplesResponse(
      {
        verdict: "WA",
        compileError: null,
        testResults: [
          { testCaseId: "a", verdict: "AC", runtimeMs: 12, diffSnippet: null },
          { testCaseId: "b", verdict: "WA", runtimeMs: 15, diffSnippet: "- 3\n+ 4" },
        ],
      },
      CASES,
    );
    expect(response.compileError).toBeNull();
    expect(response.results.map((row) => [row.ordinal, row.verdict])).toEqual([
      [1, "AC"],
      [2, "WA"],
    ]);
  });
});

describe("a sample run that did not compile, on the page", () => {
  it("reads Did not compile in the Results header", () => {
    expect(
      resultsSummary({
        action: "samples",
        error: null,
        sampleBusy: false,
        sampleResults: [],
        sampleCompileError: JAVAC,
        submitBusy: false,
        judging: false,
        verdict: null,
      }),
    ).toBe("Did not compile");
  });

  it("marks the compiler's line in the editor", () => {
    const source = "public class Main {\n  public static void main(String[] a) {\n\n\n\n\n        int x = 1\n  }\n}\n";
    const marks = runDiagnostics({
      shown: "samples",
      busy: false,
      editorLanguage: "JAVA_21",
      samples: { source, language: "JAVA_21", compileError: JAVAC, results: [] },
      judged: { source: null, language: null, compileError: null, results: [] },
    });
    expect(marks?.items.map((item) => item.line)).toEqual([7]);
  });
});
