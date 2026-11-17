import { describe, expect, it } from "vitest";

import { CPP } from "@/components/contest/editor/smart/cpp";
import { handleKey } from "@/components/contest/editor/smart/engine";
import { JAVA } from "@/components/contest/editor/smart/java";
import { PYTHON } from "@/components/contest/editor/smart/python";
import { engineShortcuts } from "@/components/contest/editor/smart/shortcuts";
import type { Edit, EditState, KeyInput, LanguageProfile } from "@/components/contest/editor/smart/types";

/**
 * The IntelliJ, PyCharm and CLion keystrokes added on top of the first engine round, against the
 * real profiles. "▮" is the caret and "«...»" a selection.
 */

const CARET = "▮";

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

function apply(current: EditState, edit: Edit): EditState {
  return {
    text: current.text.slice(0, edit.from) + edit.insert + current.text.slice(edit.to),
    selectionStart: edit.selectionStart,
    selectionEnd: edit.selectionEnd,
    selectionDirection: edit.selectionDirection,
  };
}

function draw(current: EditState): string {
  const { text, selectionStart: a, selectionEnd: b } = current;
  if (a === b) return text.slice(0, a) + CARET + text.slice(a);
  return `${text.slice(0, a)}«${text.slice(a, b)}»${text.slice(b)}`;
}

interface Mods {
  readonly shift?: boolean;
  readonly alt?: boolean;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
  readonly mac?: boolean;
  readonly code?: string;
}

function key(name: string, mods: Mods = {}): KeyInput {
  return {
    key: name,
    code: mods.code,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
    ctrlKey: mods.ctrl ?? false,
    metaKey: mods.meta ?? false,
    isMac: mods.mac ?? false,
  };
}

/** Presses the keys in order, typing a one-character key the browser's way when the engine passes. */
function press(marked: string, keys: readonly KeyInput[], profile: LanguageProfile = JAVA): string {
  let current = state(marked);
  for (const input of keys) {
    const edit = handleKey(current, input, profile);
    if (edit !== null) {
      current = apply(current, edit);
    } else if (input.key.length === 1 && !input.ctrlKey && !input.metaKey) {
      const at = current.selectionStart;
      const text = current.text.slice(0, at) + input.key + current.text.slice(current.selectionEnd);
      current = { text, selectionStart: at + 1, selectionEnd: at + 1 };
    } else {
      return "null";
    }
  }
  return draw(current);
}

const one = (marked: string, input: KeyInput, profile: LanguageProfile = JAVA) => press(marked, [input], profile);
const typed = (marked: string, chars: string, profile: LanguageProfile = JAVA) =>
  press(marked, [...chars].map((ch) => key(ch)), profile);

describe("Delete Line", () => {
  it("is Ctrl+Y off a Mac and Cmd+Backspace on one, keeping the column", () => {
    expect(one("a = 1;\nb▮ = 2;\nc = 3;", key("y", { ctrl: true }))).toBe("a = 1;\nc▮ = 3;");
    expect(one("a = 1;\nb▮ = 2;\nc = 3;", key("Backspace", { meta: true, mac: true }))).toBe("a = 1;\nc▮ = 3;");
  });

  it("deletes the last line into the one above", () => {
    expect(one("a = 1;\nb▮ = 2;", key("y", { ctrl: true }))).toBe("a▮ = 1;");
  });
});

describe("Delete to Word Start and End", () => {
  it("deletes back one identifier with Option+Backspace on a Mac and Ctrl+Backspace elsewhere", () => {
    expect(one("total = count▮;", key("Backspace", { alt: true, mac: true }))).toBe("total = ▮;");
    expect(one("total = count▮;", key("Backspace", { ctrl: true }))).toBe("total = ▮;");
  });

  it("deletes a run of spaces or punctuation on its own, and joins lines at column 0", () => {
    expect(one("a   ▮b", key("Backspace", { ctrl: true }))).toBe("a▮b");
    expect(one("f();▮", key("Backspace", { ctrl: true }))).toBe("f▮");
    expect(one("a\n▮b", key("Backspace", { ctrl: true }))).toBe("a▮b");
  });

  it("deletes forward to the word end with Option+Delete or Ctrl+Delete", () => {
    expect(one("x = ▮count + 1", key("Delete", { alt: true, mac: true }))).toBe("x = ▮ + 1");
    expect(one("x = ▮count + 1", key("Delete", { ctrl: true }))).toBe("x = ▮ + 1");
    expect(one("a▮\nb", key("Delete", { ctrl: true }))).toBe("a▮b");
  });

  it("leaves Alt+Backspace alone off a Mac", () => {
    expect(one("abc▮", key("Backspace", { alt: true }))).toBe("null");
  });
});

