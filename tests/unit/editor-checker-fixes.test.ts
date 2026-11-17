import { describe, expect, it } from "vitest";

import { lineCopyOf, lineCutOf, linePasteOf } from "@/components/contest/editor/commands/line-clipboard";
import { occurrenceKeyOf } from "@/components/contest/editor/commands/occurrences";
import {
  acceptsOnCharacter,
  completionContext,
  completionsFor,
  inDeclarationName,
  typedInFull,
} from "@/components/contest/editor/smart/completion";
import { CPP } from "@/components/contest/editor/smart/cpp";
import { handleKey } from "@/components/contest/editor/smart/engine";
import { JAVA } from "@/components/contest/editor/smart/java";
import { PYTHON } from "@/components/contest/editor/smart/python";
import type { Edit, EditState, LanguageProfile } from "@/components/contest/editor/smart/types";
import { clampSelection, createSelectionMemory, SELECTION_MEMORY_LIMIT } from "@/components/contest/editor/undo-selection";

/**
 * Regressions found by typing real programs into the editor in a browser, one per checker report.
 * `type` presses every character the way the surface does: the engine answers it, or the browser
 * types it, so a line typed straight through must come out exactly as written.
 */

function at(marked: string): EditState {
  const caret = marked.indexOf("|");
  return { text: marked.slice(0, caret) + marked.slice(caret + 1), selectionStart: caret, selectionEnd: caret };
}

function draw(state: EditState): string {
  return `${state.text.slice(0, state.selectionStart)}|${state.text.slice(state.selectionEnd)}`;
}

function apply(state: EditState, edit: Edit): EditState {
  return {
    text: state.text.slice(0, edit.from) + edit.insert + state.text.slice(edit.to),
    selectionStart: edit.selectionStart,
    selectionEnd: edit.selectionEnd,
  };
}

function press(state: EditState, key: string, profile: LanguageProfile): EditState {
  const edit = handleKey(state, { key, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, isMac: false }, profile);
  if (edit !== null) return apply(state, edit);
  const { text, selectionStart: a, selectionEnd: b } = state;
  if (key === "Backspace") return { text: text.slice(0, a - 1) + text.slice(b), selectionStart: a - 1, selectionEnd: a - 1 };
  const ch = key === "Enter" ? "\n" : key;
  return { text: text.slice(0, a) + ch + text.slice(b), selectionStart: a + ch.length, selectionEnd: a + ch.length };
}

function type(start: string, typed: string, profile: LanguageProfile): string {
  let state = at(start);
  for (const ch of typed) state = press(state, ch === "\n" ? "Enter" : ch, profile);
  return draw(state);
}

describe("pairs inside strings and comments, typed straight through", () => {
  it("Java: brackets in a string are characters, and the line types as written", () => {
    expect(type("        System.out.println(|);", '"(" + a + ")"', JAVA)).toBe('        System.out.println("(" + a + ")"|);');
    expect(type("        |", 'String s = "say \\"hi\\"";', JAVA)).toBe('        String s = "say \\"hi\\"";|');
  });

  it("Java: a bracket or quote in a line comment gets no partner", () => {
    expect(type("        // read n, then call solve|", "(", JAVA)).toBe("        // read n, then call solve(|");
    expect(type("        // print |", '"', JAVA)).toBe('        // print "|');
  });

  it("Python: the lines the checker typed come out exactly", () => {
    for (const line of [
      'print("Case (" + str(i) + "):")',
      'print("[" + s + "]")',
      'print("{" + s + "}")',
      "w = [\"b's\", 'c']",
      "print('say \"hi\"')",
      's = "a\\"b"',
      '# don\'t print the "debug" values',
    ]) {
      expect(type("|", line, PYTHON)).toBe(`${line}|`);
    }
  });

  it("Python: closing a docstring typed in full leaves no stray quote", () => {
    expect(type("def f():\n    |", '"""Return it."""', PYTHON)).toBe('def f():\n    """Return it."""|');
  });

  it("C++: strings and chars holding brackets compile as typed", () => {
    for (const line of [
      'cout << "(" << x << ", " << y << ")" << endl;',
      "if (c == '(') x++;",
      "char c = '{';",
      'cout << "[";',
      'cout << "He said \\"hi\\"";',
      "char q = '\\'';",
    ]) {
      expect(type("int main() {\n    |\n}", line, CPP)).toBe(`int main() {\n    ${line}|\n}`);
    }
  });

  it("a closer the line still owes is typed, and one it does not owe is stepped over", () => {
    expect(type("int m = Math.max(a, Math.min(b, c|);", ")", JAVA)).toBe("int m = Math.max(a, Math.min(b, c)|);");
    expect(type("f(g(x|))", ")", JAVA)).toBe("f(g(x)|)");
    expect(type("x = [[1, 2|]", "]", PYTHON)).toBe("x = [[1, 2]|]");
  });

  it("Backspace on a '(' whose ')' closes an outer call takes only the '('", () => {
    expect(draw(press(at("int r = Math.abs((|);"), "Backspace", JAVA))).toBe("int r = Math.abs(|);");
    expect(draw(press(at("f((|))"), "Backspace", JAVA))).toBe("f(|)");
  });
});

