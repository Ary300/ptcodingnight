/**
 * Which editor command a chord means, as a pure table, so the whole keymap is a unit test.
 *
 * IntelliJ, PyCharm and CLion share one keymap per platform, and the habits it builds collide with
 * the browser's own shortcuts: Cmd+R reloads, Cmd+P prints, Cmd+L focuses the address bar, Cmd+[
 * navigates Back out of the contest. While the editor has focus each of those either performs its
 * IntelliJ action here or is swallowed, so nothing destructive happens.
 *
 * Two tables, and they run at different points of the key handler (`useEditorKeys`):
 *
 *   - `commandFor` runs BEFORE the smart engine. Its chords open a bar or a popup.
 *   - `isGuardedChord` runs AFTER the engine had its turn, so Mod+D still duplicates a line and
 *     Ctrl+Y still deletes one on Windows; a guarded chord nobody answered is only prevented.
 *
 * Chords the browser never hands to a page are absent on purpose: Cmd+W, Cmd+T, Cmd+N, Cmd+Q,
 * Ctrl+W, Ctrl+T, Ctrl+N, Ctrl+Tab and the devtools chords. Leaving the page that way is what the
 * workspace's beforeunload guard is for.
 *
 * Letters and punctuation match on `code` (the physical key) whenever it is reported, because on a
 * Mac Option+J types "∆" and Option+T types "†", so `key` never names the letter.
 */

export type CommandId =
  | "save"
  | "find"
  | "replace"
  | "findNext"
  | "findPrevious"
  | "goToLine"
  | "surround"
  | "parameterInfo"
  | "quickDoc"
  | "insertTemplate"
  | "contextActions"
  | "completion"
  | "run"
  | "fontBigger"
  | "fontSmaller"
  | "selectNextOccurrence"
  | "selectAllOccurrences"
  | "unselectOccurrence"
  | "expandWord"
  | "expandWordBackward"
  | "nextError"
  | "previousError";

/** The parts of a KeyboardEvent the keymap reads. */
export interface Chord {
  readonly key: string;
  /** `KeyboardEvent.code`; empty when the platform does not report one. */
  readonly code: string;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly isMac: boolean;
}

/** The letter a chord names: from `code` ("KeyJ" is "j"), else from `key`. */
function letterOf(chord: Chord): string {
  const match = /^Key([A-Z])$/.exec(chord.code);
  if (match !== null && match[1] !== undefined) return match[1].toLowerCase();
  return chord.key.length === 1 ? chord.key.toLowerCase() : "";
}

/** IntelliJ's main modifier: Cmd on a Mac (and not Ctrl with it), Ctrl elsewhere (and not Cmd). */
function modOnly(chord: Chord): boolean {
  return chord.isMac ? chord.metaKey && !chord.ctrlKey : chord.ctrlKey && !chord.metaKey;
}

/** Mod, optionally with Shift, and no Alt. */
function plainMod(chord: Chord): boolean {
  return modOnly(chord) && !chord.altKey;
}

function bare(chord: Chord): boolean {
  return !chord.altKey && !chord.ctrlKey && !chord.metaKey;
}

function isSpace(chord: Chord): boolean {
  return chord.code === "Space" || chord.key === " ";
}

function isEnter(chord: Chord): boolean {
  return chord.key === "Enter" || chord.code === "Enter" || chord.code === "NumpadEnter";
}

function completionChord(chord: Chord): boolean {
  if (!isSpace(chord) || chord.shiftKey) return false;
  const held = [chord.ctrlKey, chord.altKey, chord.metaKey].filter(Boolean).length;
  // Ctrl+Space (IntelliJ), Option/Alt+Space for every Mac whose Ctrl+Space switches the input
  // source, and Mod+Space where the system leaves it free. Exactly one modifier.
  return held === 1;
}

function functionKeyCommand(chord: Chord): CommandId | null {
  if (chord.altKey || chord.ctrlKey || chord.metaKey) return null;
  if (chord.key === "F3") return chord.shiftKey ? "findPrevious" : "findNext";
  if (chord.key === "F1" && !chord.shiftKey) return "quickDoc";
  // IntelliJ's Run on Windows and Linux. A Mac needs fn for it, so Mod+' is the other way.
  if (chord.key === "F10" && chord.shiftKey) return "run";
  if (chord.key === "F2") return chord.shiftKey ? "previousError" : "nextError";
  return null;
}

