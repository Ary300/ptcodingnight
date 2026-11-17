import { describe, expect, it } from "vitest";

import { commandFor, isBrowserOwnedChord, isGuardedChord, type Chord, type CommandId } from "@/components/contest/editor/commands/keymap";
import { editorShortcutGroups } from "@/components/contest/editor/commands/shortcuts";

/**
 * The editor's keymap: which chord is which IntelliJ command on each platform, which browser
 * chords are swallowed, and which the page must never touch.
 */

type Mods = Partial<Pick<Chord, "shiftKey" | "altKey" | "ctrlKey" | "metaKey">>;

function chord(key: string, code: string, isMac: boolean, mods: Mods = {}): Chord {
  return { key, code, isMac, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...mods };
}

const mac = (key: string, code: string, mods: Mods = {}): Chord => chord(key, code, true, mods);
const win = (key: string, code: string, mods: Mods = {}): Chord => chord(key, code, false, mods);

describe("commandFor on a Mac", () => {
  const cases: readonly [string, Chord, CommandId | null][] = [
    ["Cmd+S saves", mac("s", "KeyS", { metaKey: true }), "save"],
    ["Cmd+F finds", mac("f", "KeyF", { metaKey: true }), "find"],
    ["Cmd+R replaces", mac("r", "KeyR", { metaKey: true }), "replace"],
    ["Cmd+G is find next", mac("g", "KeyG", { metaKey: true }), "findNext"],
    ["Cmd+Shift+G is find previous", mac("G", "KeyG", { metaKey: true, shiftKey: true }), "findPrevious"],
    ["Cmd+L goes to a line", mac("l", "KeyL", { metaKey: true }), "goToLine"],
    ["Cmd+Option+T surrounds, matched by code because Option types a dagger", mac("†", "KeyT", { metaKey: true, altKey: true }), "surround"],
    ["Cmd+P is parameter info", mac("p", "KeyP", { metaKey: true }), "parameterInfo"],
    ["F1 is quick documentation", mac("F1", "F1"), "quickDoc"],
    ["Cmd+J inserts a live template, as IntelliJ does", mac("j", "KeyJ", { metaKey: true }), "insertTemplate"],
    ["Ctrl+J is not quick documentation on a Mac", mac("j", "KeyJ", { ctrlKey: true }), null],
    ["Ctrl+Shift+Option+Down clones the caret below", mac("ArrowDown", "ArrowDown", { ctrlKey: true, altKey: true, shiftKey: true }), "cloneCaretBelow"],
    ["Option+Shift+Up stays the engine's Move Line", mac("ArrowUp", "ArrowUp", { altKey: true, shiftKey: true }), null],
    ["Option+Return shows context actions", mac("Enter", "Enter", { altKey: true }), "contextActions"],
    ["Ctrl+Space completes", mac(" ", "Space", { ctrlKey: true }), "completion"],
    ["Option+Space completes, typed as a non-breaking space", mac(" ", "Space", { altKey: true }), "completion"],
    ["Ctrl+R runs, as in IntelliJ", mac("r", "KeyR", { ctrlKey: true }), "run"],
    ["Cmd+' runs", mac("'", "Quote", { metaKey: true }), "run"],
    ["Cmd+= makes the code bigger", mac("=", "Equal", { metaKey: true }), "fontBigger"],
    ["Cmd+- makes it smaller", mac("-", "Minus", { metaKey: true }), "fontSmaller"],
    ["Ctrl+G selects the next occurrence", mac("g", "KeyG", { ctrlKey: true }), "selectNextOccurrence"],
    ["Cmd+Ctrl+G selects all occurrences", mac("g", "KeyG", { ctrlKey: true, metaKey: true }), "selectAllOccurrences"],
    ["Ctrl+Shift+G unselects one", mac("G", "KeyG", { ctrlKey: true, shiftKey: true }), "unselectOccurrence"],
    ["Cmd+Enter is not a command (submit is settled elsewhere)", mac("Enter", "Enter", { metaKey: true }), null],
    ["Cmd+D is the engine's duplicate, not a command", mac("d", "KeyD", { metaKey: true }), null],
    ["a plain letter is typing", mac("f", "KeyF"), null],
  ];
  it.each(cases)("%s", (_name, input, expected) => {
    expect(commandFor(input)).toBe(expected);
  });
});

