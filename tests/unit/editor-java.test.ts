import { describe, expect, it } from "vitest";

import { JAVA } from "@/components/contest/editor/smart/java";
import type { CompletionItem, LanguageProfile } from "@/components/contest/editor/smart/types";

const END = "$END$";

function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function allItems(): readonly (readonly [string, CompletionItem])[] {
  const members = Object.entries(JAVA.members).flatMap(([key, items]) =>
    items.map((item) => [key, item] as const),
  );
  return [...JAVA.globals.map((item) => ["(globals)", item] as const), ...members];
}

describe("JAVA profile", () => {
  it("satisfies LanguageProfile with IntelliJ's basics", () => {
    const profile: LanguageProfile = JAVA satisfies LanguageProfile;
    expect(profile.id).toBe("java");
    expect(profile.lineComment).toBe("//");
    expect(profile.indentUnit).toBe("    ");
    expect(profile.pairs).toEqual([
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ]);
    expect(profile.quotes).toEqual(['"', "'"]);
    expect(profile.dedentOnType).toEqual(["}"]);
  });

  it("opens a block after {, ( or [, ignoring trailing spaces and a line comment", () => {
    expect(JAVA.opensBlock("public static void main(String[] args) {")).toBe(true);
    expect(JAVA.opensBlock("    for (int i = 0; i < n; i++) {   ")).toBe(true);
    expect(JAVA.opensBlock("if (x > 0) { // positive")).toBe(true);
    expect(JAVA.opensBlock("int[] a = {")).toBe(true);
    expect(JAVA.opensBlock("foo(")).toBe(true);
    expect(JAVA.opensBlock("int[][] grid = new int[][] [")).toBe(true);
  });

  it("does not open a block on a closed or plain line", () => {
    expect(JAVA.opensBlock("System.out.println(x);")).toBe(false);
    expect(JAVA.opensBlock("}")).toBe(false);
    expect(JAVA.opensBlock("")).toBe(false);
    expect(JAVA.opensBlock("int x = 1; // {")).toBe(false);
    expect(JAVA.opensBlock('String s = "{";')).toBe(false);
  });

  it("treats // inside a string or char literal as code, not a comment", () => {
    expect(JAVA.opensBlock('if (url.equals("http://x")) {')).toBe(true);
    expect(JAVA.opensBlock("char c = '{';")).toBe(false);
    expect(JAVA.opensBlock('String q = "\\"//"; foo(')).toBe(true);
  });
});

describe("JAVA live templates", () => {
  it("gives every template exactly one $END$", () => {
    for (const template of JAVA.templates) {
      expect(countOf(template.body, END), template.abbreviation).toBe(1);
    }
  });

  it("has no duplicate abbreviations", () => {
    const names = JAVA.templates.map((t) => t.abbreviation);
    expect(new Set(names).size).toBe(names.length);
  });

  it("expands IntelliJ's abbreviations to IntelliJ's bodies", () => {
    const body = (abbreviation: string): string | undefined =>
      JAVA.templates.find((t) => t.abbreviation === abbreviation)?.body;
    expect(body("sout")).toBe("System.out.println($END$);");
    expect(body("souf")).toBe('System.out.printf("$END$");');
    expect(body("serr")).toBe("System.err.println($END$);");
    expect(body("psvm")).toBe("public static void main(String[] args) {\n    $END$\n}");
    expect(body("main")).toBe(body("psvm"));
    // Fields first (${n}), then $END$ on the indented line inside the braces, as IntelliJ's Tab walks them.
    // The index first, written three times and kept equal, then the bound, as IntelliJ's Tab walks them.
    expect(body("fori")).toBe("for (int ${1:i} = 0; ${1:i} < ${2}; ${1:i}++) {\n\t$END$\n}");
    // The iterable, element type and name are read from the file, never forced: typing replaces each.
    expect(body("foreach")).toBe("for (${2:$ELEMENT_TYPE$} ${3:$ELEMENT_NAME$} : ${1:$ITERABLE$}) {\n\t$END$\n}");
    expect(body("iter")).toBe(body("foreach"));
    expect(body("ifn")).toBe("if (${1:$VAR_REF$} == null) {\n\t$END$\n}");
    expect(body("inn")).toBe("if (${1:$VAR_REF$} != null) {\n\t$END$\n}");
    expect(body("soutv")).toContain("System.out.println(");
    expect(body("scanner")).toContain("Scanner sc = new Scanner(System.in);");
  });

  it("describes every template", () => {
    for (const template of JAVA.templates) {
      expect(template.description.trim(), template.abbreviation).not.toBe("");
    }
  });
});