describe("Python else in a loop", () => {
  const loop = "for x in a:\n    if x:\n        b = 1\n    else|";

  it("stays under its if instead of becoming the loop's for/else", () => {
    expect(type(loop, ":", PYTHON)).toBe("for x in a:\n    if x:\n        b = 1\n    else:|");
    expect(type("while x:\n    if x:\n        b = 1\n    else|", ":", PYTHON)).toBe(
      "while x:\n    if x:\n        b = 1\n    else:|",
    );
    const nested = "for i in a:\n    for j in b:\n        if j:\n            c = 1\n        else|";
    expect(type(nested, ":", PYTHON)).toBe(`${nested.slice(0, -1)}:|`);
  });

  it("still snaps an over-indented else back to its if", () => {
    expect(type("if x:\n    y = 1\n    else|", ":", PYTHON)).toBe("if x:\n    y = 1\nelse:|");
  });

  it("types a whole if/else inside a loop with the right indents", () => {
    const typed = type("for x in a:\n    |", "if x:\nb = 1\n", PYTHON);
    expect(typed).toBe("for x in a:\n    if x:\n        b = 1\n        |");
    const state = press(at(typed), "Backspace", PYTHON);
    let next = state;
    for (const ch of "else:") next = press(next, ch, PYTHON);
    expect(draw(next)).toBe("for x in a:\n    if x:\n        b = 1\n    else:|");
  });
});

describe("completion after a declaration name", () => {
  function ctxOf(marked: string, profile: LanguageProfile) {
    const state = at(marked);
    const ctx = completionContext(state.text, state.selectionStart, profile.lineComment);
    if (ctx === null) throw new Error("no context");
    return { ctx, text: state.text };
  }

  it("knows a new variable's name, so the popup stays shut and Enter is a newline", () => {
    for (const marked of ["        int n|", "        char c|", "        Scanner sc|", "        List<Integer> li|", "        int[] ar|", "    for (String s|"]) {
      const { ctx, text } = ctxOf(marked, JAVA);
      expect(inDeclarationName(text, ctx, JAVA), marked).toBe(true);
    }
    for (const marked of ["    vector<int> v|", "    long long x|", "    const string& s|", "    Node* n|"]) {
      const { ctx, text } = ctxOf(marked, CPP);
      expect(inDeclarationName(text, ctx, CPP), marked).toBe(true);
    }
  });

  it("is not fooled by an expression or a keyword", () => {
    for (const marked of ["        return n|", "        x = ne|", "        new Sc|", "        System.out.pr|", "        if (a < b) c|"]) {
      const { ctx, text } = ctxOf(marked, JAVA);
      expect(inDeclarationName(text, ctx, JAVA), marked).toBe(false);
    }
  });

  it("never offers const or goto, nor yield outside a switch, in Java", () => {
    const { ctx, text } = ctxOf("        int count = 0;\n        co|", JAVA);
    const labels = completionsFor(ctx, text, JAVA).map((item) => item.label);
    expect(labels[0]).toBe("count");
    expect(labels).not.toContain("const");
    const y = ctxOf("        x = y|", JAVA);
    expect(completionsFor(y.ctx, y.text, JAVA).map((item) => item.label)).not.toContain("yield");
    const g = ctxOf("        go|", JAVA);
    expect(completionsFor(g.ctx, g.text, JAVA).map((item) => item.label)).not.toContain("goto");
  });

  it("treats a name typed in full as complete, so Enter is not eaten", () => {
    const { ctx, text } = ctxOf("import sys\ninput = sys.stdin.readline|", PYTHON);
    const items = completionsFor(ctx, text, PYTHON);
    const readline = items.find((item) => item.label.startsWith("readline") && !item.label.startsWith("readlines"));
    expect(readline).toBeDefined();
    if (readline !== undefined) expect(typedInFull(ctx, readline)).toBe(true);
    const readlines = items.find((item) => item.label.startsWith("readlines"));
    if (readlines !== undefined) expect(typedInFull(ctx, readlines)).toBe(false);
  });
});