describe("commandFor on Windows and Linux", () => {
  const cases: readonly [string, Chord, CommandId | null][] = [
    ["Ctrl+S saves", win("s", "KeyS", { ctrlKey: true }), "save"],
    ["Ctrl+F finds", win("f", "KeyF", { ctrlKey: true }), "find"],
    ["Ctrl+R replaces, as IntelliJ does", win("r", "KeyR", { ctrlKey: true }), "replace"],
    ["F3 is find next", win("F3", "F3"), "findNext"],
    ["Shift+F3 is find previous", win("F3", "F3", { shiftKey: true }), "findPrevious"],
    ["Ctrl+G goes to a line", win("g", "KeyG", { ctrlKey: true }), "goToLine"],
    ["Ctrl+L is not go to line here", win("l", "KeyL", { ctrlKey: true }), null],
    ["Ctrl+Alt+T surrounds", win("t", "KeyT", { ctrlKey: true, altKey: true }), "surround"],
    ["Ctrl+P is parameter info", win("p", "KeyP", { ctrlKey: true }), "parameterInfo"],
    ["Ctrl+Q is quick documentation", win("q", "KeyQ", { ctrlKey: true }), "quickDoc"],
    ["F1 is quick documentation too", win("F1", "F1"), "quickDoc"],
    ["Ctrl+J inserts a live template", win("j", "KeyJ", { ctrlKey: true }), "insertTemplate"],
    ["Ctrl+Shift+Alt+Up clones the caret above", win("ArrowUp", "ArrowUp", { ctrlKey: true, altKey: true, shiftKey: true }), "cloneCaretAbove"],
    ["Ctrl+Shift+Alt+Down clones the caret below", win("ArrowDown", "ArrowDown", { ctrlKey: true, altKey: true, shiftKey: true }), "cloneCaretBelow"],
    ["Alt+Shift+Up stays the engine's Move Line", win("ArrowUp", "ArrowUp", { altKey: true, shiftKey: true }), null],
    ["Ctrl+Alt+Up stays previous error", win("ArrowUp", "ArrowUp", { ctrlKey: true, altKey: true }), "previousError"],
    ["Alt+Enter shows context actions", win("Enter", "Enter", { altKey: true }), "contextActions"],
    ["Ctrl+Space completes", win(" ", "Space", { ctrlKey: true }), "completion"],
    ["Shift+F10 runs", win("F10", "F10", { shiftKey: true }), "run"],
    ["Ctrl+' runs", win("'", "Quote", { ctrlKey: true }), "run"],
    ["Ctrl+Shift+= (Ctrl and +) makes the code bigger", win("+", "Equal", { ctrlKey: true, shiftKey: true }), "fontBigger"],
    ["Alt+J selects the next occurrence", win("j", "KeyJ", { altKey: true }), "selectNextOccurrence"],
    ["Ctrl+Alt+Shift+J selects all", win("J", "KeyJ", { altKey: true, ctrlKey: true, shiftKey: true }), "selectAllOccurrences"],
    ["Alt+Shift+J unselects", win("J", "KeyJ", { altKey: true, shiftKey: true }), "unselectOccurrence"],
    ["Ctrl+Enter is not a command", win("Enter", "Enter", { ctrlKey: true }), null],
    ["Ctrl+Shift+Enter is not a command", win("Enter", "Enter", { ctrlKey: true, shiftKey: true }), null],
    ["Ctrl+Y is the engine's delete line, not a command", win("y", "KeyY", { ctrlKey: true }), null],
  ];
  it.each(cases)("%s", (_name, input, expected) => {
    expect(commandFor(input)).toBe(expected);
  });
});

