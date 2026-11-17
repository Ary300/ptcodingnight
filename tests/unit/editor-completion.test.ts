import { describe, expect, it } from "vitest";

import {
  applyCompletion,
  camelHumpMatches,
  completionContext,
  completionsFor,
  expandTemplateBody,
} from "@/components/contest/editor/smart/completion";
import type {
  CompletionContext,
  CompletionItem,
  EditState,
  LanguageProfile,
} from "@/components/contest/editor/smart/types";

/**
 * Completion for the problem editor: the context at the caret, the ranked candidates and the edit
 * that accepting one performs. The profile below is deliberately small so every expected list can
 * be written out in full.
 */

const PROFILE: LanguageProfile = {
  id: "java",
  lineComment: "//",
  indentUnit: "    ",
  pairs: [
    ["(", ")"],
    ["{", "}"],
  ],
  quotes: ['"', "'"],
  opensBlock: (line) => line.trimEnd().endsWith("{"),
  dedentOnType: ["}"],
  templates: [
    { abbreviation: "sout", description: "Prints a line", body: "System.out.println($END$);" },
    {
      abbreviation: "fori",
      description: "Indexed for loop",
      body: "for (int i = 0; i < $END$; i++) {\n    \n}",
    },
  ],
  keywords: ["int", "if", "import", "private", "public", "return", "while"],
  globals: [
    { label: "String", insertText: "String", kind: "type", detail: "java.lang" },
    { label: "StringBuilder", insertText: "StringBuilder", kind: "type", detail: "java.lang" },
    { label: "Integer", insertText: "Integer", kind: "type", detail: "java.lang" },
    { label: "System", insertText: "System", kind: "type", detail: "java.lang" },
  ],
  members: {
    System: [
      { label: "out", insertText: "out", kind: "field", detail: "PrintStream" },
      { label: "in", insertText: "in", kind: "field", detail: "InputStream" },
    ],
    "System.out": [
      { label: "println(String x)", insertText: "println()", kind: "method", caretOffset: 8 },
      { label: "print(String x)", insertText: "print()", kind: "method", caretOffset: 6 },
      {
        label: "printf(String f, Object... a)",
        insertText: "printf()",
        kind: "method",
        caretOffset: 7,
      },
    ],
    Integer: [
      { label: "parseInt(String s)", insertText: "parseInt()", kind: "method", caretOffset: 9 },
      { label: "MAX_VALUE", insertText: "MAX_VALUE", kind: "field" },
      { label: "MIN_VALUE", insertText: "MIN_VALUE", kind: "field" },
    ],
    std: [
      { label: "sort", insertText: "sort()", kind: "function", caretOffset: 5 },
      { label: "string", insertText: "string", kind: "type" },
    ],
    "*": [
      { label: "length()", insertText: "length()", kind: "method" },
      { label: "size()", insertText: "size()", kind: "method" },
      { label: "print(Object o)", insertText: "print()", kind: "method", caretOffset: 6 },
    ],
  },
};

/** The text with "|" marking the caret, split into the text and the caret offset. */
function at(marked: string): { text: string; caret: number } {
  const caret = marked.indexOf("|");
  if (caret < 0) throw new Error(`no caret in ${marked}`);
  return { text: marked.slice(0, caret) + marked.slice(caret + 1), caret };
}

function contextOf(marked: string, lineComment?: string): CompletionContext | null {
  const { text, caret } = at(marked);
  return completionContext(text, caret, lineComment);
}

function labelsFor(marked: string, limit?: number): string[] {
  const { text, caret } = at(marked);
  const ctx = completionContext(text, caret, PROFILE.lineComment);
  if (ctx === null) throw new Error(`no completion context in ${marked}`);
  return completionsFor(ctx, text, PROFILE, limit).map((item) => item.label);
}

