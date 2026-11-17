import { describe, expect, it } from "vitest";

import {
  errorOutputOf,
  errorTextSegments,
  mapDiagnostics,
  parseDiagnostics,
} from "@/components/contest/editor/decorations/diagnostics";
import { runDiagnostics, type RunRecord } from "@/components/contest/editor/decorations/run-diagnostics";

/**
 * Compile and runtime errors from the judge, as editor line marks and as clickable references.
 * The sample outputs are the formats the judge's own toolchains print (worker/runner.ts writes the
 * student's code verbatim to /work/Main.java, /work/main.cpp and /work/main.py).
 */

const JAVAC = [
  "/work/Main.java:5: error: ';' expected",
  "        int x = 3",
  "                 ^",
  "/work/Main.java:9: error: cannot find symbol",
  "        foo(x);",
  "        ^",
  "  symbol:   method foo(int)",
  "2 errors",
].join("\n");

const JAVA_RUNTIME = [
  'Exception in thread "main" java.lang.ArrayIndexOutOfBoundsException: Index 3 out of bounds for length 3',
  "\tat Main.solve(Main.java:14)",
  "\tat Main.main(Main.java:6)",
].join("\n");

const GCC = [
  "/work/main.cpp: In function 'int main()':",
  "/work/main.cpp:7:5: error: 'cot' was not declared in this scope",
  "    7 |     cot << x;",
  "      |     ^~~",
  "/usr/include/c++/14/bits/stl_vector.h:120:3: note: something",
  "/work/main.cpp:9:12: warning: unused variable 'y' [-Wunused-variable]",
].join("\n");

const PY_RUNTIME = [
  "Traceback (most recent call last):",
  '  File "/work/main.py", line 12, in <module>',
  "    main()",
  '  File "/work/main.py", line 8, in main',
  "    print(xs[3])",
  "IndexError: list index out of range",
].join("\n");

const PY_SYNTAX = [
  '  File "main.py", line 3',
  "    if x == 1",
  "             ^",
  "SyntaxError: expected ':'",
].join("\n");

describe("parseDiagnostics", () => {
  it("reads javac's lines, messages and caret columns", () => {
    expect(parseDiagnostics("JAVA_21", JAVAC)).toEqual([
      { line: 5, column: 18, message: "error: ';' expected" },
      { line: 9, column: 9, message: "error: cannot find symbol" },
    ]);
  });

  it("puts a Java runtime exception on the first frame in Main.java", () => {
    expect(parseDiagnostics("JAVA_17", JAVA_RUNTIME)).toEqual([
      {
        line: 14,
        column: null,
        message: "java.lang.ArrayIndexOutOfBoundsException: Index 3 out of bounds for length 3",
      },
    ]);
  });

  it("reads g++ errors and warnings in main.cpp and skips system headers and notes", () => {
    expect(parseDiagnostics("CPP_17", GCC)).toEqual([
      { line: 7, column: 5, message: "error: 'cot' was not declared in this scope" },
      { line: 9, column: 12, message: "warning: unused variable 'y' [-Wunused-variable]" },
    ]);
  });

  it("reads gcc for C as well", () => {
    expect(parseDiagnostics("C_17", "/work/main.c:3:1: error: expected ';'")).toEqual([
      { line: 3, column: 1, message: "error: expected ';'" },
    ]);
  });

  it("takes the last traceback frame in main.py and the final error line", () => {
    expect(parseDiagnostics("PYTHON_312", PY_RUNTIME)).toEqual([
      { line: 8, column: null, message: "IndexError: list index out of range" },
    ]);
  });

  it("reads a Python syntax error from the compile check", () => {
    expect(parseDiagnostics("PYTHON_312", PY_SYNTAX)).toEqual([
      { line: 3, column: null, message: "SyntaxError: expected ':'" },
    ]);
  });

  it("returns nothing for output with no line, and for languages it does not read", () => {
    expect(parseDiagnostics("JAVA_21", "Compilation failed")).toEqual([]);
    expect(parseDiagnostics("GO_123", "./main.go:3:1: syntax error")).toEqual([]);
  });
});

