import { describe, expect, it } from "vitest";

import { CPP } from "@/components/contest/editor/smart/cpp";
import type { CompletionItem, LanguageProfile } from "@/components/contest/editor/smart/types";

function allItems(): readonly (readonly [string, readonly CompletionItem[]])[] {
  return [["globals", CPP.globals], ...Object.entries(CPP.members)];
}

describe("CPP profile", () => {
  it("satisfies the LanguageProfile contract", () => {
    const profile: LanguageProfile = CPP satisfies LanguageProfile;
    expect(profile.id).toBe("cpp");
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

  describe("opensBlock", () => {
    it.each([
      "int main() {",
      "    for (int i = 0; i < n; i++) {",
      "    sort(",
      "    int a[] = {",
      "    vector<int> v = [",
      "if (x) {   ",
      "if (x) { // comment",
      "if (x) { /* a note */",
      "if (x) { /* a note */   ",
      "    foo(  // trailing",
    ])("indents after %j", (line) => {
      expect(CPP.opensBlock(line)).toBe(true);
    });

    it.each([
      "",
      "    ",
      "    return 0;",
      "}",
      "cout << x << '\\n';",
      "// just a comment {",
      "/* block { */",
      'string s = "{";',
      "char c = '(';",
      'cout << "http://x{" << y;',
      "x = 1; /* { */ y = 2;",
      "    int x; /* unterminated {",
    ])("does not indent after %j", (line) => {
      expect(CPP.opensBlock(line)).toBe(false);
    });

    it("sees through a // inside a string before a real opener", () => {
      expect(CPP.opensBlock('if (s == "a//b") {')).toBe(true);
    });

    it("handles an escaped quote inside a string", () => {
      expect(CPP.opensBlock('if (s == "\\"") {')).toBe(true);
      expect(CPP.opensBlock('s = "\\" {";')).toBe(false);
    });
  });

  describe("live templates", () => {
    it("has the CLion contest abbreviations", () => {
      expect(CPP.templates.map((t) => t.abbreviation).sort()).toEqual(
        [
          "main", "fastio", "for", "fori", "forr", "foreach", "iter", "cout", "cin", "vi", "ll", "inc",
          // CLion's statement and type templates.
          "if", "else", "while", "do", "switch", "cerr", "struct", "class",
        ].sort(),
      );
    });

    it("never repeats an abbreviation", () => {
      const names = CPP.templates.map((t) => t.abbreviation);
      expect(new Set(names).size).toBe(names.length);
    });

    it.each(CPP.templates.map((t) => [t.abbreviation, t.body] as const))(
      "%s has exactly one $END$",
      (_abbreviation, body) => {
        expect(body.split("$END$").length - 1).toBe(1);
      },
    );

    it("cout prints a literal backslash n inside the quotes", () => {
      const cout = CPP.templates.find((t) => t.abbreviation === "cout");
      expect(cout?.body).toBe("cout << $END$ << '" + "\\" + "n';");
      expect(cout?.body).toContain("'\\n'");
      expect(cout?.body.includes("\n")).toBe(false);
    });

    it("writes main with a four-space body and return 0", () => {
      const main = CPP.templates.find((t) => t.abbreviation === "main");
      expect(main?.body).toBe("int main() {\n    $END$\n    return 0;\n}");
    });

    it("writes the remaining bodies exactly", () => {
      const body = (a: string): string | undefined =>
        CPP.templates.find((t) => t.abbreviation === a)?.body;
      expect(body("fastio")).toBe("ios::sync_with_stdio(false);\ncin.tie(nullptr);$END$");
      expect(body("fori")).toBe("for (int i = 0; i < ${1}; i++) {\n\t$END$\n}");
      // CLion's names: `for` counts up, `forr` counts down, `foreach` and `iter` walk a range.
      expect(body("for")).toBe("for (int i = 0; i < ${1:n}; ++i) {\n\t$END$\n}");
      expect(body("forr")).toBe("for (int i = ${1:n} - 1; i >= 0; --i) {\n\t$END$\n}");
      expect(body("foreach")).toBe("for (auto &${2:x} : ${1}) {\n\t$END$\n}");
      expect(body("iter")).toBe("for (auto &${2:x} : ${1}) {\n\t$END$\n}");
      expect(body("cin")).toBe("cin >> $END$;");
      expect(body("vi")).toBe("vector<int> $END$;");
      expect(body("ll")).toBe("long long $END$;");
      expect(body("inc")).toBe("#include <$END$>");
    });
  });

  describe("keywords", () => {
    it("covers C++17 and the literal keywords", () => {
      for (const k of ["true", "false", "nullptr", "constexpr", "decltype", "auto", "static_assert"]) {
        expect(CPP.keywords).toContain(k);
      }
    });

    it("has no duplicates", () => {
      expect(new Set(CPP.keywords).size).toBe(CPP.keywords.length);
    });
  });

  describe("completion tables", () => {
    it("offers the contest names at top level", () => {
      const labels = CPP.globals.map((g) => g.insertText);
      for (const name of [
        "cout",
        "cin",
        "vector",
        "unordered_map",
        "priority_queue",
        "sort()",
        "lower_bound()",
        "long long",
        "size_t",
        "INT_MAX",
        "LLONG_MAX",
        "greater",
        "std",
      ]) {
        expect(labels).toContain(name);
      }
    });

    it("offers std names after std::, without macros or std itself", () => {
      const std = CPP.members.std?.map((m) => m.insertText) ?? [];
      expect(std).toContain("vector");
      expect(std).toContain("sort()");
      expect(std).toContain("cout");
      expect(std).not.toContain("std");
      expect(std).not.toContain("INT_MAX");
      expect(std).not.toContain("long long");
    });

    it("offers container members after any qualifier", () => {
      const any = CPP.members["*"]?.map((m) => m.label) ?? [];
      for (const name of ["size()", "push_back()", "first", "second", "c_str()", "top()"]) {
        expect(any).toContain(name);
      }
    });

    it.each(allItems())("%s has no duplicate labels", (_name, items) => {
      const labels = items.map((i) => i.label);
      expect(new Set(labels).size).toBe(labels.length);
    });

    it.each(allItems())("%s has caret offsets inside the inserted text", (_name, items) => {
      for (const item of items) {
        if (item.caretOffset === undefined) continue;
        expect(Number.isInteger(item.caretOffset)).toBe(true);
        expect(item.caretOffset).toBeGreaterThanOrEqual(0);
        expect(item.caretOffset).toBeLessThanOrEqual(item.insertText.length);
      }
    });

    it("puts the caret between the parentheses of a call that takes arguments", () => {
      const sort = CPP.globals.find((g) => g.label === "sort()");
      expect(sort?.caretOffset).toBe("sort(".length);
      const pushBack = CPP.members["*"]?.find((m) => m.label === "push_back()");
      expect(pushBack?.caretOffset).toBe("push_back(".length);
      const size = CPP.members["*"]?.find((m) => m.label === "size()");
      expect(size?.caretOffset).toBeUndefined();
    });
  });
});