/** Applies the edit to the text, returning the new text with "|" at the new caret. */
function accept(marked: string, label: string): string {
  const { text, caret } = at(marked);
  const ctx = completionContext(text, caret, PROFILE.lineComment);
  if (ctx === null) throw new Error(`no completion context in ${marked}`);
  const item = completionsFor(ctx, text, PROFILE, 100).find((c) => c.label === label);
  if (item === undefined) throw new Error(`${label} not offered in ${marked}`);
  const state: EditState = { text, selectionStart: caret, selectionEnd: caret };
  const edit = applyCompletion(state, ctx, item);
  expect(edit.selectionStart).toBe(edit.selectionEnd);
  const next = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
  return next.slice(0, edit.selectionStart) + "|" + next.slice(edit.selectionStart);
}

describe("completionContext", () => {
  it("reads the identifier that ends at the caret, with no qualifier at the top level", () => {
    expect(contextOf("int co|")).toEqual({
      prefix: "co",
      replaceFrom: 4,
      replaceTo: 6,
      qualifier: null,
    });
  });

  it("only looks at the part of the identifier before the caret", () => {
    expect(contextOf("count|er = 1;")).toEqual({
      prefix: "count",
      replaceFrom: 0,
      replaceTo: 5,
      qualifier: null,
    });
  });

  it("measures offsets in the whole text, not the line", () => {
    const ctx = contextOf("int a;\nint b;\n    ret|");
    expect(ctx).toEqual({ prefix: "ret", replaceFrom: 18, replaceTo: 21, qualifier: null });
  });

  it("takes the dotted chain before a dot as the qualifier", () => {
    expect(contextOf("    System.out.pri|")).toEqual({
      prefix: "pri",
      replaceFrom: 15,
      replaceTo: 18,
      qualifier: "System.out",
    });
  });

  it("allows an empty prefix right after a dot", () => {
    expect(contextOf("System.|")).toEqual({
      prefix: "",
      replaceFrom: 7,
      replaceTo: 7,
      qualifier: "System",
    });
  });

  it("takes the name before :: as the qualifier for C++", () => {
    expect(contextOf("    std::so|")).toEqual({
      prefix: "so",
      replaceFrom: 9,
      replaceTo: 11,
      qualifier: "std",
    });
    expect(contextOf("std::chrono::ste|")?.qualifier).toBe("std::chrono");
  });

  it("treats -> as a member access", () => {
    expect(contextOf("node->ne|")?.qualifier).toBe("node");
  });

  it("keeps calls, indexes and string literals in the qualifier", () => {
    expect(contextOf("s.substring(1, 2).len|")?.qualifier).toBe("s.substring(1, 2)");
    expect(contextOf("grid[i][j].len|")?.qualifier).toBe("grid[i][j]");
    expect(contextOf('x = "abc".len|')?.qualifier).toBe('"abc"');
    expect(contextOf("(a + b).len|")?.qualifier).toBe("(a + b)");
    expect(contextOf("fn()(x)[0].len|")?.qualifier).toBe("fn()(x)[0]");
  });

  it("stops the qualifier at an operator or space", () => {
    expect(contextOf("int n = Integer.pa|")?.qualifier).toBe("Integer");
    expect(contextOf("total+list.si|")?.qualifier).toBe("list");
  });

  it("gives a chained call continued from the line above an empty qualifier", () => {
    expect(contextOf("list.stream()\n    .ma|")).toEqual({
      prefix: "ma",
      replaceFrom: 19,
      replaceTo: 21,
      qualifier: "",
    });
  });

  it("returns null for an empty prefix with no qualifier", () => {
    expect(contextOf("|")).toBeNull();
    expect(contextOf("int x = |")).toBeNull();
    expect(contextOf("foo(|")).toBeNull();
  });

  it("returns null inside a number", () => {
    expect(contextOf("x = 12|")).toBeNull();
    expect(contextOf("x = 0x1F|")).toBeNull();
    expect(contextOf("x = 3.14|")).toBeNull();
    expect(contextOf("x = 3.e|")).toBeNull();
  });

  it("returns null inside a string on the line", () => {
    expect(contextOf('String s = "hel|')).toBeNull();
    expect(contextOf("char c = 'a|")).toBeNull();
    expect(contextOf('s = "say \\"hi|')).toBeNull();
  });

  it("completes again once the string has closed", () => {
    expect(contextOf('s = "a" + co|')?.prefix).toBe("co");
    expect(contextOf('s = "a\\\\" + co|')?.prefix).toBe("co");
  });

  it("returns null inside a line comment", () => {
    expect(contextOf("int x; // cou|", "//")).toBeNull();
    expect(contextOf("x = 1  # cou|", "#")).toBeNull();
  });

  it("returns null inside a block comment opened on the line", () => {
    expect(contextOf("int x; /* cou|", "//")).toBeNull();
    expect(contextOf("int x; /* a */ cou|", "//")?.prefix).toBe("cou");
  });

  it("does not treat a comment marker inside a string as a comment", () => {
    expect(contextOf('url = "http://x" + co|', "//")?.prefix).toBe("co");
    expect(contextOf('s = "#" + co|', "#")?.prefix).toBe("co");
  });

  it("only looks at the caret's line for strings and comments", () => {
    expect(contextOf("// a comment\nint co|", "//")?.prefix).toBe("co");
    expect(contextOf('s = "open\nco|')?.prefix).toBe("co");
  });

  it("uses the profile's marker when given, so Python floor division is not a comment", () => {
    expect(contextOf("half = n // co|", "#")?.prefix).toBe("co");
    expect(contextOf("half = n // co|")).toBeNull();
  });

  it("without a marker, a C++ directive is not a comment but a Python comment is", () => {
    expect(contextOf("#include <vec|")?.prefix).toBe("vec");
    expect(contextOf("x = 1  # cou|")).toBeNull();
  });

  it("completes a C++ global-scope name as a top-level identifier", () => {
    expect(contextOf("::ma|")).toEqual({
      prefix: "ma",
      replaceFrom: 2,
      replaceTo: 4,
      qualifier: null,
    });
    expect(contextOf("::|")).toBeNull();
  });

  it("returns null after a dot with nothing nameable before it", () => {
    expect(contextOf("x = +.le|")).toBeNull();
  });

  it("returns null for a caret outside the text", () => {
    expect(completionContext("abc", -1)).toBeNull();
    expect(completionContext("abc", 4)).toBeNull();
  });
});

