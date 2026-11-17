import { describe, expect, it } from "vitest";

import { bracketMatchAt, pairBrackets } from "@/components/contest/editor/decorations/brackets";
import { buildMarks, lineGlyphRange } from "@/components/contest/editor/decorations/build-marks";
import { charKinds, isCode } from "@/components/contest/editor/decorations/char-kinds";
import { offsetOfLineColumn } from "@/components/contest/editor/decorations/goto";
import { indentGuides, indentWidth } from "@/components/contest/editor/decorations/indent-guides";
import { segmentTokens, type Mark } from "@/components/contest/editor/decorations/marks";
import {
  identifierAt,
  textOccurrences,
  usageRanges,
  wordOccurrences,
} from "@/components/contest/editor/decorations/occurrences";
import { tokenize } from "@/components/contest/editor/highlight";
import type { Language } from "@/lib/schemas/judge";

/**
 * The on-screen marks: matched and unmatched brackets, usages, indent guides, and the token
 * splitting that draws them without moving a glyph.
 */

function setup(source: string, language: Language = "JAVA_21") {
  const tokens = tokenize(source, language);
  const kinds = charKinds(tokens, source.length);
  return { tokens, kinds, pairs: pairBrackets(source, kinds) };
}

describe("charKinds", () => {
  it("marks strings and comments as not code", () => {
    const source = 'int a = 1; // }\nString s = "{";';
    const { kinds } = setup(source);
    expect(isCode(kinds, source.indexOf("int"))).toBe(true);
    expect(isCode(kinds, source.indexOf("}"))).toBe(false);
    expect(isCode(kinds, source.indexOf("{"))).toBe(false);
  });
});

describe("pairBrackets", () => {
  it("pairs nested brackets of every kind", () => {
    const source = "f(a[1], {b});";
    const { pairs } = setup(source);
    expect(pairs.partner.get(1)).toBe(source.lastIndexOf(")"));
    expect(pairs.partner.get(source.indexOf("["))).toBe(source.indexOf("]"));
    expect(pairs.partner.get(source.indexOf("}"))).toBe(source.indexOf("{"));
    expect(pairs.unmatched).toEqual([]);
  });

  it("ignores brackets inside strings and comments", () => {
    const source = 'if (s.equals("(")) { // )\n}';
    const { pairs } = setup(source);
    expect(pairs.unmatched).toEqual([]);
    expect(pairs.partner.get(source.indexOf("{"))).toBe(source.lastIndexOf("}"));
  });

  it("reports a stray closer and leaves the blocks above it paired", () => {
    const source = "class A {\n  void f() {\n  }\n}\n}";
    const { pairs } = setup(source);
    expect(pairs.unmatched).toEqual([source.length - 1]);
    expect(pairs.partner.get(source.indexOf("{"))).toBe(source.length - 3);
  });

  it("reports an opener never closed by the end of the file", () => {
    const source = "class A {\n  void f() {\n  }\n";
    const { pairs } = setup(source);
    expect(pairs.unmatched).toEqual([source.indexOf("{")]);
  });

  it("blames the unclosed '(' inside a closed block, not the block", () => {
    const source = "{ f( }";
    const { pairs } = setup(source);
    expect(pairs.unmatched).toEqual([source.indexOf("(")]);
    expect(pairs.partner.get(0)).toBe(source.length - 1);
  });

  it("pairs Python brackets and skips '#' comments", () => {
    const source = "x = [1, (2)]  # ]\n";
    const { pairs } = setup(source, "PYTHON_312");
    expect(pairs.unmatched).toEqual([]);
  });
});

describe("bracketMatchAt", () => {
  const source = "f(a) {}";
  const { kinds, pairs } = setup(source);

  it("prefers the closer just before the caret", () => {
    expect(bracketMatchAt(source, kinds, pairs, 4)).toEqual({ at: 3, partner: 1 });
  });

  it("takes the opener just after the caret", () => {
    expect(bracketMatchAt(source, kinds, pairs, 1)).toEqual({ at: 1, partner: 3 });
  });

  it("takes an opener just before the caret ahead of a closer just after it", () => {
    expect(bracketMatchAt(source, kinds, pairs, 6)).toEqual({ at: 5, partner: 6 });
  });

  it("returns null away from brackets", () => {
    expect(bracketMatchAt("abc", setup("abc").kinds, setup("abc").pairs, 1)).toBeNull();
  });

  it("returns a null partner for an unmatched bracket", () => {
    const lone = "f(";
    const state = setup(lone);
    expect(bracketMatchAt(lone, state.kinds, state.pairs, 2)).toEqual({ at: 1, partner: null });
  });
});

describe("usages", () => {
  const source = 'int count = 0;\ncount++; // count\nString s = "count";\nint counter = count;';
  const { kinds } = setup(source);

  it("finds the name at the caret", () => {
    const at = source.indexOf("count") + 2;
    expect(identifierAt(source, kinds, at)).toEqual({ from: 4, to: 9 });
  });

  it("refuses keywords, numbers and comments", () => {
    expect(identifierAt(source, kinds, 1)).toBeNull();
    expect(identifierAt(source, kinds, source.indexOf("0") + 1)).toBeNull();
    expect(identifierAt(source, kinds, source.indexOf("// count") + 5)).toBeNull();
  });

  it("matches whole words in code only", () => {
    const ranges = wordOccurrences(source, kinds, "count");
    expect(ranges.map((range) => source.slice(range.from - 1, range.to + 1))).toEqual([
      " count ",
      "\ncount+",
      " count;",
    ]);
  });

  it("finds every occurrence of the selected text, strings included", () => {
    expect(textOccurrences("abab ab", "ab")).toHaveLength(3);
  });

  it("highlights only when the name occurs more than once", () => {
    const lonely = "int unique = 1;";
    const state = setup(lonely);
    expect(usageRanges(lonely, state.kinds, 6, 6)).toEqual([]);
    expect(usageRanges(source, kinds, 6, 6)).toHaveLength(3);
  });

  it("ignores multi-line and one-character selections", () => {
    expect(usageRanges(source, kinds, 0, 20)).toEqual([]);
    expect(usageRanges(source, kinds, 4, 5)).toEqual([]);
    // A selection matches as text, so `counter` contains one too, as in IntelliJ.
    expect(usageRanges(source, kinds, 4, 9)).toHaveLength(6);
  });
});