describe("typing ( or . with the popup open", () => {
  function accepts(marked: string, ch: string, profile: LanguageProfile, label: string): boolean {
    const state = at(marked);
    const ctx = completionContext(state.text, state.selectionStart, profile.lineComment);
    if (ctx === null) throw new Error("no context");
    const items = completionsFor(ctx, state.text, profile);
    const item = items.find((candidate) => candidate.label.startsWith(label));
    if (item === undefined) throw new Error(`${label} not offered`);
    return acceptsOnCharacter(ch, ctx, items, item);
  }

  it("accepts the method a '(' starts and the name a '.' qualifies", () => {
    expect(accepts("        System.out.printl|", "(", JAVA, "println")).toBe(true);
    expect(accepts("le|", "(", PYTHON, "len")).toBe(true);
    expect(accepts("        Sys|", ".", JAVA, "System")).toBe(true);
  });

  it("leaves a name the file already spells exactly as typed", () => {
    expect(accepts("        Scanner sc = null;\n        sc|", ".", JAVA, "sc")).toBe(false);
  });
});

describe("the line clipboard", () => {
  const two = at("        int a| = 1;\n        int b = 2;");

  it("copies the whole caret line with its newline when nothing is selected", () => {
    expect(lineCopyOf(two)?.text).toBe("        int a = 1;\n");
    expect(lineCopyOf({ ...two, selectionEnd: two.selectionStart + 2 })).toBeNull();
  });

  it("cuts the line and keeps the caret's column on the line below", () => {
    const cut = lineCutOf(two);
    expect(cut === null ? null : draw(apply(two, cut))).toBe("        int b| = 2;");
    const last = at("a = 1\nb| = 2");
    const cutLast = lineCutOf(last);
    expect(cutLast === null ? null : draw(apply(last, cutLast))).toBe("a| = 1");
  });

  it("pastes a copied line above the caret's line, and any other text as usual", () => {
    const copied = "        int a = 1;\n";
    const below = at("        int a = 1;\n        int b| = 2;");
    const paste = linePasteOf(below, copied, copied);
    expect(paste === null ? null : draw(apply(below, paste))).toBe(
      "        int a = 1;\n        int a = 1;\n        int b| = 2;",
    );
    expect(linePasteOf(below, "zz", copied)).toBeNull();
    expect(linePasteOf(below, copied, null)).toBeNull();
  });
});

describe("Select Next Occurrence off a Mac", () => {
  const base = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };

  it("never types the J of a repeated Alt+J into the picked names", () => {
    expect(occurrenceKeyOf({ ...base, key: "j", altKey: true }, false)).toBeNull();
    expect(occurrenceKeyOf({ ...base, key: "J", altKey: true, shiftKey: true }, false)).toBeNull();
  });

  it("still types plain letters, and Option characters on a Mac", () => {
    expect(occurrenceKeyOf({ ...base, key: "x" }, false)).toEqual({ kind: "insert", text: "x" });
    expect(occurrenceKeyOf({ ...base, key: "∆", altKey: true }, true)).toEqual({ kind: "insert", text: "∆" });
  });
});

describe("the caret after undo and redo of a smart edit", () => {
  it("returns the caret from before the edit, and redo the one after it", () => {
    const memory = createSelectionMemory();
    memory.record("int a = 1;", [5, 5], "//int a = 1;", [12, 12]);
    expect(memory.afterUndo("int a = 1;")).toEqual([5, 5]);
    expect(memory.afterRedo("//int a = 1;")).toEqual([12, 12]);
    expect(memory.afterUndo("something typed since")).toBeNull();
  });

  it("forgets the oldest edits past its limit and clamps to the text", () => {
    const memory = createSelectionMemory();
    for (let i = 0; i <= SELECTION_MEMORY_LIMIT; i += 1) memory.record(`t${i}`, [0, 0], `u${i}`, [1, 1]);
    expect(memory.afterUndo("t0")).toBeNull();
    expect(memory.afterUndo(`t${SELECTION_MEMORY_LIMIT}`)).toEqual([0, 0]);
    expect(clampSelection([10, 12], 4)).toEqual([4, 4]);
  });
});