describe("camelHumpMatches", () => {
  it.each([
    ["pI", "parseInt"],
    ["pi", "parseInt"],
    ["pInt", "parseInt"],
    ["parI", "parseInt"],
    ["sb", "StringBuilder"],
    ["SB", "StringBuilder"],
    ["StrB", "StringBuilder"],
    ["MV", "MAX_VALUE"],
    ["mv", "MAX_VALUE"],
    ["gl", "get_length"],
    ["hS", "HTTPServer"],
    ["aLi", "ArrayList"],
    ["ioobe", "IndexOutOfBoundsException"],
  ])("%s matches %s", (pattern, name) => {
    expect(camelHumpMatches(pattern, name)).toBe(true);
  });

  it.each([
    ["Is", "parseInt"],
    ["pt", "parseInt"],
    ["bs", "StringBuilder"],
    ["sbx", "StringBuilder"],
    ["xy", "parseInt"],
    ["ab", ""],
  ])("%s does not match %s", (pattern, name) => {
    expect(camelHumpMatches(pattern, name)).toBe(false);
  });

  it("matches anything with an empty pattern", () => {
    expect(camelHumpMatches("", "anything")).toBe(true);
  });
});

describe("completionsFor at the top level", () => {
  it("offers identifiers the file declares", () => {
    expect(labelsFor("int counter = 0;\nint total = 0;\nco|")).toEqual(["counter"]);
  });

  it("does not offer the word being typed back to itself", () => {
    expect(labelsFor("int zebraCount;\nzebra|")).toEqual(["zebraCount"]);
    expect(labelsFor("zz|")).toEqual([]);
    expect(labelsFor("zz|\nint zz;")).toEqual([]);
  });

  it("does not offer the word the caret sits inside", () => {
    expect(labelsFor("zq|uux = 1;")).toEqual([]);
  });

  it("skips one-letter words and numbers in the file", () => {
    expect(labelsFor("int a = 42; int b2 = a;\nb|")).toEqual(["b2"]);
    expect(labelsFor("int x = 0x1F;\nx|")).toEqual([]);
  });

  it("de-duplicates identifiers that appear many times", () => {
    expect(labelsFor("total += 1;\ntotal += 2;\ntotal += 3;\nto|")).toEqual(["total"]);
  });

  it("offers keywords, globals and templates", () => {
    const labels = labelsFor("re|");
    expect(labels).toEqual(["return"]);
    expect(labelsFor("so|")).toEqual(["sout"]);
    expect(labelsFor("Inte|")).toEqual(["Integer"]);
  });

  it("prefers a keyword or global over the same word found in the file", () => {
    const { text, caret } = at("String s = new String();\nint n;\nStr|");
    const ctx = completionContext(text, caret, "//");
    if (ctx === null) throw new Error("no context");
    const items = completionsFor(ctx, text, PROFILE);
    expect(items.map((i) => [i.label, i.kind])).toEqual([
      ["String", "type"],
      ["StringBuilder", "type"],
    ]);
  });

  it("gives templates kind snippet, the abbreviation as label and the description as detail", () => {
    const { text, caret } = at("fo|");
    const ctx = completionContext(text, caret, "//");
    if (ctx === null) throw new Error("no context");
    expect(completionsFor(ctx, text, PROFILE)).toEqual([
      {
        label: "fori",
        insertText: "for (int i = 0; i < $END$; i++) {\n    \n}",
        kind: "snippet",
        detail: "Indexed for loop",
      },
    ]);
  });

  it("ranks exact-case prefix, then any-case prefix, then camel hump", () => {
    const text = "int stringCount;\nint sbx;\nint sBig;\nsb|";
    // "sBig" is an any-case prefix match for "sb"; "StringBuilder" only matches by hump.
    expect(labelsFor(text)).toEqual(["sbx", "sBig", "StringBuilder"]);
  });

  it("puts shorter names first within a tier, then sorts alphabetically", () => {
    const text = "int ib; int ia; int ixx;\ni|";
    expect(labelsFor(text)).toEqual(["ia", "ib", "if", "int", "ixx", "import", "Integer"]);
  });

  it("orders in code units so the ranking is the same on every machine", () => {
    expect(labelsFor("int Pb; int pa;\nP|")).toEqual(["Pb", "pa", "public", "private"]);
  });

  it("matches the identifier at the start of a label, never its parameters", () => {
    expect(labelsFor("int stringy;\nSt|")).toEqual(["String", "StringBuilder", "stringy"]);
  });

  it("drops names that match in no tier", () => {
    expect(labelsFor("int alpha;\nqq|")).toEqual([]);
  });

  it("caps the list at the limit", () => {
    const text = Array.from({ length: 30 }, (_, i) => `int var${i};`).join("\n") + "\nva|";
    expect(labelsFor(text)).toHaveLength(12);
    expect(labelsFor(text, 3)).toEqual(["var0", "var1", "var2"]);
    expect(labelsFor(text, 0)).toEqual([]);
  });
});

