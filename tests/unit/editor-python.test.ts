import { describe, expect, it } from "vitest";

import { PYTHON } from "@/components/contest/editor/smart/python";
import type { CompletionItem, LanguageProfile } from "@/components/contest/editor/smart/types";

/**
 * The Python profile is data plus one predicate. These tests pin the shape the engine and the
 * completion module rely on: one caret marker per template, caret offsets inside the inserted
 * text, and labels a student can tell apart in the popup.
 */

const END = "$END$";

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function allItems(profile: LanguageProfile): readonly CompletionItem[] {
  return [...profile.globals, ...Object.values(profile.members).flat()];
}

describe("PYTHON profile", () => {
  it("satisfies the LanguageProfile contract with PyCharm's basics", () => {
    const profile: LanguageProfile = PYTHON;
    expect(profile.id).toBe("python");
    expect(profile.lineComment).toBe("#");
    expect(profile.indentUnit).toBe("    ");
    expect(profile.pairs).toEqual([
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ]);
    expect(profile.quotes).toEqual(['"', "'"]);
    expect(profile.dedentOnType).toEqual([]);
  });

  describe("opensBlock", () => {
    it.each([
      "if x > 0:",
      "for i in range(n):",
      "    while True:",
      "def solve():",
      "class Node:",
      "else:",
      "if x:  # positive",
      "nums = [",
      "print(",
      "d = {",
      "total = sum(  # all of them",
      'if s == "#":',
    ])("opens a block after %j", (line) => {
      expect(PYTHON.opensBlock(line)).toBe(true);
    });

    it.each([
      "",
      "    ",
      "x = 1",
      "print(x)",
      "# if x:",
      "x = 1  # note:",
      "nums = [1, 2]",
      "a[1:",
      "d = {k:",
      's = "a:"',
      "s = 'ends with ('",
    ])("does not open a block after %j", (line) => {
      expect(PYTHON.opensBlock(line)).toBe(false);
    });
  });

  describe("templates", () => {
    it("each body carries exactly one $END$", () => {
      for (const template of PYTHON.templates) {
        expect(countOccurrences(template.body, END), template.abbreviation).toBe(1);
      }
    });

    it("abbreviations are unique identifiers with a description", () => {
      const abbreviations = PYTHON.templates.map((t) => t.abbreviation);
      expect(new Set(abbreviations).size).toBe(abbreviations.length);
      for (const template of PYTHON.templates) {
        expect(template.abbreviation).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
        expect(template.description.trim()).not.toBe("");
      }
    });

    it("expands the contest templates to PyCharm's bodies", () => {
      const body = (abbreviation: string): string | undefined =>
        PYTHON.templates.find((t) => t.abbreviation === abbreviation)?.body;
      expect(body("main")).toBe('if __name__ == "__main__":\n    $END$');
      expect(body("for")).toBe("for $END$ in :");
      expect(body("fori")).toBe("for i in range($END$):");
      expect(body("def")).toBe("def $END$():");
      expect(body("inp")?.replace(END, "")).toBe("input()");
      expect(body("readints")?.replace(END, "")).toBe("list(map(int, input().split()))");
      expect(body("sysin")?.replace(END, "")).toBe("import sys\ninput = sys.stdin.readline");
      expect(body("prt")).toBe("print($END$)");
    });

    it("indents template bodies with the profile's indent unit, never tabs", () => {
      for (const template of PYTHON.templates) {
        expect(template.body).not.toContain("\t");
      }
    });
  });

  describe("keywords", () => {
    it("lists every Python 3.12 keyword, True, False and None included", () => {
      const expected = [
        "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class",
        "continue", "def", "del", "elif", "else", "except", "finally", "for", "from", "global",
        "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return",
        "try", "while", "with", "yield",
      ];
      expect([...PYTHON.keywords].sort()).toEqual([...expected].sort());
      expect(new Set(PYTHON.keywords).size).toBe(PYTHON.keywords.length);
    });
  });

  describe("completions", () => {
    it("every caretOffset lies within its insertText", () => {
      for (const item of allItems(PYTHON)) {
        if (item.caretOffset === undefined) continue;
        expect(item.caretOffset, item.label).toBeGreaterThanOrEqual(0);
        expect(item.caretOffset, item.label).toBeLessThanOrEqual(item.insertText.length);
      }
    });

    it("has no duplicate labels in globals or in any member list", () => {
      const lists: Record<string, readonly CompletionItem[]> = {
        globals: PYTHON.globals,
        ...PYTHON.members,
      };
      for (const [key, items] of Object.entries(lists)) {
        const labels = items.map((item) => item.label);
        expect(new Set(labels).size, key).toBe(labels.length);
      }
    });

    it("never inserts an empty string", () => {
      for (const item of allItems(PYTHON)) {
        expect(item.insertText.length, item.label).toBeGreaterThan(0);
        expect(item.label.length).toBeGreaterThan(0);
      }
    });

    it("offers the contest builtins call-style and the modules by name", () => {
      const byLabel = new Map(PYTHON.globals.map((item) => [item.label, item]));
      const printItem = byLabel.get("print()");
      expect(printItem?.insertText).toBe("print()");
      expect(printItem?.caretOffset).toBe("print(".length);
      expect(byLabel.get("len()")?.kind).toBe("function");
      for (const name of [
        "print", "input", "len", "range", "map", "filter", "zip", "sorted", "reversed", "sum",
        "min", "max", "abs", "enumerate", "any", "all", "ord", "chr", "divmod", "pow", "round",
        "isinstance",
      ]) {
        expect(byLabel.get(`${name}()`)?.insertText, name).toBe(`${name}()`);
      }
      for (const name of ["int", "str", "float", "list", "dict", "set", "tuple"]) {
        expect(byLabel.has(name), name).toBe(true);
      }
      for (const name of [
        "sys", "math", "collections", "itertools", "heapq", "bisect", "functools", "string",
      ]) {
        expect(byLabel.get(name)?.insertText, name).toBe(name);
      }
    });

    it("keys members by the qualifier a student types", () => {
      const names = (key: string): string[] =>
        (PYTHON.members[key] ?? []).map((item) => item.insertText.replace(/\(\)$/, ""));
      expect(names("math")).toEqual([
        "sqrt", "floor", "ceil", "gcd", "lcm", "inf", "pi", "isqrt", "comb", "perm", "log", "log2",
      ]);
      expect(names("sys")).toEqual(["stdin", "stdout", "setrecursionlimit", "maxsize"]);
      expect(names("sys.stdin")).toEqual(["readline", "read", "readlines"]);
      expect(names("collections")).toEqual(["Counter", "defaultdict", "deque", "OrderedDict"]);
      expect(names("heapq")).toEqual(["heappush", "heappop", "heapify", "nlargest", "nsmallest"]);
      expect(names("bisect")).toEqual(["bisect_left", "bisect_right", "insort"]);
      expect(names("itertools")).toEqual([
        "permutations", "combinations", "accumulate", "product", "groupby",
      ]);
      expect(names("functools")).toEqual(["lru_cache", "cache", "reduce"]);
      expect(names("*")).toEqual([
        "split", "strip", "join", "append", "pop", "sort", "count", "index", "insert", "extend",
        "keys", "values", "items", "get", "add", "remove", "discard", "upper", "lower", "replace",
        "startswith", "endswith", "find", "isdigit", "isalpha", "format", "appendleft", "popleft",
        "most_common",
      ]);
    });

    it("leaves the caret between the parentheses only when the call takes arguments", () => {
      const find = (key: string, label: string): CompletionItem | undefined =>
        PYTHON.members[key]?.find((item) => item.label === label);
      expect(find("*", "append()")?.caretOffset).toBe("append(".length);
      expect(find("*", "split()")?.caretOffset).toBe("split()".length);
      expect(find("sys.stdin", "readline()")?.caretOffset).toBe("readline()".length);
      expect(find("math", "sqrt()")?.caretOffset).toBe("sqrt(".length);
    });
  });
});