describe("Smart Home and End", () => {
  it("goes to the first non-blank character, then column 0, toggling", () => {
    expect(press("    int x▮ = 1;", [key("Home")])).toBe("    ▮int x = 1;");
    expect(press("    int x▮ = 1;", [key("Home"), key("Home")])).toBe("▮    int x = 1;");
    expect(press("    int x▮ = 1;", [key("Home"), key("Home"), key("Home")])).toBe("    ▮int x = 1;");
  });

  it("is Cmd+Left on a Mac", () => {
    expect(one("    int x▮ = 1;", key("ArrowLeft", { meta: true, mac: true }))).toBe("    ▮int x = 1;");
  });

  it("extends the selection from its anchor with Shift", () => {
    expect(one("    int x▮ = 1;", key("Home", { shift: true }))).toBe("    «int x» = 1;");
    const edit = handleKey(state("    int x▮ = 1;"), key("Home", { shift: true }), JAVA);
    expect(edit?.selectionDirection).toBe("backward");
    expect(press("    int x▮ = 1;", [key("Home", { shift: true }), key("Home", { shift: true })])).toBe("«    int x» = 1;");
  });

  it("End on a blank line goes to the indent the line should have", () => {
    expect(one("void f() {\n▮\n}", key("End"))).toBe("void f() {\n    ▮\n}");
    expect(one("if x:\n▮", key("End"), PYTHON)).toBe("if x:\n    ▮");
  });

  it("End on a line with code is the browser's", () => {
    expect(one("int ▮x;", key("End"))).toBe("null");
  });
});

describe("Tab out of an auto-inserted closer", () => {
  it("steps past the quote and then the parenthesis", () => {
    expect(typed('        System.out.println(▮);', '"abc')).toBe('        System.out.println("abc▮");');
    expect(press('        System.out.println("abc▮");', [key("Tab"), key("Tab")])).toBe(
      '        System.out.println("abc")▮;',
    );
  });

  it("works in Python and C++", () => {
    expect(one('print("hi▮")', key("Tab"), PYTHON)).toBe('print("hi"▮)');
    expect(one("    v.push_back(x▮);", key("Tab"), CPP)).toBe("    v.push_back(x)▮;");
  });

  it("does not jump when real code follows the closer, so Tab still indents there", () => {
    expect(one("f(a▮) + g(b);", key("Tab"))).toBe("null");
  });

  it("does not step over a quote that opens a string", () => {
    expect(one('f(▮"x")', key("Tab"))).toBe("null");
  });
});

describe("Complete Current Statement", () => {
  const complete = key("Enter", { ctrl: true, shift: true });

  it("closes the call and adds the semicolon", () => {
    // The statement is done, so the caret goes on to a new line at the same indent.
    expect(one("        System.out.println(x▮", complete)).toBe("        System.out.println(x);\n        ▮");
  });

  it("opens a block after if, for and while", () => {
    expect(one("    if (n > 0▮", complete)).toBe("    if (n > 0) {\n        ▮\n    }");
    expect(one("    for (int i = 0; i < n; i++▮", complete, CPP)).toBe("    for (int i = 0; i < n; i++) {\n        ▮\n    }");
  });

  it("opens the body of a method declared in a class, rather than ending it with a semicolon", () => {
    expect(one("class Main {\n    static int gcd(int a, int b▮\n}", complete)).toBe(
      "class Main {\n    static int gcd(int a, int b) {\n        ▮\n    }\n}",
    );
    expect(one("int solve(int n▮", complete, CPP)).toBe("int solve(int n) {\n    ▮\n}");
  });

  it("adds the colon to a Python header", () => {
    expect(one("while i < n▮", complete, PYTHON)).toBe("while i < n:\n    ▮");
  });
});