describe("completionsFor after a qualifier", () => {
  it("offers that qualifier's members first, then the general ones", () => {
    expect(labelsFor("System.out.|", 100)).toEqual([
      "print(String x)",
      "printf(String f, Object... a)",
      "println(String x)",
      "size()",
      "length()",
    ]);
  });

  it("drops a general member the qualifier already names", () => {
    const { text, caret } = at("System.out.print|");
    const ctx = completionContext(text, caret, "//");
    if (ctx === null) throw new Error("no context");
    const items = completionsFor(ctx, text, PROFILE);
    expect(items.map((i) => i.label)).toEqual([
      "print(String x)",
      "printf(String f, Object... a)",
      "println(String x)",
    ]);
  });

  it("never offers file identifiers, keywords or templates after a dot", () => {
    expect(labelsFor("int signal;\nfoo.s|")).toEqual(["size()"]);
  });

  it("falls back to the general members for an unknown qualifier", () => {
    expect(labelsFor("word.le|")).toEqual(["length()"]);
    expect(labelsFor("list.stream()\n    .si|")).toEqual(["size()"]);
  });

  it("camel-hump matches members", () => {
    expect(labelsFor("Integer.pI|")).toEqual(["parseInt(String s)"]);
    expect(labelsFor("Integer.MV|")).toEqual(["MAX_VALUE", "MIN_VALUE"]);
    expect(labelsFor("Integer.MA|")).toEqual(["MAX_VALUE"]);
  });

  it("completes C++ std:: names", () => {
    expect(labelsFor("std::s|", 100)).toEqual(["sort", "string", "size()"]);
  });

  it("returns nothing for a qualifier with no members and no general list", () => {
    const bare: LanguageProfile = { ...PROFILE, members: {} };
    const { text, caret } = at("x.y|");
    const ctx = completionContext(text, caret, "//");
    if (ctx === null) throw new Error("no context");
    expect(completionsFor(ctx, text, bare)).toEqual([]);
  });
});