describe("isGuardedChord", () => {
  const guarded: readonly [string, Chord][] = [
    ["Mac Cmd+[ (Back)", mac("[", "BracketLeft", { metaKey: true })],
    ["Mac Cmd+] (Forward)", mac("]", "BracketRight", { metaKey: true })],
    ["Cmd+D bookmark when no profile duplicates", mac("d", "KeyD", { metaKey: true })],
    ["Ctrl+P print", win("p", "KeyP", { ctrlKey: true })],
    ["Ctrl+Shift+R hard reload", win("R", "KeyR", { ctrlKey: true, shiftKey: true })],
    ["Ctrl+J downloads", win("j", "KeyJ", { ctrlKey: true })],
    ["Ctrl+L address bar", win("l", "KeyL", { ctrlKey: true })],
    ["Ctrl+E search", win("e", "KeyE", { ctrlKey: true })],
    ["Ctrl+B bookmarks", win("b", "KeyB", { ctrlKey: true })],
    ["Ctrl+O open", win("o", "KeyO", { ctrlKey: true })],
    ["Mac Cmd+Y history", mac("y", "KeyY", { metaKey: true })],
    ["F5 reload", win("F5", "F5")],
    ["F12", win("F12", "F12")],
    ["Ctrl+Shift+A tab search", win("A", "KeyA", { ctrlKey: true, shiftKey: true })],
    ["Ctrl+Shift+Delete clear browsing data", win("Delete", "Delete", { ctrlKey: true, shiftKey: true })],
  ];
  it.each(guarded)("prevents %s", (_name, input) => {
    expect(isGuardedChord(input)).toBe(true);
  });

  const free: readonly [string, Chord][] = [
    ["Cmd+Z undo", mac("z", "KeyZ", { metaKey: true })],
    ["Cmd+C copy", mac("c", "KeyC", { metaKey: true })],
    ["Ctrl+V paste", win("v", "KeyV", { ctrlKey: true })],
    ["Ctrl+A select all", win("a", "KeyA", { ctrlKey: true })],
    ["a plain letter", win("p", "KeyP")],
  ];
  it.each(free)("leaves %s to the browser", (_name, input) => {
    expect(isGuardedChord(input)).toBe(false);
  });
});

describe("chords the browser owns are never claimed", () => {
  const owned: readonly Chord[] = [
    mac("w", "KeyW", { metaKey: true }),
    mac("t", "KeyT", { metaKey: true }),
    mac("n", "KeyN", { metaKey: true }),
    mac("q", "KeyQ", { metaKey: true }),
    win("w", "KeyW", { ctrlKey: true }),
    win("W", "KeyW", { ctrlKey: true, shiftKey: true }),
    win("t", "KeyT", { ctrlKey: true }),
    win("n", "KeyN", { ctrlKey: true }),
    win("J", "KeyJ", { ctrlKey: true, shiftKey: true }),
    win("I", "KeyI", { ctrlKey: true, shiftKey: true }),
    win("Tab", "Tab", { ctrlKey: true }),
  ];
  it.each(owned.map((input) => [`${input.isMac ? "mac" : "win"} ${input.code} ${JSON.stringify(input)}`, input] as const))(
    "%s",
    (_name, input) => {
      expect(isBrowserOwnedChord(input)).toBe(true);
      expect(commandFor(input)).toBeNull();
      expect(isGuardedChord(input)).toBe(false);
    },
  );
});

describe("the shortcuts popover", () => {
  it("lists the way out of the editor first, on both platforms", () => {
    for (const isMac of [true, false]) {
      const groups = editorShortcutGroups({ isMac, smart: true, templateExample: "sout" });
      expect(groups[0]?.rows[0]?.action).toBe("Move focus out of the editor");
    }
  });

  it("groups Editing, Completion, Navigation and Find", () => {
    const groups = editorShortcutGroups({ isMac: true, smart: true, templateExample: "sout" });
    expect(groups.map((group) => group.title)).toEqual(["Editing", "Completion", "Navigation", "Find"]);
  });

  it("names each platform's keys", () => {
    const keys = (isMac: boolean) =>
      editorShortcutGroups({ isMac, smart: true, templateExample: "sout" })
        .flatMap((group) => group.rows)
        .flatMap((row) => [...row.keys, ...(row.or ?? [])]);
    expect(keys(true)).toContain("Cmd + L");
    expect(keys(true)).toContain("Cmd + Option + T");
    expect(keys(false)).toContain("Ctrl + G");
    expect(keys(false)).toContain("Ctrl + Alt + T");
    expect(keys(false)).not.toContain("Cmd + F");
  });

  it("leaves out the smart keys for a language without a profile", () => {
    const groups = editorShortcutGroups({ isMac: false, smart: false, templateExample: "" });
    expect(groups.map((group) => group.title)).toEqual(["Editing", "Navigation", "Find"]);
  });

  it("uses no em dash or middle dot", () => {
    const text = JSON.stringify(editorShortcutGroups({ isMac: true, smart: true, templateExample: "sout" }));
    expect(text).not.toMatch(/[—·]/);
  });
});