describe("Start New Line Before Current", () => {
  it("opens a line above at the same indent with Mod+Alt+Enter", () => {
    expect(one("    int a;\n    int b▮;", key("Enter", { ctrl: true, alt: true }))).toBe("    int a;\n    ▮\n    int b;");
    expect(one("    int b▮;", key("Enter", { meta: true, alt: true, mac: true }))).toBe("    ▮\n    int b;");
  });

  it("goes one level in above a closing brace", () => {
    expect(one("    if (x) {\n    }▮", key("Enter", { ctrl: true, alt: true }))).toBe("    if (x) {\n        ▮\n    }");
  });
});

describe("Comment with Block Comment", () => {
  const blockWin = key("?", { ctrl: true, shift: true, code: "Slash" });
  const blockMac = key("\u00f7", { meta: true, alt: true, mac: true, code: "Slash" });

  it("wraps the selection, matching the Mac chord on the physical key", () => {
    expect(one("int «a = 1»;", blockWin)).toBe("int «/*a = 1*/»;");
    expect(one("int «a = 1»;", blockMac)).toBe("int «/*a = 1*/»;");
  });

  it("inserts an empty comment at a caret, and unwraps from inside one", () => {
    expect(one("f(▮);", blockWin, CPP)).toBe("f(/*▮*/);");
    expect(one("int /* a▮ = 1 */ b;", blockWin)).toBe("int a▮ = 1 b;");
  });

  it("does nothing in Python, which has no block comment", () => {
    expect(one("«x = 1»", blockWin, PYTHON)).toBe("null");
  });

  it("still toggles a line comment with Mod+/", () => {
    expect(one("int ▮a;", key("/", { ctrl: true, code: "Slash" }))).toBe("//int ▮a;");
  });
});

describe("Extend and Shrink Selection", () => {
  const grow = key("ArrowUp", { alt: true, mac: true });
  const shrink = key("ArrowDown", { alt: true, mac: true });

  it("grows word, call chain, bracket contents, brackets, line", () => {
    const start = "    total += Math.max(a▮b, c);";
    expect(press(start, [grow])).toBe("    total += Math.max(«ab», c);");
    expect(press(start, [grow, grow])).toBe("    total += Math.max(«ab, c»);");
    expect(press(start, [grow, grow, grow])).toBe("    total += Math.max«(ab, c)»;");
    expect(press(start, [grow, grow, grow, grow])).toBe("    total += «Math.max(ab, c)»;");
    expect(press(start, [grow, grow, grow, grow, grow])).toBe("    «total += Math.max(ab, c);»");
  });

  it("selects inside a string, then the string", () => {
    expect(press('s = "he▮llo world";', [grow, grow])).toBe('s = "«hello world»";');
    expect(press('s = "he▮llo world";', [grow, grow, grow])).toBe('s = «"hello world"»;');
  });

  it("grows to the block's lines and then the block with its header", () => {
    const text = "void f() {\n    if (x) {\n        a▮();\n    }\n}";
    expect(press(text, [grow, grow, grow, grow])).toBe("void f() {\n    if (x) {\n«        a();\n»    }\n}");
    expect(press(text, [grow, grow, grow, grow, grow, grow])).toBe("void f() {\n    «if (x) {\n        a();\n    }»\n}");
  });

  it("takes Python's indented block", () => {
    const text = "for i in r:\n    a▮ = 1\n    b = 2\nc = 3";
    expect(press(text, [grow, grow, grow, grow], PYTHON)).toBe("for i in r:\n«    a = 1\n    b = 2»\nc = 3");
  });

  it("shrinks back along the same steps", () => {
    expect(press("    total += Math.max(a▮b, c);", [grow, grow, grow, shrink], JAVA)).toBe(
      "    total += Math.max(«ab, c»);",
    );
    // Retracing ends where Extend started: the caret back where it was.
    expect(press("x = f(a▮b);", [grow, shrink])).toBe("x = f(a▮b);");
  });

  it("retraces Extend from a call back to the call, not to the statement's first word", () => {
    expect(press("        int total = Math.ma▮x(a, b);", [grow, grow, grow, shrink], JAVA)).toBe(
      "        int total = «Math.max(a, b)»;",
    );
  });

  it("uses Alt+Shift+Right and Left off a Mac, since Ctrl+W closes the tab", () => {
    expect(one("x = a▮b;", key("ArrowRight", { alt: true, shift: true }))).toBe("x = «ab»;");
    // A selection Extend did not make shrinks to the largest step inside it.
    expect(one("y = «ab»;", key("ArrowLeft", { alt: true, shift: true }))).toBe("y = ▮ab;");
    expect(one("x = a▮b;", key("ArrowUp", { alt: true }))).toBe("null");
  });
});