describe("applyCompletion", () => {
  it("replaces the prefix with the insert text and puts the caret at the end", () => {
    expect(accept("int counter;\ncou|", "counter")).toBe("int counter;\ncounter|");
  });

  it("puts the caret at caretOffset when the item gives one", () => {
    expect(accept("System.out.pri|", "println(String x)")).toBe("System.out.println(|)");
    expect(accept("Integer.pI|", "parseInt(String s)")).toBe("Integer.parseInt(|)");
  });

  it("only replaces the part before the caret", () => {
    expect(accept("int counter;\ncou|nt", "counter")).toBe("int counter;\ncounter|nt");
  });

  it("returns one edit over the typed range", () => {
    const { text, caret } = at("    System.out.pri|");
    const ctx = completionContext(text, caret, "//");
    if (ctx === null) throw new Error("no context");
    const item: CompletionItem = {
      label: "println(String x)",
      insertText: "println()",
      kind: "method",
      caretOffset: 8,
    };
    expect(
      applyCompletion({ text, selectionStart: caret, selectionEnd: caret }, ctx, item),
    ).toEqual({ from: 15, to: 18, insert: "println()", selectionStart: 23, selectionEnd: 23 });
  });

  it("clamps a caretOffset that falls outside the insert text", () => {
    const { text, caret } = at("ab|");
    const ctx = completionContext(text, caret, "//");
    if (ctx === null) throw new Error("no context");
    const item: CompletionItem = {
      label: "abc",
      insertText: "abc",
      kind: "variable",
      caretOffset: 9,
    };
    expect(
      applyCompletion({ text, selectionStart: caret, selectionEnd: caret }, ctx, item),
    ).toEqual({ from: 0, to: 2, insert: "abc", selectionStart: 3, selectionEnd: 3 });
  });

  it("expands a snippet with the caret at $END$", () => {
    expect(accept("    so|", "sout")).toBe("    System.out.println(|);");
  });

  it("indents a snippet's continuation lines to the current line's indent", () => {
    expect(accept("class A {\n    void f() {\n        fo|\n    }\n}", "fori")).toBe(
      "class A {\n    void f() {\n        for (int i = 0; i < |; i++) {\n            \n        }\n    }\n}",
    );
  });

  it("keeps a snippet's caret at the end when the body has no $END$", () => {
    const { text, caret } = at("  ma|");
    const ctx = completionContext(text, caret, "//");
    if (ctx === null) throw new Error("no context");
    const item: CompletionItem = {
      label: "main",
      insertText: "main() {\n}",
      kind: "snippet",
    };
    const edit = applyCompletion({ text, selectionStart: caret, selectionEnd: caret }, ctx, item);
    expect(edit).toEqual({
      from: 2,
      to: 4,
      insert: "main() {\n  }",
      selectionStart: 14,
      selectionEnd: 14,
    });
  });
});

describe("expandTemplateBody", () => {
  it("indents every continuation line and leaves the first alone", () => {
    expect(expandTemplateBody("if (x) {\n    $END$\n}", "\t")).toEqual({
      text: "if (x) {\n\t    \n\t}",
      caret: 14,
    });
  });

  it("does not indent an empty continuation line", () => {
    expect(expandTemplateBody("a\n\nb", "  ").text).toBe("a\n\n  b");
  });

  it("removes a repeated $END$ and keeps the first as the caret", () => {
    expect(expandTemplateBody("x$END$y$END$z", "")).toEqual({ text: "xyz", caret: 1 });
  });
});