describe("errorOutputOf", () => {
  it("prefers the compiler output, then a sample CE row, then a sample RE row", () => {
    const rows = [
      { verdict: "RE", isSample: true, diffSnippet: "re" },
      { verdict: "CE", isSample: true, diffSnippet: "ce" },
    ];
    expect(errorOutputOf("javac says", rows)).toBe("javac says");
    expect(errorOutputOf(null, rows)).toBe("ce");
    expect(errorOutputOf(null, rows.slice(0, 1))).toBe("re");
  });

  it("never reads a hidden test's row", () => {
    expect(errorOutputOf(null, [{ verdict: "RE", isSample: false, diffSnippet: "leak" }])).toBeNull();
  });
});

describe("mapDiagnostics", () => {
  const before = "a\nb\nc\nd";
  const items = [
    { line: 1, column: null, message: "one" },
    { line: 3, column: null, message: "three" },
  ];

  it("keeps marks when nothing changed", () => {
    expect(mapDiagnostics(items, before, before)).toBe(items);
  });

  it("shifts marks below an inserted line", () => {
    expect(mapDiagnostics(items, before, "a\nnew\nb\nc\nd").map((item) => item.line)).toEqual([1, 4]);
  });

  it("drops the mark on a line the student edited", () => {
    expect(mapDiagnostics(items, before, "a\nb\nc fixed\nd").map((item) => item.line)).toEqual([1]);
  });
});

describe("errorTextSegments", () => {
  it("links javac references and keeps the text intact", () => {
    const segments = errorTextSegments("JAVA_21", JAVAC);
    expect(segments.map((segment) => segment.text).join("")).toBe(JAVAC);
    expect(segments.filter((segment) => segment.target !== null).map((segment) => segment.text)).toEqual([
      "Main.java:5",
      "Main.java:9",
    ]);
  });

  it("gives a javac reference the column of javac's caret", () => {
    const targets = errorTextSegments("JAVA_21", JAVAC).flatMap((segment) =>
      segment.target === null ? [] : [segment.target],
    );
    expect(targets).toEqual([
      { line: 5, column: 18 },
      { line: 9, column: 9 },
    ]);
  });

  it("links Java stack frames", () => {
    const targets = errorTextSegments("JAVA_21", JAVA_RUNTIME).flatMap((segment) =>
      segment.target === null ? [] : [segment.target.line],
    );
    expect(targets).toEqual([14, 6]);
  });

  it("links g++ references with their columns and leaves headers alone", () => {
    const targets = errorTextSegments("CPP_17", GCC).flatMap((segment) =>
      segment.target === null ? [] : [segment.target],
    );
    expect(targets).toEqual([
      { line: 7, column: 5 },
      { line: 9, column: 12 },
    ]);
  });

  it("links 'line N' only in frames of the student's file", () => {
    const text = `${PY_RUNTIME}\n  File "/usr/lib/python3.12/x.py", line 40, in f`;
    const segments = errorTextSegments("PYTHON_312", text);
    expect(segments.map((segment) => segment.text).join("")).toBe(text);
    expect(segments.filter((segment) => segment.target !== null).map((segment) => segment.text)).toEqual([
      "line 12",
      "line 8",
    ]);
  });

  it("returns the text whole for a language it does not read", () => {
    expect(errorTextSegments("GO_123", "main.go:3")).toEqual([{ text: "main.go:3", target: null }]);
  });
});

describe("runDiagnostics", () => {
  const empty: RunRecord = { source: null, language: null, compileError: null, results: [] };
  const samples: RunRecord = {
    source: "class Main {\n  int x = 3\n}",
    language: "JAVA_21",
    compileError: null,
    results: [{ verdict: "CE", isSample: true, diffSnippet: "Main.java:2: error: ';' expected" }],
  };

  it("marks the shown run's errors against the code it was sent with", () => {
    expect(
      runDiagnostics({ shown: "samples", busy: false, editorLanguage: "JAVA_21", samples, judged: empty }),
    ).toEqual({ source: samples.source, items: [{ line: 2, column: null, message: "error: ';' expected" }] });
  });

  it("clears while the next run is in flight, and after a language switch", () => {
    expect(runDiagnostics({ shown: "samples", busy: true, editorLanguage: "JAVA_21", samples, judged: empty })).toBeNull();
    expect(
      runDiagnostics({ shown: "samples", busy: false, editorLanguage: "PYTHON_312", samples, judged: empty }),
    ).toBeNull();
    expect(runDiagnostics({ shown: "judged", busy: false, editorLanguage: "JAVA_21", samples, judged: empty })).toBeNull();
    expect(runDiagnostics({ shown: null, busy: false, editorLanguage: "JAVA_21", samples, judged: empty })).toBeNull();
  });
});
