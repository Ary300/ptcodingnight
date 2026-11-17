import { describe, expect, it } from "vitest";

import { isBrowserOwnedChord, isGuardedChord, type Chord } from "@/components/contest/editor/commands/keymap";
import { editorShortcutGroups } from "@/components/contest/editor/commands/shortcuts";
import {
  applyCompletion,
  applyCompletionReplacing,
  completionContext,
  completionsFor,
} from "@/components/contest/editor/smart/completion";
import { CPP } from "@/components/contest/editor/smart/cpp";
import { handleKey } from "@/components/contest/editor/smart/engine";
import { JAVA } from "@/components/contest/editor/smart/java";
import { PYTHON } from "@/components/contest/editor/smart/python";
import { reindentLines } from "@/components/contest/editor/smart/reindent";
import { engineShortcuts } from "@/components/contest/editor/smart/shortcuts";
import type { Edit, EditState, KeyInput, LanguageProfile } from "@/components/contest/editor/smart/types";

/** The second batch of checker reports: Tab-replace, Reformat, switch labels, guards, imports. */

function at(marked: string): EditState {
  const open = marked.indexOf("«");
  if (open !== -1) {
    const close = marked.indexOf("»");
    const text = marked.slice(0, open) + marked.slice(open + 1, close) + marked.slice(close + 1);
    return { text, selectionStart: open, selectionEnd: close - 1 };
  }
  const caret = marked.indexOf("|");
  return { text: marked.slice(0, caret) + marked.slice(caret + 1), selectionStart: caret, selectionEnd: caret };
}

function draw(state: EditState, edit: Edit): string {
  const text = state.text.slice(0, edit.from) + edit.insert + state.text.slice(edit.to);
  if (edit.selectionStart === edit.selectionEnd) return `${text.slice(0, edit.selectionStart)}|${text.slice(edit.selectionStart)}`;
  return `${text.slice(0, edit.selectionStart)}«${text.slice(edit.selectionStart, edit.selectionEnd)}»${text.slice(edit.selectionEnd)}`;
}

function key(name: string, mods: Partial<KeyInput> = {}): KeyInput {
  return { key: name, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, isMac: false, ...mods };
}

function pick(marked: string, profile: LanguageProfile, label: string) {
  const state = at(marked);
  const ctx = completionContext(state.text, state.selectionStart, profile.lineComment);
  if (ctx === null) throw new Error("no context");
  const item = completionsFor(ctx, state.text, profile, 500).find((candidate) => candidate.label.startsWith(label));
  if (item === undefined) throw new Error(`${label} not offered`);
  return { state, ctx, item };
}

describe("Tab in the popup replaces the rest of the word, Enter inserts", () => {
  it("reuses a call that is already written", () => {
    const java = pick("        String s = sc.next|Int();", JAVA, "nextLine");
    expect(draw(java.state, applyCompletionReplacing(java.state, java.ctx, java.item, JAVA))).toBe(
      "        String s = sc.nextLine()|;",
    );
    const python = pick("x = input().sp|trip()", PYTHON, "split");
    expect(draw(python.state, applyCompletionReplacing(python.state, python.ctx, python.item, PYTHON))).toBe(
      "x = input().split(|)",
    );
  });

  it("replaces a bare word and writes the call", () => {
    const cpp = pick("int main() {\n    vector<int> v;\n    v.p|ush;\n}", CPP, "push_back");
    expect(draw(cpp.state, applyCompletionReplacing(cpp.state, cpp.ctx, cpp.item, CPP))).toBe(
      "int main() {\n    vector<int> v;\n    v.push_back(|);\n}",
    );
  });

  it("leaves Enter inserting in front of the word", () => {
    const java = pick("        String s = sc.next|Int();", JAVA, "nextLine");
    expect(draw(java.state, applyCompletion(java.state, java.ctx, java.item, JAVA))).toBe(
      "        String s = sc.nextLine()|Int();",
    );
  });
});

describe("Reformat Code and Auto-Indent Lines", () => {
  const reformatMac = key("¬", { metaKey: true, altKey: true, isMac: true, code: "KeyL" });
  const reformatPc = key("l", { ctrlKey: true, altKey: true, code: "KeyL" });
  const indentMac = key("ˆ", { ctrlKey: true, altKey: true, isMac: true, code: "KeyI" });

  it("re-indents every line by brace depth and strips trailing space", () => {
    const state = at("int main() {\nint a;   \n        int b;|\nif (a) {\nb++;\n}\n}");
    const edit = handleKey(state, reformatPc, CPP);
    expect(edit === null ? null : draw(state, edit)).toBe(
      "int main() {\n    int a;\n    int b;|\n    if (a) {\n        b++;\n    }\n}",
    );
    expect(handleKey(state, reformatMac, CPP)).not.toBeNull();
  });

  it("puts case labels one level inside their switch and the statements one more", () => {
    const state = at("switch (x) {\ncase 1:\ny = 2;\nbreak;\ndefault:\ny = 3;\n}|");
    const edit = reindentLines(state, JAVA, true);
    expect(draw(state, edit)).toBe(
      "switch (x) {\n    case 1:\n        y = 2;\n        break;\n    default:\n        y = 3;\n}|",
    );
  });

  it("indents only the caret's line with Auto-Indent", () => {
    const state = at("class A {\nint a;|\nint b;\n}");
    const edit = handleKey(state, indentMac, JAVA);
    expect(edit === null ? null : draw(state, edit)).toBe("class A {\n    int a;|\nint b;\n}");
  });

  it("widens Python's tabs to four spaces without touching the structure", () => {
    const state = at("if x:\n\ty = 1  |");
    const edit = handleKey(state, reformatPc, PYTHON);
    expect(edit === null ? null : draw(state, edit)).toBe("if x:\n    y = 1|");
  });

  it("is the editor's key even when nothing changes, so Chrome's Downloads never opens", () => {
    const state = at("int a;|");
    const edit = handleKey(state, reformatMac, CPP);
    expect(edit).not.toBeNull();
  });

  it("leaves a block comment's lines alone", () => {
    const state = at("class A {\n/*\n   keep\n*/\nint a;|\n}");
    const edit = reindentLines(state, JAVA, true);
    expect(draw(state, edit)).toBe("class A {\n    /*\n   keep\n*/\n    int a;|\n}");
  });
});