/**
 * Cyclic Expand Word: Alt+/ (Option+/ on a Mac), with Shift backward. Matched on `code`, because
 * Option+/ types "÷" on a Mac and so `key` never names the slash.
 */
function expandWordCommand(chord: Chord): CommandId | null {
  if (!chord.altKey || chord.ctrlKey || chord.metaKey) return null;
  if (chord.code !== "Slash" && !(chord.code === "" && (chord.key === "/" || chord.key === "?"))) return null;
  return chord.shiftKey ? "expandWordBackward" : "expandWord";
}

/** Next and previous error without F-keys (Chromebooks, and MacBooks without fn): Mod+Alt+Down/Up. */
function errorArrowCommand(chord: Chord): CommandId | null {
  if (!modOnly(chord) || !chord.altKey || chord.shiftKey) return null;
  if (chord.key === "ArrowDown") return "nextError";
  if (chord.key === "ArrowUp") return "previousError";
  return null;
}

/** Mac Ctrl+G / Cmd+Ctrl+G / Ctrl+Shift+G; elsewhere Alt+J / Ctrl+Alt+Shift+J / Alt+Shift+J. */
function occurrenceCommand(chord: Chord, letter: string): CommandId | null {
  if (chord.isMac) {
    if (letter !== "g" || !chord.ctrlKey || chord.altKey) return null;
    if (chord.metaKey) return chord.shiftKey ? null : "selectAllOccurrences";
    return chord.shiftKey ? "unselectOccurrence" : "selectNextOccurrence";
  }
  if (letter !== "j" || !chord.altKey || chord.metaKey) return null;
  if (chord.ctrlKey) return chord.shiftKey ? "selectAllOccurrences" : null;
  return chord.shiftKey ? "unselectOccurrence" : "selectNextOccurrence";
}

function modLetterCommand(chord: Chord, letter: string): CommandId | null {
  if (chord.shiftKey) return chord.isMac && letter === "g" ? "findPrevious" : null;
  switch (letter) {
    case "s":
      return "save";
    case "f":
      return "find";
    case "r":
      return "replace";
    case "p":
      return "parameterInfo";
    case "j":
      // IntelliJ's Insert Live Template on both keymaps. Quick Documentation is F1, and Ctrl+Q
      // off a Mac.
      return "insertTemplate";
    case "g":
      // Mac Cmd+G is Find Next; Windows Ctrl+G is IntelliJ's Go to Line.
      return chord.isMac ? "findNext" : "goToLine";
    case "l":
      return chord.isMac ? "goToLine" : null;
    case "q":
      // Windows and Linux Quick Documentation. Cmd+Q on a Mac quits and never arrives.
      return chord.isMac ? null : "quickDoc";
    default:
      return null;
  }
}

/** The command a chord runs, or null when it is not a command (the engine and browser decide). */
export function commandFor(chord: Chord): CommandId | null {
  const letter = letterOf(chord);

  if (completionChord(chord)) return "completion";
  if (isEnter(chord) && chord.altKey && !chord.ctrlKey && !chord.metaKey && !chord.shiftKey) {
    return "contextActions";
  }

  const functionKey = functionKeyCommand(chord);
  if (functionKey !== null) return functionKey;

  const expand = expandWordCommand(chord);
  if (expand !== null) return expand;

  const errorArrow = errorArrowCommand(chord);
  if (errorArrow !== null) return errorArrow;

  const occurrence = occurrenceCommand(chord, letter);
  if (occurrence !== null) return occurrence;

  // Surround With: Cmd+Option+T, Ctrl+Alt+T.
  if (letter === "t" && modOnly(chord) && chord.altKey && !chord.shiftKey) return "surround";

  // Run the samples: Mac Ctrl+R as in IntelliJ and CLion, and Mod+' everywhere.
  if (chord.isMac && chord.ctrlKey && !chord.metaKey && !chord.altKey && !chord.shiftKey && letter === "r") {
    return "run";
  }
  if (!plainMod(chord)) return null;
  if (!chord.shiftKey && (chord.code === "Quote" || chord.key === "'")) return "run";

  // Editor font size. `code` because Shift turns "=" into "+".
  if (chord.code === "Equal" || chord.code === "NumpadAdd" || chord.key === "=" || chord.key === "+") {
    return "fontBigger";
  }
  if (!chord.shiftKey && (chord.code === "Minus" || chord.code === "NumpadSubtract" || chord.key === "-")) {
    return "fontSmaller";
  }

  return modLetterCommand(chord, letter);
}

