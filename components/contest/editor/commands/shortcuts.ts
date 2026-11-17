/**
 * The shortcuts popover's contents, per platform, grouped the way IntelliJ's keymap reference is.
 * One list for the whole editor, so a key that exists is listed and a key that is listed exists
 * (the keymap test checks every row against `commandFor`).
 *
 * The first row is the way out of the editor, because a textarea that keeps Tab for itself is a
 * keyboard trap without it.
 */

export interface ShortcutRow {
  /** Pressed in order: Esc, then Esc, then Tab. */
  readonly keys: readonly string[];
  /** Other chords that do the same. */
  readonly or?: readonly string[];
  readonly action: string;
}

export interface ShortcutGroup {
  readonly title: string;
  readonly rows: readonly ShortcutRow[];
}

export interface ShortcutOptions {
  readonly isMac: boolean;
  /** Java, Python and C++ have IntelliJ's smart keys; JavaScript and Go do not. */
  readonly smart: boolean;
  /** A live template this language has, e.g. "sout", or "" for none. */
  readonly templateExample: string;
  /** The smart engine's own keys (smart/shortcuts.ts `engineShortcuts`), listed under Editing. */
  readonly engine?: readonly ShortcutRow[];
}

/** Engine rows the Editing group already names in its own words. */
const LISTED_ELSEWHERE: ReadonlySet<string> = new Set(["Move the line"]);

function editing({ isMac, smart, templateExample, engine = [] }: ShortcutOptions): ShortcutGroup {
  const mod = isMac ? "Cmd" : "Ctrl";
  const alt = isMac ? "Option" : "Alt";
  const rows: ShortcutRow[] = [
    { keys: ["Esc", "Esc", "Tab"], action: "Move focus out of the editor" },
    { keys: ["Tab"], action: "Indent" },
    { keys: ["Shift + Tab"], action: "Unindent" },
    { keys: [`${mod} + Z`], action: "Undo" },
    { keys: [`${mod} + S`], action: "Save the draft" },
    { keys: [`${mod} + '`], action: "Run the samples" },
    { keys: ["Ctrl / Cmd + Enter"], action: "Submit for judging" },
    { keys: [`${mod} + =`], or: [`${mod} + -`], action: "Bigger or smaller code text" },
  ];
  if (!smart) return { title: "Editing", rows };
  return {
    title: "Editing",
    rows: [
      ...rows,
      { keys: [`${mod} + /`], action: "Comment or uncomment the line" },
      { keys: [`${mod} + D`], action: "Duplicate the line" },
      { keys: [`${alt} + Shift + Up`], action: "Move the line up or down" },
      { keys: [`${mod} + ${alt} + T`], action: "Surround with if, for, try" },
      ...(templateExample === "" ? [] : [{ keys: [templateExample, "Tab"], action: "Expand a template" }]),
      { keys: [`${mod} + J`], action: "Insert a live template from the list" },
      ...engine.filter((row) => !LISTED_ELSEWHERE.has(row.action)),
    ],
  };
}

function completion({ isMac, smart }: ShortcutOptions): ShortcutGroup | null {
  if (!smart) return null;
  const mod = isMac ? "Cmd" : "Ctrl";
  const alt = isMac ? "Option" : "Alt";
  return {
    title: "Completion",
    rows: [
      { keys: ["Ctrl + Space"], action: "Show suggestions" },
      // Alt+Space is the window menu on Windows, so the fallback is listed on a Mac only.
      ...(isMac
        ? [{ keys: [`${alt} + Space`], action: "Show suggestions (when Ctrl + Space switches keyboards)" }]
        : []),
      { keys: ["Enter"], action: "Insert the suggestion" },
      { keys: ["Tab"], action: "Replace the word with the suggestion" },
      { keys: [`${mod} + P`], action: "Parameter info" },
      isMac
        ? { keys: ["F1"], action: "Quick documentation" }
        : { keys: ["Ctrl + Q"], or: ["F1"], action: "Quick documentation" },
      { keys: [`${alt} + Enter`], action: "Add the missing import" },
      { keys: [`${alt} + /`], or: [`${alt} + Shift + /`], action: "Complete the word from the file" },
    ],
  };
}

function navigation({ isMac }: ShortcutOptions): ShortcutGroup {
  const mod = isMac ? "Cmd" : "Ctrl";
  const alt = isMac ? "Option" : "Alt";
  return {
    title: "Navigation",
    rows: [
      { keys: [isMac ? "Cmd + L" : "Ctrl + G"], action: "Go to line and column" },
      { keys: ["F2"], or: [`${mod} + ${alt} + Down`], action: "Next error line from the last run" },
      { keys: ["Shift + F2"], or: [`${mod} + ${alt} + Up`], action: "Previous error line" },
      { keys: [isMac ? "Ctrl + G" : "Alt + J"], action: "Select the next copy of the word" },
      { keys: [isMac ? "Cmd + Ctrl + G" : "Ctrl + Alt + Shift + J"], action: "Select every copy, then type to rename" },
      { keys: [isMac ? "Ctrl + Shift + G" : "Alt + Shift + J"], action: "Unselect the last copy" },
      { keys: [`${alt} + click`], action: "Add a caret; type at every caret at once" },
      { keys: [`${alt} + Shift + drag`], or: ["Middle-button drag"], action: "Select a column" },
      { keys: [`Ctrl + Shift + ${alt} + Up`], or: [`Ctrl + Shift + ${alt} + Down`], action: "Add a caret above or below" },
      { keys: ["Esc"], action: "Back to one caret" },
    ],
  };
}

function findGroup({ isMac }: ShortcutOptions): ShortcutGroup {
  const mod = isMac ? "Cmd" : "Ctrl";
  return {
    title: "Find",
    rows: [
      { keys: [`${mod} + F`], action: "Find" },
      { keys: [`${mod} + R`], action: "Replace" },
      { keys: [isMac ? "Cmd + G" : "F3"], or: ["Enter"], action: "Next match" },
      { keys: [isMac ? "Cmd + Shift + G" : "Shift + F3"], or: ["Shift + Enter"], action: "Previous match" },
      { keys: ["Esc"], action: "Close find and return to the code" },
    ],
  };
}

export function editorShortcutGroups(options: ShortcutOptions): readonly ShortcutGroup[] {
  const groups: (ShortcutGroup | null)[] = [editing(options), completion(options), navigation(options), findGroup(options)];
  return groups.filter((group): group is ShortcutGroup => group !== null);
}
