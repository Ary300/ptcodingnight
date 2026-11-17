import { describe, expect, it } from "vitest";

import { CPP } from "@/components/contest/editor/smart/cpp";
import { JAVA } from "@/components/contest/editor/smart/java";
import { cleanPastedText, reindentPaste } from "@/components/contest/editor/smart/paste";
import { PYTHON } from "@/components/contest/editor/smart/python";
import { surroundKindsFor, surroundWith } from "@/components/contest/editor/smart/surround";
import type { Edit, EditState, LanguageProfile } from "@/components/contest/editor/smart/types";

/** "▮" is the caret and "«...»" a selection, as in the other editor tests. */
const CARET = "▮";

function state(marked: string): EditState {
  const open = marked.indexOf("«");
  if (open !== -1) {
    const close = marked.indexOf("»");
    const text = marked.slice(0, open) + marked.slice(open + 1, close) + marked.slice(close + 1);
    return { text, selectionStart: open, selectionEnd: close - 1 };
  }
  const caret = marked.indexOf(CARET);
  return { text: marked.replace(CARET, ""), selectionStart: caret, selectionEnd: caret };
}

function draw(before: EditState, edit: Edit): string {
  const text = before.text.slice(0, edit.from) + edit.insert + before.text.slice(edit.to);
  const { selectionStart: a, selectionEnd: b } = edit;
  if (a === b) return text.slice(0, a) + CARET + text.slice(a);
  return `${text.slice(0, a)}«${text.slice(a, b)}»${text.slice(b)}`;
}

function paste(marked: string, clipboard: string, profile: LanguageProfile = JAVA): string {
  const before = state(marked);
  return draw(before, reindentPaste(before.text, clipboard, before, profile));
}

function surround(marked: string, kind: string, profile: LanguageProfile = JAVA): string {
  const before = state(marked);
  const edit = surroundWith(before, kind, profile);
  if (edit === null) return "null";
  return draw(before, edit);
}

describe("reindentPaste", () => {
  it("re-bases a pasted block onto the caret's indent", () => {
    const block = "if (x) {\n            a();\n        }";
    expect(paste("void f() {\n    ▮\n}", block)).toBe("void f() {\n    if (x) {\n        a();\n    }▮\n}");
  });

  it("drops the first line's own indent when only whitespace precedes the caret", () => {
    expect(paste("    ▮", "        int a;\n        int b;")).toBe("    int a;\n    int b;▮");
  });

  it("keeps the rest of the caret line at its indent after a paste ending in a newline", () => {
    expect(paste("    ▮foo();", "a();\nb();\n")).toBe("    a();\n    b();\n    ▮foo();");
  });

  it("turns tabs into indent units, so Python never mixes them", () => {
    expect(paste("def f():\n    ▮", "if x:\n\t\tpass", PYTHON)).toBe("def f():\n    if x:\n        pass▮");
  });

  it("normalises Windows line endings and strips non-breaking and zero-width characters", () => {
    expect(paste("▮", "int\u00a0a;\r\nint b;\u200b")).toBe("int a;\nint b;▮");
  });

  it("straightens curly quotes in code, but not inside a string the paste or the editor holds", () => {
    expect(paste("▮", "System.out.println(\u201chi\u201d);")).toBe('System.out.println("hi");▮');
    expect(paste("▮", 's = "he said \u201chi\u201d"', PYTHON)).toBe('s = "he said \u201chi\u201d"▮');
    expect(paste('s = "▮"', "\u201cquoted\u201d", PYTHON)).toBe('s = "\u201cquoted\u201d▮"');
  });

  it("replaces the selection", () => {
    expect(paste("int «a» = 1;", "b")).toBe("int b▮ = 1;");
  });

  it("cleanPastedText leaves quotes alone outside code", () => {
    expect(cleanPastedText("\u201cx\u201d\r\n", false)).toBe("\u201cx\u201d\n");
  });
});

describe("surroundWith", () => {
  it("lists IntelliJ's kinds for each language, with plain labels", () => {
    expect(surroundKindsFor(JAVA).map((kind) => kind.id)).toEqual([
      "if",
      "if-else",
      "while",
      "do-while",
      "for",
      "try-catch",
      "try-finally",
      "block",
    ]);
    expect(surroundKindsFor(PYTHON).map((kind) => kind.label)).toContain("try / except");
    for (const kind of [...surroundKindsFor(JAVA), ...surroundKindsFor(CPP), ...surroundKindsFor(PYTHON)]) {
      expect(kind.label).not.toMatch(/[\u2014\u00b7]/);
    }
  });

  it("wraps the selected lines in an if with the caret in the condition", () => {
    expect(surround("    «a();\n    b();»", "if")).toBe("    if (▮) {\n        a();\n        b();\n    }");
  });

  it("wraps the caret's line when nothing is selected, and carries the next stops", () => {
    const before = state("    a▮();");
    const edit = surroundWith(before, "if", JAVA);
    expect(edit?.tabStops?.length).toBe(1);
    expect(surround("    a▮();", "while")).toBe("    while (▮) {\n        a();\n    }");
  });

  it("puts the default exception name in the first field of a try / catch", () => {
    expect(surround("    «risky();»", "try-catch")).toBe(
      "    try {\n        risky();\n    } catch («Exception» e) {\n        \n    }",
    );
  });

  it("writes Python's blocks with a colon and no braces", () => {
    expect(surround("«x = 1»", "if", PYTHON)).toBe("if ▮:\n    x = 1");
    expect(surround("«x = 1»", "try-except", PYTHON)).toBe("try:\n    x = 1\nexcept «Exception»:\n    pass");
  });

  it("returns null for a kind the language does not have", () => {
    expect(surround("«x = 1»", "do-while", PYTHON)).toBe("null");
    expect(surround("«a();»", "try-finally", CPP)).toBe("null");
  });
});
