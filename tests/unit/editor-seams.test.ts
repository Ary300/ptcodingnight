import { describe, expect, it } from "vitest";

import { nextDiagnostic } from "@/components/contest/editor/commands/errors";
import { commandFor, isGuardedChord, type Chord } from "@/components/contest/editor/commands/keymap";
import { editorShortcutGroups } from "@/components/contest/editor/commands/shortcuts";
import { handleKey } from "@/components/contest/editor/smart/engine";
import { JAVA } from "@/components/contest/editor/smart/java";
import { engineShortcuts } from "@/components/contest/editor/smart/shortcuts";
import type { EditState, KeyInput } from "@/components/contest/editor/smart/types";

/**
 * The seams between the four editor groups: the commands' keymap runs BEFORE the engine, so a
 * command chord that matched an engine key would silently take it away; the shortcuts popover
 * lists both; F2 walks the marks group's error lines; Alt+/ is completion's Cyclic Expand Word.
 */

function chord(isMac: boolean, key: string, code: string, mods: Partial<Omit<Chord, "key" | "code" | "isMac">> = {}): Chord {
  return {
    key,
    code,
    isMac,
    shiftKey: mods.shiftKey ?? false,
    altKey: mods.altKey ?? false,
    ctrlKey: mods.ctrlKey ?? false,
    metaKey: mods.metaKey ?? false,
  };
}

function keyInput(c: Chord): KeyInput {
  return { key: c.key, code: c.code, isMac: c.isMac, shiftKey: c.shiftKey, altKey: c.altKey, ctrlKey: c.ctrlKey, metaKey: c.metaKey };
}

const STATE: EditState = {
  text: "class Main {\n    void f() {\n        int abc = foo(1, 2);\n        int d = 4;\n    }\n}\n",
  selectionStart: 40,
  selectionEnd: 40,
};

/** Every chord the engine answers, per platform, as handleKey reads it. */
const ENGINE_CHORDS: readonly (readonly [string, Chord])[] = [
  ["Mac delete line", chord(true, "Backspace", "Backspace", { metaKey: true })],
  ["Win delete line", chord(false, "y", "KeyY", { ctrlKey: true })],
  ["Mac delete word", chord(true, "Backspace", "Backspace", { altKey: true })],
  ["Win delete word", chord(false, "Backspace", "Backspace", { ctrlKey: true })],
  ["Mac smart home", chord(true, "ArrowLeft", "ArrowLeft", { metaKey: true })],
  ["Win smart home", chord(false, "Home", "Home")],
  ["Mac complete statement", chord(true, "Enter", "Enter", { metaKey: true, shiftKey: true })],
  ["Win complete statement", chord(false, "Enter", "Enter", { ctrlKey: true, shiftKey: true })],
  ["Mac new line before", chord(true, "Enter", "Enter", { metaKey: true, altKey: true })],
  ["Win new line before", chord(false, "Enter", "Enter", { ctrlKey: true, altKey: true })],
  ["Mac block comment", chord(true, "÷", "Slash", { metaKey: true, altKey: true })],
  ["Win block comment", chord(false, "?", "Slash", { ctrlKey: true, shiftKey: true })],
  ["Mac move statement", chord(true, "ArrowDown", "ArrowDown", { metaKey: true, shiftKey: true })],
  ["Win move statement", chord(false, "ArrowUp", "ArrowUp", { ctrlKey: true, shiftKey: true })],
  ["Mac toggle case", chord(true, "u", "KeyU", { metaKey: true, shiftKey: true })],
  ["Win join lines", chord(false, "J", "KeyJ", { ctrlKey: true, shiftKey: true })],
  ["Mac join lines", chord(true, "J", "KeyJ", { metaKey: true, shiftKey: true })],
  ["Mac matching brace", chord(true, "m", "KeyM", { ctrlKey: true })],
  ["Win matching brace", chord(false, "M", "KeyM", { ctrlKey: true, shiftKey: true })],
  ["Mac extend selection", chord(true, "ArrowUp", "ArrowUp", { altKey: true })],
  ["Win extend selection", chord(false, "ArrowRight", "ArrowRight", { altKey: true, shiftKey: true })],
  ["Mac duplicate", chord(true, "d", "KeyD", { metaKey: true })],
  ["Win comment", chord(false, "/", "Slash", { ctrlKey: true })],
  ["Win move line", chord(false, "ArrowDown", "ArrowDown", { altKey: true, shiftKey: true })],
];