describe("indent guides", () => {
  it("measures indents with tabs expanded and blanks as null", () => {
    expect(indentWidth("    x", 4)).toBe(4);
    expect(indentWidth("\t  x", 4)).toBe(6);
    expect(indentWidth("   ", 4)).toBeNull();
  });

  it("draws a guide per level through the lines deeper than it, across blank lines", () => {
    const source = [
      "class A {",
      "    void f() {",
      "        int a;",
      "",
      "        int b;",
      "    }",
      "}",
    ].join("\n");
    expect(indentGuides(source)).toEqual([{ column: 4, fromLine: 3, toLine: 5 }]);
  });

  it("does not extend a guide over a blank line that ends its block", () => {
    const source = ["def f():", "        x = 1", "", "y = 2"].join("\n");
    expect(indentGuides(source)).toEqual([{ column: 4, fromLine: 2, toLine: 2 }]);
  });
});

describe("segmentTokens", () => {
  const source = "int count = count + 1;";
  const tokens = tokenize(source, "JAVA_21");

  it("reproduces the source exactly whatever the marks", () => {
    const marks: Mark[] = [
      { from: 4, to: 9, kind: "usage" },
      { from: 6, to: 14, kind: "diagnostic" },
      { from: 12, to: 17, kind: "usage" },
    ];
    const segments = segmentTokens(tokens, marks);
    expect(segments.map((segment) => segment.value).join("")).toBe(source);
  });

  it("gives each piece every mark that covers it", () => {
    const segments = segmentTokens(tokens, [
      { from: 4, to: 9, kind: "usage" },
      { from: 6, to: 14, kind: "diagnostic" },
    ]);
    const covering = segments.filter((segment) => segment.marks.length > 0);
    expect(covering.map((segment) => [segment.value, segment.marks])).toEqual([
      ["co", ["usage"]],
      ["unt", ["usage", "diagnostic"]],
      [" ", ["diagnostic"]],
      ["=", ["diagnostic"]],
      [" co", ["diagnostic"]],
    ]);
  });

  it("leaves tokens alone when there are no marks", () => {
    expect(segmentTokens(tokens, []).length).toBe(tokens.length);
  });
});

describe("buildMarks", () => {
  const source = "void f() {\n    g(;\n}";
  const { kinds, pairs } = setup(source);
  const base = {
    source,
    kinds,
    pairs,
    selectionStart: source.indexOf("{") + 1,
    selectionEnd: source.indexOf("{") + 1,
    sourceSettled: true,
    selectionSettled: true,
    diagnostics: [],
  };

  it("marks the bracket beside the caret and its partner", () => {
    const marks = buildMarks(base).filter((mark) => mark.kind === "bracket-match");
    expect(marks.map((mark) => source[mark.from])).toEqual(["{", "}"]);
  });

  it("draws unmatched brackets only once the student pauses", () => {
    expect(buildMarks(base).some((mark) => mark.kind === "bracket-error")).toBe(true);
    expect(buildMarks({ ...base, sourceSettled: false }).some((mark) => mark.kind === "bracket-error")).toBe(false);
  });

  it("underlines an error line from its first glyph to its last", () => {
    const marks = buildMarks({ ...base, diagnostics: [{ line: 2, column: null, message: "x" }] });
    const line = marks.find((mark) => mark.kind === "diagnostic");
    expect(line === undefined ? "" : source.slice(line.from, line.to)).toBe("g(;");
  });

  it("finds a line's glyph range and refuses blank or missing lines", () => {
    expect(lineGlyphRange("a\n   \nb", 2)).toBeNull();
    expect(lineGlyphRange("a", 4)).toBeNull();
    expect(lineGlyphRange("  ab  \n", 1)).toEqual({ from: 2, to: 4 });
  });

  it("holds usages back until the caret rests", () => {
    const named = "int a = a;";
    const state = setup(named);
    const input = { ...base, source: named, kinds: state.kinds, pairs: state.pairs, selectionStart: 5, selectionEnd: 5 };
    expect(buildMarks(input).filter((mark) => mark.kind === "usage")).toHaveLength(2);
    expect(buildMarks({ ...input, selectionSettled: false }).filter((mark) => mark.kind === "usage")).toHaveLength(0);
  });
});

describe("offsetOfLineColumn", () => {
  const source = "class A {\n    int x;\n}";

  it("lands on the line's first glyph without a column", () => {
    expect(offsetOfLineColumn(source, 2, null)).toBe(source.indexOf("int"));
  });

  it("honours a 1-based column and clamps past the end", () => {
    expect(offsetOfLineColumn(source, 2, 9)).toBe(source.indexOf("x"));
    expect(offsetOfLineColumn(source, 2, 99)).toBe(source.indexOf("\n}"));
    expect(offsetOfLineColumn(source, 40, 1)).toBe(source.lastIndexOf("}"));
    expect(offsetOfLineColumn(source, 0, 1)).toBe(0);
  });
});