/** Bookmark, print, reload, address bar, find, downloads, search, open, history, view source. */
const GUARDED_MOD_LETTERS: ReadonlySet<string> = new Set(["d", "p", "r", "l", "f", "g", "j", "e", "k", "o", "y", "h", "u", "b", "s"]);

/** Hard reload and Chrome's tab search (IntelliJ's Find Action). */
const GUARDED_MOD_SHIFT_LETTERS: ReadonlySet<string> = new Set(["r", "a"]);

/**
 * Chords that would make the BROWSER act and that a page is allowed to stop. Checked after the
 * engine, so the ones IntelliJ uses for editing (Mod+D duplicate, Ctrl+Y delete line) keep
 * working where a profile answers them, and are only prevented where none does.
 */
export function isGuardedChord(chord: Chord): boolean {
  if (bare(chord) && ["F1", "F3", "F5", "F12"].includes(chord.key)) return true;
  // Alt+Left and Alt+Right are Back and Forward off a Mac, and IntelliJ's switch-tab reflex there.
  if (
    !chord.isMac &&
    chord.altKey &&
    !chord.ctrlKey &&
    !chord.metaKey &&
    !chord.shiftKey &&
    (chord.key === "ArrowLeft" || chord.key === "ArrowRight")
  ) {
    return true;
  }
  if (chord.isMac && macNavigationChord(chord)) return true;
  if (!modOnly(chord) || chord.altKey) return false;
  // Mac Cmd+[ and Cmd+] are Back and Forward, and Cmd+[ is IntelliJ's own Back.
  if (chord.code === "BracketLeft" || chord.code === "BracketRight" || chord.key === "[" || chord.key === "]") {
    return true;
  }
  const letter = letterOf(chord);
  if (chord.shiftKey) {
    // Ctrl+Shift+Delete opens Clear Browsing Data (IntelliJ's Unwrap).
    return GUARDED_MOD_SHIFT_LETTERS.has(letter) || chord.key === "Delete";
  }
  return GUARDED_MOD_LETTERS.has(letter);
}

/**
 * IntelliJ's navigation chords on a Mac that Chrome would act on: Cmd+Shift+O (Go to File, the
 * bookmark manager), Cmd+1 to Cmd+9 (the tool windows, Chrome's tab switch), Cmd+Option+B (Go to
 * Implementation, bookmarks) and Cmd+Shift+8 (column selection).
 */
function macNavigationChord(chord: Chord): boolean {
  if (!chord.metaKey || chord.ctrlKey) return false;
  const letter = letterOf(chord);
  if (chord.shiftKey && !chord.altKey && (letter === "o" || chord.code === "Digit8")) return true;
  if (chord.altKey && !chord.shiftKey && letter === "b") return true;
  return !chord.shiftKey && !chord.altKey && /^Digit[1-9]$/.test(chord.code);
}

/** Never prevented, whatever a future table says: the page cannot stop them, or must not. */
export function isBrowserOwnedChord(chord: Chord): boolean {
  const letter = letterOf(chord);
  const mod = chord.metaKey || chord.ctrlKey;
  if (mod && !chord.shiftKey && !chord.altKey && ["w", "t", "n", "q"].includes(letter)) return true;
  if (chord.ctrlKey && chord.shiftKey && !chord.altKey && ["w", "n", "t", "i", "j"].includes(letter)) return true;
  if (chord.isMac && chord.metaKey && chord.altKey && ["i", "j"].includes(letter)) return true;
  return chord.ctrlKey && chord.key === "Tab";
}