describe("the commands' keymap leaves the engine's keys to the engine", () => {
  it.each(ENGINE_CHORDS)("%s is not a command, and the engine answers it", (_name, input) => {
    expect(commandFor(input)).toBeNull();
    expect(handleKey(STATE, keyInput(input), JAVA)).not.toBeNull();
  });

  it("guards Ctrl+Y and Cmd+D only after the engine had its turn", () => {
    expect(isGuardedChord(chord(false, "y", "KeyY", { ctrlKey: true }))).toBe(true);
    expect(isGuardedChord(chord(true, "d", "KeyD", { metaKey: true }))).toBe(true);
  });
});

describe("Cyclic Expand Word and error navigation chords", () => {
  it("matches Option+/ on a Mac by the physical key, though it types a division sign", () => {
    expect(commandFor(chord(true, "÷", "Slash", { altKey: true }))).toBe("expandWord");
    expect(commandFor(chord(true, "¿", "Slash", { altKey: true, shiftKey: true }))).toBe("expandWordBackward");
    expect(commandFor(chord(false, "/", "Slash", { altKey: true }))).toBe("expandWord");
  });

  it("leaves Cmd+Option+/ to the engine's block comment", () => {
    expect(commandFor(chord(true, "÷", "Slash", { altKey: true, metaKey: true }))).toBeNull();
  });

  it("answers F2 and Shift+F2, and Mod+Alt+Down and Up where there are no F-keys", () => {
    expect(commandFor(chord(false, "F2", "F2"))).toBe("nextError");
    expect(commandFor(chord(true, "F2", "F2", { shiftKey: true }))).toBe("previousError");
    expect(commandFor(chord(false, "ArrowDown", "ArrowDown", { ctrlKey: true, altKey: true }))).toBe("nextError");
    expect(commandFor(chord(true, "ArrowUp", "ArrowUp", { metaKey: true, altKey: true }))).toBe("previousError");
    // Mod+Shift+Up is the engine's Move Statement, never an error jump.
    expect(commandFor(chord(true, "ArrowUp", "ArrowUp", { metaKey: true, shiftKey: true }))).toBeNull();
  });
});

describe("nextDiagnostic", () => {
  const items = [
    { line: 7, column: null, message: "b" },
    { line: 3, column: 5, message: "a" },
    { line: 3, column: 9, message: "a2" },
    { line: 12, column: null, message: "c" },
  ];

  it("goes to the first error line after the caret, and wraps to the top", () => {
    expect(nextDiagnostic(items, 1, 1)?.message).toBe("a");
    expect(nextDiagnostic(items, 3, 1)?.message).toBe("b");
    expect(nextDiagnostic(items, 12, 1)?.message).toBe("a");
  });

  it("goes backward the same way, wrapping to the bottom", () => {
    expect(nextDiagnostic(items, 7, -1)?.message).toBe("a");
    expect(nextDiagnostic(items, 2, -1)?.message).toBe("c");
  });

  it("is null with no errors", () => {
    expect(nextDiagnostic([], 1, 1)).toBeNull();
  });
});

describe("the shortcuts popover lists the engine's keys once", () => {
  for (const isMac of [true, false]) {
    it(isMac ? "on a Mac" : "elsewhere", () => {
      const groups = editorShortcutGroups({ isMac, smart: true, templateExample: "sout", engine: engineShortcuts(isMac, JAVA) });
      const actions = groups.flatMap((group) => group.rows.map((row) => row.action));
      expect(actions).toContain("Delete the line");
      expect(actions).toContain("Extend or shrink the selection");
      expect(actions).toContain("Complete the word from the file");
      expect(actions).toContain("Next error line from the last run");
      expect(actions.filter((action) => action.startsWith("Move the line"))).toHaveLength(1);
      expect(new Set(actions).size).toBe(actions.length);
      expect(JSON.stringify(groups)).not.toMatch(/[—·]/);
      expect(groups[0]?.rows[0]?.action).toBe("Move focus out of the editor");
    });
  }
});
