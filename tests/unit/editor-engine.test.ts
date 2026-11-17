import { describe, expect, it } from "vitest";

import { handleKey } from "@/components/contest/editor/smart/engine";
import type {
  Edit,
  EditState,
  KeyInput,
  LanguageProfile,
} from "@/components/contest/editor/smart/types";

/**
 * The editor's IntelliJ keystrokes, one behaviour per test.
 *
 * Every case is written as BEFORE and AFTER text with the caret drawn in: "▮" is a collapsed
 * caret and "«...»" a selection. Reading a case is then reading what the student sees, which is
 * the only form in which "the caret ends up on the indented middle line" can be checked at a
 * glance. The profiles are small and inline on purpose: the real Java, Python and C++ profiles
 * have their own tests, and these pin the ENGINE, so a change to a profile cannot move them.
 */

const CARET = "▮";

const JAVA: LanguageProfile = {
  id: "java",
  lineComment: "//",
  indentUnit: "    ",
  pairs: [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ],
  quotes: ['"', "'"],
  opensBlock: (line) => /[{([]\s*$/.test(line),
  dedentOnType: ["}"],
  templates: [
    { abbreviation: "sout", description: "Prints a line", body: "System.out.println($END$);" },
    {
      abbreviation: "fori",
      description: "Indexed for loop",
      body: "for (int i = 0; i < $END$; i++) {\n\t\n}",
    },
    { abbreviation: "psvm", description: "Main method", body: "public static void main(String[] args) {\n    $END$\n}" },
    { abbreviation: "nl", description: "No marker", body: "System.out.println();" },
  ],
  keywords: [],
  globals: [],
  members: {},
};

const CPP: LanguageProfile = { ...JAVA, id: "cpp" };

const PYTHON: LanguageProfile = {
  ...JAVA,
  id: "python",
  lineComment: "#",
  opensBlock: (line) => /:\s*$/.test(line),
  dedentOnType: [],
  templates: [{ abbreviation: "main", description: "Main guard", body: 'if __name__ == "__main__":\n\t$END$' }],
};

/** Parses "a▮b" or "a«b»c" into an EditState. */
function state(marked: string): EditState {
  const open = marked.indexOf("«");
  if (open !== -1) {
    const close = marked.indexOf("»");
    const text = marked.slice(0, open) + marked.slice(open + 1, close) + marked.slice(close + 1);
    return { text, selectionStart: open, selectionEnd: close - 1 };
  }
  const caret = marked.indexOf(CARET);
  if (caret === -1) throw new Error(`no caret in ${JSON.stringify(marked)}`);
  return { text: marked.replace(CARET, ""), selectionStart: caret, selectionEnd: caret };
}

/** Applies an edit and draws the result with the same markers. */
function draw(before: EditState, edit: Edit): string {
  const text = before.text.slice(0, edit.from) + edit.insert + before.text.slice(edit.to);
  expect(edit.selectionStart).toBeGreaterThanOrEqual(0);
  expect(edit.selectionEnd).toBeLessThanOrEqual(text.length);
  if (edit.selectionStart === edit.selectionEnd) {
    return text.slice(0, edit.selectionStart) + CARET + text.slice(edit.selectionStart);
  }
  return (
    text.slice(0, edit.selectionStart) +
    "«" +
    text.slice(edit.selectionStart, edit.selectionEnd) +
    "»" +
    text.slice(edit.selectionEnd)
  );
}

interface KeyOptions {
  readonly shift?: boolean;
  readonly alt?: boolean;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
  readonly mac?: boolean;
}

function key(name: string, options: KeyOptions = {}): KeyInput {
  return {
    key: name,
    shiftKey: options.shift ?? false,
    altKey: options.alt ?? false,
    ctrlKey: options.ctrl ?? false,
    metaKey: options.meta ?? false,
    isMac: options.mac ?? false,
  };
}

/** Presses a key and returns the drawn result, or null when the engine declined it. */
function press(marked: string, input: KeyInput | string, profile: LanguageProfile = JAVA): string | null {
  const before = state(marked);
  const edit = handleKey(before, typeof input === "string" ? key(input) : input, profile);
  return edit === null ? null : draw(before, edit);
}

/** Presses keys in sequence, letting the browser type any key the engine declines. */
function typeAll(marked: string, keys: readonly string[], profile: LanguageProfile = JAVA): string {
  return keys.reduce((current, name) => {
    const result = press(current, name, profile);
    if (result !== null) return result;
    const at = current.indexOf(CARET);
    return current.slice(0, at) + name + CARET + current.slice(at + 1);
  }, marked);
}

const ctrl = (name: string, options: KeyOptions = {}) => key(name, { ...options, ctrl: true });
const cmd = (name: string, options: KeyOptions = {}) => key(name, { ...options, meta: true, mac: true });

describe("pairs", () => {
  it("closes each opener in the profile and leaves the caret between", () => {
    expect(press("x = ▮", "(")).toBe("x = (▮)");
    expect(press("x = ▮", "[")).toBe("x = [▮]");
    expect(press("if (a) ▮", "{")).toBe("if (a) {▮}");
  });

  it("closes an opener typed before a closer, a space or the end of the line", () => {
    expect(press("f(▮)", "(")).toBe("f((▮))");
    expect(press("a▮ b", "(")).toBe("a(▮) b");
    expect(press("a▮\nb", "[")).toBe("a[▮]\nb");
  });

  it("types a bare opener directly before a word, as IntelliJ does", () => {
    expect(press("▮foo", "(")).toBeNull();
    expect(press("▮$x", "(")).toBeNull();
  });

  it("steps over a closer when the same closer is next", () => {
    expect(press("f(a▮)", ")")).toBe("f(a)▮");
    expect(press("x[1▮]", "]")).toBe("x[1]▮");
    expect(press("{▮}", "}")).toBe("{}▮");
  });

  it("types a closer normally when the next character is something else", () => {
    expect(press("f(a▮", ")")).toBeNull();
    expect(press("f((a▮]", ")")).toBeNull();
  });

  it("types the full sequence f(x) without a doubled parenthesis", () => {
    expect(typeAll("▮", ["f", "(", "x", ")", ";"])).toBe("f(x);▮");
  });

  it("wraps a selection in a typed pair and keeps the inner text selected", () => {
    expect(press("x = «a + b»;", "(")).toBe("x = («a + b»);");
    expect(press("«items»", "[")).toBe("[«items»]");
    expect(press("«name»", '"')).toBe('"«name»"');
    expect(press("«c»", "'")).toBe("'«c»'");
  });

  it("lets the browser replace a selection with any other character", () => {
    expect(press("«abc»", "x")).toBeNull();
    expect(press("«abc»", ")")).toBeNull();
  });

  it("does nothing for characters that are neither pairs nor dedent characters", () => {
    expect(press("a▮", "b")).toBeNull();
    expect(press("a▮", " ")).toBeNull();
    expect(press("a▮", ";")).toBeNull();
  });
});

describe("quotes", () => {
  it("closes a quote typed after a space, an opener or an operator", () => {
    expect(press("s = ▮", '"')).toBe('s = "▮"');
    expect(press("f(▮)", '"')).toBe('f("▮")');
    expect(press("c = ▮", "'")).toBe("c = '▮'");
    expect(press("a +▮", '"')).toBe('a +"▮"');
  });

  it("does not close a quote typed right after a word character", () => {
    expect(press("don▮", "'")).toBeNull();
    expect(press("x1▮", '"')).toBeNull();
  });

  it("types an escaped quote after a backslash and keeps the closing one", () => {
    // IntelliJ and CLion: `"say \|"` plus `"` is `"say \"|"`, never a step over the closer.
    expect(press('"a\\▮"', '"')).toBeNull();
    expect(press('"a\\▮ b', '"')).toBeNull();
    // An escaped backslash does not escape the quote after it.
    expect(press('"a\\\\▮"', '"')).toBe('"a\\\\"▮');
  });

  it("does not close a quote typed before a word", () => {
    expect(press("▮hello", '"')).toBeNull();
  });

  it("steps over the closing quote instead of typing a second one", () => {
    expect(press('s = "hi▮"', '"')).toBe('s = "hi"▮');
    expect(typeAll("▮", ['"', "h", "i", '"', ";"])).toBe('"hi";▮');
  });

  it("opens a triple-quoted string when the third quote is typed", () => {
    expect(typeAll("x = ▮", ['"', '"', '"'], PYTHON)).toBe('x = """▮"""');
    expect(typeAll("String s = ▮", ['"', '"', '"'])).toBe('String s = """▮"""');
  });

  it("still closes quotes after Python string prefixes", () => {
    expect(press("print(f▮)", '"', PYTHON)).toBe('print(f"▮")');
    expect(press("p = r▮", "'", PYTHON)).toBe("p = r'▮'");
    expect(press("b = rb▮", '"', PYTHON)).toBe('b = rb"▮"');
    expect(press("elif▮", '"', PYTHON)).toBeNull();
  });

  it("still closes quotes after C++ string prefixes", () => {
    expect(press("auto s = R▮", '"', CPP)).toBe('auto s = R"▮"');
    expect(press("auto s = u8▮", '"', CPP)).toBe('auto s = u8"▮"');
  });

  it("treats a Java f as an ordinary word character", () => {
    expect(press("f▮", '"')).toBeNull();
  });
});

describe("Backspace", () => {
  it("deletes both halves of an empty pair", () => {
    expect(press("f(▮)", "Backspace")).toBe("f▮");
    expect(press("[▮]", "Backspace")).toBe("▮");
    expect(press("{▮}", "Backspace")).toBe("▮");
    expect(press('s = "▮"', "Backspace")).toBe("s = ▮");
    expect(press("'▮'", "Backspace")).toBe("▮");
  });

  it("leaves every other Backspace to the browser", () => {
    expect(press("f(a▮)", "Backspace")).toBeNull();
    expect(press("(▮]", "Backspace")).toBeNull();
    expect(press("▮()", "Backspace")).toBeNull();
    expect(press("«()»", "Backspace")).toBeNull();
    expect(press("x▮", "Backspace")).toBeNull();
    expect(press("x▮", key("Backspace", { alt: true }))).toBeNull();
  });
});

describe("Enter", () => {
  it("keeps the current line's indent", () => {
    expect(press("    int x = 1;▮", "Enter")).toBe("    int x = 1;\n    ▮");
    expect(press("\tfoo();▮", "Enter")).toBe("\tfoo();\n\t▮");
  });

  it("adds one indent unit after a line that opens a block", () => {
    expect(press("    if (x) {▮", "Enter")).toBe("    if (x) {\n        ▮\n    }");
    expect(press("    if x:▮", "Enter", PYTHON)).toBe("    if x:\n        ▮");
    // Inside an open "(" IntelliJ uses the continuation indent, two levels (editor-engine-extras).
    expect(press("call(▮", "Enter")).toBe("call(\n        ▮");
  });

  it("splits a brace pair onto three lines with the closer at the original indent", () => {
    expect(press("    void f() {▮}", "Enter")).toBe("    void f() {\n        ▮\n    }");
  });

  it("splits braces onto three lines, ignoring spaces inside them", () => {
    expect(press("int[] a = {▮ };", "Enter")).toBe("int[] a = {\n    ▮\n};");
    expect(press("xs = [▮]", "Enter", PYTHON)).toBe("xs = [\n    ▮\n]");
  });

  it("keeps the closer after the caret on a continuation line inside () and [], as IntelliJ does", () => {
    expect(press("f( ▮)", "Enter")).toBe("f(\n        ▮)");
    expect(press("        System.out.println(▮);", "Enter")).toBe("        System.out.println(\n                ▮);");
    expect(press("a[▮]", "Enter", CPP)).toBe("a[\n        ▮]");
  });

  it("does not split two characters that are not a matching pair", () => {
    expect(press("f(▮]", "Enter")).toBe("f(\n        ▮]");
  });

  it("removes trailing whitespace from the line it leaves", () => {
    expect(press("    foo();   ▮", "Enter")).toBe("    foo();\n    ▮");
    expect(press("    ▮", "Enter")).toBe("\n    ▮");
  });

  it("carries text after the caret down without its leading spaces", () => {
    expect(press("    a = 1;▮   b = 2;", "Enter")).toBe("    a = 1;\n    ▮b = 2;");
  });

  it("replaces a selection with the new line", () => {
    expect(press("    a«bc»d", "Enter")).toBe("    a\n    ▮d");
  });

  it("indents to the caret column when the caret is inside the leading whitespace", () => {
    expect(press("  ▮  x", "Enter")).toBe("\n  ▮x");
  });

  it("writes the closing brace after an unbalanced opener, as IntelliJ's insert pair does", () => {
    expect(press("class A {\n    void f() {▮\n}", "Enter")).toBe(
      "class A {\n    void f() {\n        ▮\n    }\n}",
    );
  });

  it("does not write a brace when the braces are already balanced", () => {
    expect(press("void f() {▮\n}", "Enter")).toBe("void f() {\n    ▮\n}");
  });

  it("ignores braces inside strings and comments when counting balance", () => {
    expect(press('void f() {▮\n  s = "}";\n}', "Enter")).toBe('void f() {\n    ▮\n  s = "}";\n}');
    expect(press("void f() {▮\n// {\n}", "Enter")).toBe("void f() {\n    ▮\n// {\n}");
  });

  it("does not write a closing brace in Python", () => {
    // PyCharm's hanging indent, and no "}" written.
    expect(press("d = {▮", "Enter", PYTHON)).toBe("d = {\n    ▮");
  });

  it("starts a new line below with Shift+Enter, wherever the caret is", () => {
    expect(press("    fo▮o();", key("Enter", { shift: true }))).toBe("    foo();\n    ▮");
  });

  it("leaves Alt+Enter alone", () => {
    expect(press("a▮", key("Enter", { alt: true }))).toBeNull();
  });
});

describe("Enter in a block comment", () => {
  it("continues a /** line and closes the comment when it is open", () => {
    expect(press("    /**▮", "Enter")).toBe("    /**\n     * ▮\n     */");
    expect(press("/*▮", "Enter", CPP)).toBe("/*\n * ▮\n */");
  });

  it("does not write a second closer when the comment is already closed", () => {
    expect(press("    /**▮\n     */", "Enter")).toBe("    /**\n     * ▮\n     */");
  });

  it("continues a line that starts with *", () => {
    expect(press("    /**\n     * Sums.▮\n     */", "Enter")).toBe("    /**\n     * Sums.\n     * ▮\n     */");
  });

  it("does not treat a pointer dereference as a comment line", () => {
    expect(press("    *p = 5;▮", "Enter", CPP)).toBe("    *p = 5;\n    ▮");
  });

  it("stops continuing once the comment has closed", () => {
    expect(press("/** Doc. */▮", "Enter")).toBe("/** Doc. */\n▮");
  });

  it("does not continue comments in Python", () => {
    expect(press("    /*▮", "Enter", PYTHON)).toBe("    /*\n    ▮");
  });
});

describe("dedent on type", () => {
  it("snaps a closing brace to the indent of its opener's line", () => {
    expect(press("    if (x) {\n        foo();\n        ▮", "}")).toBe("    if (x) {\n        foo();\n    }▮");
  });

  it("matches the innermost unclosed opener", () => {
    const code = "class A {\n    void f() {\n        g();\n    }\n        ▮";
    expect(press(code, "}")).toBe("class A {\n    void f() {\n        g();\n    }\n}▮");
  });

  it("ignores braces in strings, chars and comments", () => {
    const code = 'if (x) {\n    s = "{";\n    c = \'{\';\n    // {\n    /* { */\n    ▮';
    expect(press(code, "}")).toBe('if (x) {\n    s = "{";\n    c = \'{\';\n    // {\n    /* { */\n}▮');
  });

  it("recovers from a missing parenthesis inside the block", () => {
    expect(press("  if (x) {\n    f(\n    ▮", "}")).toBe("  if (x) {\n    f(\n  }▮");
  });

  it("leaves a closer alone when it is not the first character on the line", () => {
    expect(press("    foo(); ▮", "}")).toBeNull();
  });

  it("leaves a closer alone when it is already at the right indent or has no opener", () => {
    expect(press("if (x) {\n▮", "}")).toBeNull();
    expect(press("    ▮", "}")).toBeNull();
  });

  it("drops one indent level for a dedent character that is not a closer", () => {
    const profile: LanguageProfile = { ...JAVA, dedentOnType: ["}", "#"] };
    expect(press("        ▮", "#", profile)).toBe("    #▮");
    expect(press("\t\t▮", "#", profile)).toBe("\t#▮");
  });
});

describe("Mod+/ line comment", () => {
  it("comments the caret line at column 0 and moves the caret down", () => {
    expect(press("    a();▮\n    b();", ctrl("/"))).toBe("//    a();\n    b();▮");
  });

  it("uses Cmd on a Mac and ignores Ctrl there", () => {
    expect(press("a();▮", cmd("/"))).toBe("//a();▮");
    expect(press("a();▮", ctrl("/", { mac: true }))).toBeNull();
    expect(press("a();▮", key("/", { meta: true }))).toBeNull();
  });

  it("uncomments a commented line", () => {
    expect(press("//    a();▮", ctrl("/"))).toBe("    a();▮");
    expect(press("    // a();▮", ctrl("/"))).toBe("     a();▮");
  });

  it("toggles back to the original text", () => {
    const original = "    if (x) {\n        y();\n    }";
    const once = handleKey(
      { text: original, selectionStart: 0, selectionEnd: original.length },
      ctrl("/"),
      JAVA,
    );
    expect(once).not.toBeNull();
    if (once === null) return;
    const commented = original.slice(0, once.from) + once.insert + original.slice(once.to);
    expect(commented).toBe("//    if (x) {\n//        y();\n//    }");
    const twice = handleKey(
      { text: commented, selectionStart: once.selectionStart, selectionEnd: once.selectionEnd },
      ctrl("/"),
      JAVA,
    );
    expect(twice === null ? null : commented.slice(0, twice.from) + twice.insert + commented.slice(twice.to)).toBe(
      original,
    );
  });

  it("comments every selected line when any of them is uncommented", () => {
    expect(press("«//a();\nb();»", ctrl("/"))).toBe("«////a();\n//b();»");
  });

  it("uncomments every line when all of them are commented", () => {
    expect(press("«//a();\n    //b();»", ctrl("/"))).toBe("«a();\n    b();»");
  });

  it("keeps the selection start before the inserted marker", () => {
    expect(press("«a();\nb();»", ctrl("/"))).toBe("«//a();\n//b();»");
    expect(press("x«a();\nb»();", ctrl("/"))).toBe("//x«a();\n//b»();");
  });

  it("leaves out the line where a selection ends at column 0", () => {
    expect(press("«a();\nb();\n»c();", ctrl("/"))).toBe("«//a();\n//b();\n»c();");
  });

  it("skips blank lines in a block and does not count them as uncommented", () => {
    expect(press("«a();\n\nb();»", ctrl("/"))).toBe("«//a();\n\n//b();»");
    expect(press("«//a();\n\n//b();»", ctrl("/"))).toBe("«a();\n\nb();»");
  });

  it("comments a lone blank line", () => {
    expect(press("▮", ctrl("/"))).toBe("//▮");
  });

  it("writes '# ' at the code's indent in Python and removes it", () => {
    // PyCharm comments at the block's indent; IntelliJ and CLion at column 0.
    expect(press("    x = 1▮", ctrl("/"), PYTHON)).toBe("    # x = 1▮");
    expect(press("#     x = 1▮", ctrl("/"), PYTHON)).toBe("    x = 1▮");
    expect(press("    #x = 1▮", ctrl("/"), PYTHON)).toBe("    x = 1▮");
  });

  it("keeps the caret column when moving down, clamped to the shorter line", () => {
    expect(press("abcdef▮\nab", ctrl("/"))).toBe("//abcdef\nab▮");
    // The column moves with the "//" that went in, then drops a line, as IntelliJ does.
    expect(press("ab▮cd\nwxyz", ctrl("/"))).toBe("//abcd\nwxyz▮");
    expect(press("ab▮cd\nwxyzuv", ctrl("/"))).toBe("//abcd\nwxyz▮uv");
    expect(press("//ab▮cd\nwxyzuv", ctrl("/"))).toBe("abcd\nwx▮yzuv");
  });

  it("accepts Shift held for layouts where / is a shifted key", () => {
    expect(press("a▮", ctrl("/", { shift: true }))).toBe("//a▮");
  });

  it("leaves Ctrl+Alt+/ alone", () => {
    expect(press("a▮", key("/", { ctrl: true, alt: true }))).toBeNull();
  });
});

describe("Mod+D duplicate", () => {
  it("duplicates the caret line below and moves the caret onto the copy", () => {
    expect(press("    fo▮o();\nbar();", ctrl("d"))).toBe("    foo();\n    fo▮o();\nbar();");
  });

  it("duplicates the last line of the file", () => {
    expect(press("a\nb▮", cmd("d"))).toBe("a\nb\nb▮");
  });

  it("duplicates a selection in place and selects the copy", () => {
    expect(press("x = «ab»;", ctrl("d"))).toBe("x = ab«ab»;");
    expect(press("«a\nb\n»c", ctrl("D"))).toBe("a\nb\n«a\nb\n»c");
  });

  it("leaves Mod+Shift+D alone", () => {
    expect(press("a▮", ctrl("D", { shift: true }))).toBeNull();
  });
});

describe("Alt+Shift+Up and Down move lines", () => {
  const up = key("ArrowUp", { alt: true, shift: true });
  const down = key("ArrowDown", { alt: true, shift: true });

  it("moves the caret line up and down, keeping the caret column", () => {
    expect(press("a\nb▮b\nc", up)).toBe("b▮b\na\nc");
    expect(press("a\nb▮b\nc", down)).toBe("a\nc\nb▮b");
  });

  it("moves every selected line together", () => {
    expect(press("x\n«a\nb»\ny", up)).toBe("«a\nb»\nx\ny");
    expect(press("x\n«a\nb»\ny", down)).toBe("x\ny\n«a\nb»");
  });

  it("does not take the line where the selection ends at column 0", () => {
    expect(press("x\n«a\n»b\ny", down)).toBe("x\nb\n«a\n»y");
    expect(press("x\n«a\n»b", up)).toBe("«a\n»x\nb");
  });

  it("returns an edit that changes nothing at the top and bottom of the file", () => {
    expect(press("a▮\nb", up)).toBe("a▮\nb");
    expect(press("a\nb▮", down)).toBe("a\nb▮");
    expect(press("«a\nb»", up)).toBe("«a\nb»");
  });

  it("leaves arrows without both Alt and Shift to the browser", () => {
    expect(press("a\nb▮", "ArrowUp")).toBeNull();
    expect(press("a\nb▮", key("ArrowUp", { alt: true }))).toBeNull();
    expect(press("a\nb▮", key("ArrowUp", { shift: true }))).toBeNull();
    expect(press("a\nb▮", key("ArrowUp", { alt: true, shift: true, ctrl: true }))).toBeNull();
  });
});

describe("Tab live templates", () => {
  it("expands an abbreviation and puts the caret at $END$", () => {
    expect(press("    sout▮", "Tab")).toBe("    System.out.println(▮);");
  });

  it("indents continuation lines to the current indent and widens tabs to the indent unit", () => {
    expect(press("    fori▮", "Tab")).toBe("    for (int i = 0; i < ▮; i++) {\n        \n    }");
    expect(press("  psvm▮", "Tab")).toBe("  public static void main(String[] args) {\n      ▮\n  }");
    expect(press("main▮", "Tab", PYTHON)).toBe('if __name__ == "__main__":\n    ▮');
  });

  it("puts the caret at the end when the body has no $END$", () => {
    expect(press("nl▮", "Tab")).toBe("System.out.println();▮");
  });

  it("expands after an opener or other non-word character", () => {
    expect(press("{sout▮", "Tab")).toBe("{System.out.println(▮);");
  });

  it("never expands a plain template after a member separator", () => {
    // `x.sout` is a postfix template or nothing; it is never `x.System.out.println();`.
    expect(press("x.sout▮", "Tab")).toBeNull();
    expect(press("std::fori▮", "Tab", CPP)).toBeNull();
    expect(press("p->sout▮", "Tab", CPP)).toBeNull();
  });

  it("does not expand an abbreviation that is part of a longer word", () => {
    expect(press("xsout▮", "Tab")).toBeNull();
    expect(press("sout2▮", "Tab")).toBeNull();
    expect(press("so▮ut", "Tab")).toBeNull();
  });

  it("returns null for every other Tab so the surface keeps its block indent", () => {
    expect(press("    ▮", "Tab")).toBeNull();
    expect(press("foo▮", "Tab")).toBeNull();
    expect(press("«sout»", "Tab")).toBeNull();
    expect(press("sout▮", key("Tab", { shift: true }))).toBeNull();
  });
});

describe("keys the engine does not own", () => {
  it("returns null for navigation, function keys and other shortcuts", () => {
    // Home is IntelliJ's smart Home now (editor-engine-extras.test.ts); End on a line with code stays native.
    for (const name of ["ArrowLeft", "End", "Escape", "Delete", "F5", "Shift"]) {
      expect(press("a▮", name)).toBeNull();
    }
    expect(press("a▮", ctrl("s"))).toBeNull();
    expect(press("a▮", ctrl("z"))).toBeNull();
    expect(press("a▮", cmd("c"))).toBeNull();
  });

  it("does not pair characters typed with Ctrl or Cmd held", () => {
    expect(press("a ▮", ctrl("("))).toBeNull();
    expect(press("a ▮", key("(", { ctrl: true, mac: true }))).toBeNull();
    expect(press("a ▮", key("(", { meta: true }))).toBeNull();
  });

  it("treats Ctrl+Alt as AltGr off a Mac, so layouts that type { that way still pair", () => {
    expect(press("if (a) ▮", key("{", { ctrl: true, alt: true }))).toBe("if (a) {▮}");
  });

  it("pairs a character typed with Option on a Mac", () => {
    expect(press("x = ▮", key("[", { alt: true, mac: true }))).toBe("x = [▮]");
  });
});

describe("selection input", () => {
  it("accepts a backwards selection", () => {
    const edit = handleKey({ text: "abc", selectionStart: 3, selectionEnd: 0 }, key("("), JAVA);
    expect(edit).toEqual({ from: 0, to: 3, insert: "(abc)", selectionStart: 1, selectionEnd: 4 });
  });

  it("clamps offsets outside the text", () => {
    const edit = handleKey({ text: "ab", selectionStart: 9, selectionEnd: 9 }, key("("), JAVA);
    expect(edit).toEqual({ from: 2, to: 2, insert: "()", selectionStart: 3, selectionEnd: 3 });
  });
});