describe("JAVA keywords", () => {
  it("includes the keywords and literals contest code uses", () => {
    for (const word of ["public", "static", "void", "int", "long", "for", "while", "new", "return"]) {
      expect(JAVA.keywords).toContain(word);
    }
    for (const literal of ["true", "false", "null"]) {
      expect(JAVA.keywords).toContain(literal);
    }
    expect(new Set(JAVA.keywords).size).toBe(JAVA.keywords.length);
  });
});

describe("JAVA completions", () => {
  it("offers the contest classes at top level", () => {
    const labels = JAVA.globals.map((item) => item.label);
    for (const name of [
      "String", "Integer", "Long", "Math", "Arrays", "Collections", "List", "ArrayList", "Map",
      "HashMap", "TreeMap", "Set", "HashSet", "TreeSet", "Deque", "ArrayDeque", "Queue",
      "LinkedList", "PriorityQueue", "StringBuilder", "Scanner", "BufferedReader",
      "InputStreamReader", "StringTokenizer", "PrintWriter", "System", "Character", "Boolean",
      "Double", "Comparator", "IOException",
    ]) {
      expect(labels, name).toContain(name);
    }
  });

  it("offers the expected members for each qualifier", () => {
    const labelsFor = (key: string): string[] =>
      (JAVA.members[key] ?? []).map((item) => item.insertText);
    expect(labelsFor("System")).toEqual(
      expect.arrayContaining(["out", "in", "err", "currentTimeMillis()"]),
    );
    expect(labelsFor("System.out")).toEqual(
      expect.arrayContaining(["println()", "print()", "printf()", "flush()"]),
    );
    expect(labelsFor("Math")).toEqual(
      expect.arrayContaining(["max()", "min()", "abs()", "pow()", "sqrt()", "floorMod()", "PI"]),
    );
    expect(labelsFor("Integer")).toEqual(
      expect.arrayContaining(["parseInt()", "MAX_VALUE", "MIN_VALUE", "bitCount()"]),
    );
    expect(labelsFor("*")).toEqual(
      expect.arrayContaining(["length()", "charAt()", "nextInt()", "hasMoreTokens()", "getOrDefault()"]),
    );
  });

  it("puts the caret inside the parentheses when the method takes arguments", () => {
    for (const [key, item] of allItems()) {
      const open = item.insertText.indexOf("(");
      if (open === -1) continue;
      const close = item.insertText.lastIndexOf(")");
      const takesArgs = /\([^)]+\)/.test(item.label);
      const caret = item.caretOffset ?? item.insertText.length;
      if (takesArgs) {
        expect(caret, `${key}: ${item.label}`).toBeGreaterThan(open);
        expect(caret, `${key}: ${item.label}`).toBeLessThanOrEqual(close);
      } else {
        expect(caret, `${key}: ${item.label}`).toBe(item.insertText.length);
      }
    }
  });

  it("places println's caret between its parentheses", () => {
    const println = JAVA.members["System.out"]?.find((item) => item.insertText === "println()");
    expect(println?.caretOffset).toBe("println(".length);
  });

  it("has no duplicate labels under any key", () => {
    const keys: [string, readonly CompletionItem[]][] = [
      ["(globals)", JAVA.globals],
      ...Object.entries(JAVA.members),
    ];
    for (const [key, items] of keys) {
      const labels = items.map((item) => item.label);
      expect(new Set(labels).size, key).toBe(labels.length);
    }
  });

  it("gives every item a return type or package as its detail", () => {
    for (const [key, item] of allItems()) {
      expect(item.detail?.trim() ?? "", `${key}: ${item.label}`).not.toBe("");
    }
  });
});