describe("Angle brackets", () => {
  it("pairs after a Java type name and steps over the closer", () => {
    expect(typed("List▮", "<")).toBe("List<▮>");
    expect(typed("Map▮", "<String, Integer>")).toBe("Map<String, Integer>▮");
    expect(typed("ArrayList▮", "<ArrayList<Integer>>")).toBe("ArrayList<ArrayList<Integer>>▮");
  });

  it("pairs after a C++ template name and #include", () => {
    expect(typed("vector▮", "<", CPP)).toBe("vector<▮>");
    expect(typed("vector<pair▮>", "<", CPP)).toBe("vector<pair<▮>>");
    expect(typed("#include ▮", "<", CPP)).toBe("#include <▮>");
  });

  it("never pairs a comparison", () => {
    expect(typed("if (a ▮", "<")).toBe("if (a <▮");
    expect(typed("i▮", "<n")).toBe("i<n▮");
    expect(typed("i▮", "<", CPP)).toBe("i<▮");
    expect(typed("N▮", "<")).toBe("N<▮");
    expect(typed("x = 1 ▮", "<", PYTHON)).toBe("x = 1 <▮");
  });

  it("Backspace on an empty pair deletes both halves", () => {
    expect(one("List<▮>", key("Backspace"))).toBe("List▮");
    expect(one("a <▮>", key("Backspace"))).toBe("null");
  });
});

describe("Join Lines, Toggle Case, Move Caret to Matching Brace", () => {
  it("joins the next line with one space, none before a closer", () => {
    expect(one("int x▮ =\n        5;", key("J", { ctrl: true, shift: true }))).toBe("int x =▮ 5;");
    expect(one("f(a▮\n    );", key("J", { ctrl: true, shift: true }))).toBe("f(a▮);");
    expect(one("int x▮ =\n        5;", key("J", { ctrl: true, shift: true, mac: true, code: "KeyJ" }))).toBe("int x =▮ 5;");
  });

  it("toggles the word's case with Mod+Shift+U", () => {
    expect(one("int max▮Value;", key("U", { ctrl: true, shift: true }))).toBe("int MAX▮VALUE;");
    expect(one("int «MAX»;", key("U", { meta: true, shift: true, mac: true }))).toBe("int «max»;");
  });

  it("jumps between matching brackets", () => {
    const moveWin = key("M", { ctrl: true, shift: true });
    const moveMac = key("m", { ctrl: true, mac: true, code: "KeyM" });
    expect(one("f▮(a, (b));", moveWin)).toBe("f(a, (b)▮);");
    expect(one("f(a, (b)▮);", moveWin)).toBe("f▮(a, (b));");
    expect(one("while (x) {\n    a();▮\n}", moveMac)).toBe("while (x) ▮{\n    a();\n}");
  });
});

describe("Move Statement", () => {
  const up = key("ArrowUp", { ctrl: true, shift: true });
  const down = key("ArrowDown", { ctrl: true, shift: true });

  it("moves a line past a whole block", () => {
    const text = "    int a▮ = 1;\n    if (x) {\n        b();\n    }\n    c();";
    expect(one(text, down)).toBe("    if (x) {\n        b();\n    }\n    int a▮ = 1;\n    c();");
  });

  it("moves a block as a unit", () => {
    const text = "    c();\n    for▮ (;;) {\n        b();\n    }";
    expect(one(text, up)).toBe("    for▮ (;;) {\n        b();\n    }\n    c();");
  });

  it("leaves the block with the header's indent at its edge", () => {
    expect(one("    if (x) {\n        a▮();\n    }", up)).toBe("    a▮();\n    if (x) {\n    }");
  });

  it("moves a Python block and keeps a statement inside its own block", () => {
    const text = "x = 1▮\nfor i in r:\n    a = i\ny = 2";
    expect(one(text, down, PYTHON)).toBe("for i in r:\n    a = i\nx = 1▮\ny = 2");
    expect(one("for i in r:\n    a▮ = i", up, PYTHON)).toBe("for i in r:\n    a▮ = i");
  });
});