describe("switch labels while typing", () => {
  it("snaps default: back to the case labels after a break", () => {
    const state = at("    switch (x) {\n        case 1:\n            y = 2;\n            break;\n            default|");
    const edit = handleKey(state, key(":"), JAVA);
    expect(edit === null ? null : draw(state, edit)).toBe(
      "    switch (x) {\n        case 1:\n            y = 2;\n            break;\n        default:|",
    );
  });

  it("leaves a label already in place, and a colon anywhere else", () => {
    expect(handleKey(at("    switch (x) {\n        case 1|"), key(":"), JAVA)).toBeNull();
    expect(handleKey(at("    int y = a ? b |"), key(":"), JAVA)).toBeNull();
  });
});

describe("browser chords off and on a Mac", () => {
  const chord = (over: Partial<Chord>): Chord => ({
    key: "",
    code: "",
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    isMac: false,
    ...over,
  });

  it("stops Alt+Left and Alt+Right (Back, Forward) off a Mac, and leaves Option+arrows on a Mac", () => {
    expect(isGuardedChord(chord({ key: "ArrowLeft", altKey: true }))).toBe(true);
    expect(isGuardedChord(chord({ key: "ArrowRight", altKey: true }))).toBe(true);
    expect(isGuardedChord(chord({ key: "ArrowLeft", altKey: true, isMac: true }))).toBe(false);
  });

  it("stops IntelliJ's Mac navigation chords Chrome would act on", () => {
    expect(isGuardedChord(chord({ key: "o", code: "KeyO", metaKey: true, shiftKey: true, isMac: true }))).toBe(true);
    expect(isGuardedChord(chord({ key: "1", code: "Digit1", metaKey: true, isMac: true }))).toBe(true);
    expect(isGuardedChord(chord({ key: "∫", code: "KeyB", metaKey: true, altKey: true, isMac: true }))).toBe(true);
    expect(isGuardedChord(chord({ key: "*", code: "Digit8", metaKey: true, shiftKey: true, isMac: true }))).toBe(true);
  });

  it("never claims Cmd+W, Cmd+T, Cmd+N or Cmd+Q", () => {
    for (const letter of ["w", "t", "n", "q"]) {
      expect(isBrowserOwnedChord(chord({ key: letter, code: `Key${letter.toUpperCase()}`, metaKey: true, isMac: true }))).toBe(true);
    }
  });
});

describe("the shortcuts popover lists only keys a browser leaves to the page", () => {
  it("drops Ctrl+Shift+J and Alt+Space off a Mac, and lists Reformat", () => {
    const rows = (isMac: boolean) =>
      editorShortcutGroups({ isMac, smart: true, templateExample: "sout", engine: engineShortcuts(isMac, JAVA) })
        .flatMap((group) => group.rows)
        .flatMap((row) => row.keys);
    expect(rows(false)).not.toContain("Ctrl + Shift + J");
    expect(rows(false)).not.toContain("Alt + Space");
    expect(rows(true)).toContain("Ctrl + Shift + J");
    expect(rows(true)).toContain("Option + Space");
    expect(rows(true)).toContain("Cmd + Option + L");
    expect(rows(false)).toContain("Ctrl + Alt + L");
  });
});

describe("imports", () => {
  it("std::vector brings its #include as bare vector does", () => {
    const { state, ctx, item } = pick("#include <iostream>\n\nint main() {\n    std::vec|\n}", CPP, "vector");
    const edit = applyCompletion(state, ctx, item, CPP);
    expect(draw(state, edit)).toBe("#include <iostream>\n#include <vector>\n\nint main() {\n    std::vector|\n}");
  });

  it("offers sqrt, gcd and inf with their from-math import", () => {
    for (const [typed, name] of [["r = sqr|", "sqrt"], ["g = gc|", "gcd"], ["x = in|", "inf"]] as const) {
      const { state, ctx, item } = pick(typed, PYTHON, name);
      const text = draw(state, applyCompletion(state, ctx, item, PYTHON));
      expect(text.startsWith(`from math import ${name}\n`)).toBe(true);
    }
  });

  it("puts a Python import under the module docstring", () => {
    const { state, ctx, item } = pick('"""Solution."""\nq = deq|', PYTHON, "deque");
    expect(draw(state, applyCompletion(state, ctx, item, PYTHON))).toBe(
      '"""Solution."""\nfrom collections import deque\nq = deque|',
    );
  });
});