describe("Enter in a string and in an open parenthesis", () => {
  it("splits a Java string into two joined by +", () => {
    expect(one('        String s = "abc▮def";', key("Enter"))).toBe('        String s = "abc" +\n                "▮def";');
  });

  it("uses the continuation indent inside an open call", () => {
    expect(one("    foo(a,▮", key("Enter"))).toBe("    foo(a,\n            ▮");
  });

  it("uses a hanging indent in Python, or lines up under the first argument", () => {
    expect(one("total = max(▮", key("Enter"), PYTHON)).toBe("total = max(\n    ▮");
    expect(one("total = max(a,▮", key("Enter"), PYTHON)).toBe("total = max(a,\n            ▮");
  });
});

describe("Templates fire only in their context", () => {
  it("does not expand inside a string or a comment", () => {
    expect(one('        String s = "sout▮";', key("Tab"))).not.toContain("System.out");
    expect(one("        // sout▮", key("Tab"))).toBe("null");
  });

  it("does not expand a statement template in the middle of an expression", () => {
    expect(one("vector<ll▮>", key("Tab"), CPP)).not.toContain("long long");
    expect(one("    int x = fori▮", key("Tab"))).toBe("null");
  });

  it("does not expand mid-identifier", () => {
    expect(one("    sout▮put", key("Tab"))).toBe("null");
  });

  it("expands main only at the top level", () => {
    expect(one("main▮", key("Tab"), PYTHON)).toContain("__main__");
    expect(one("def f():\n    main▮", key("Tab"), PYTHON)).toBe("null");
    expect(one("int f() {\n    main▮\n}", key("Tab"), CPP)).toBe("null");
    expect(one("class Main {\n    void f() {\n        psvm▮\n    }\n}", key("Tab"))).toBe("null");
  });

  it("still expands after an if header on the same line", () => {
    expect(one("        if (x) sout▮", key("Tab"))).toContain("System.out.println(");
  });
});

describe("unchanged keys", () => {
  it("never answers plain Mod+Enter, the surface's submit key", () => {
    expect(one("a▮", key("Enter", { ctrl: true }))).toBe("null");
    expect(one("a▮", key("Enter", { meta: true, mac: true }))).toBe("null");
  });

  it("types Option characters on a Mac as text", () => {
    expect(one("x = ▮", key("[", { alt: true, mac: true }))).toBe("x = [▮]");
  });

  it("matches nothing for keys the browser keeps", () => {
    expect(one("a▮", key("w", { ctrl: true }))).toBe("null");
    expect(one("a▮", key("w", { meta: true, mac: true }))).toBe("null");
    expect(one("a▮", key("t", { ctrl: true }))).toBe("null");
    expect(one("a▮", key("n", { meta: true, mac: true }))).toBe("null");
  });
});

describe("engineShortcuts", () => {
  it("lists each platform's keys, with Alt+Shift+Right / Left standing in for Ctrl+W off a Mac", () => {
    const win = engineShortcuts(false, JAVA).flatMap((shortcut) => shortcut.keys);
    const mac = engineShortcuts(true, JAVA).flatMap((shortcut) => shortcut.keys);
    expect(win).toContain("Alt + Shift + Right / Left");
    expect(win).toContain("Ctrl + Y");
    expect(mac).toContain("Option + Up / Down");
    expect(mac).toContain("Cmd + Backspace");
    expect([...win, ...mac].some((label) => label.includes("Ctrl + W"))).toBe(false);
  });

  it("leaves the block comment out for Python and writes no em dash or middle dot", () => {
    expect(engineShortcuts(false, PYTHON).map((shortcut) => shortcut.action)).not.toContain("Block comment");
    for (const shortcut of [...engineShortcuts(true, CPP), ...engineShortcuts(false, CPP)]) {
      expect(`${shortcut.keys.join(" ")} ${shortcut.action}`).not.toMatch(/[\u2014\u00b7]/);
    }
  });
});
