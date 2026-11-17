/**
 * Where the caret goes when Ctrl/Cmd + Z takes back a smart edit.
 *
 * A smart edit replaces a range with `execCommand("insertText")`, and the browser's undo of a
 * replacement re-selects the text it put back. After Cmd+/, a moved line or a template, the whole
 * rewritten range came back selected, so the student's next keystroke replaced the line. IntelliJ
 * restores the caret where it was before the edit, and redo puts it where the edit left it.
 *
 * So every smart edit records the text and selection on both sides of it, and an undo or redo
 * that lands on a recorded text restores the recorded selection. Keyed by the whole text, so a
 * typed run between edits (which the browser undoes itself) can never be matched to the wrong one.
 * Bounded, oldest first out: a contest file is a few kilobytes and a hundred steps is plenty.
 */

export type SelectionPair = readonly [start: number, end: number];

export interface SelectionMemory {
  /** Records one applied edit: the text and selection before it and after it. */
  readonly record: (before: string, beforeSelection: SelectionPair, after: string, afterSelection: SelectionPair) => void;
  /** The selection to restore after an undo that produced `text`, or null when it is not ours. */
  readonly afterUndo: (text: string) => SelectionPair | null;
  /** The selection to restore after a redo that produced `text`, or null when it is not ours. */
  readonly afterRedo: (text: string) => SelectionPair | null;
}

export const SELECTION_MEMORY_LIMIT = 100;

function remember(map: Map<string, SelectionPair>, text: string, selection: SelectionPair): void {
  // Re-inserting moves the key to the newest end, so the oldest entry is always first.
  map.delete(text);
  map.set(text, selection);
  while (map.size > SELECTION_MEMORY_LIMIT) {
    const oldest = map.keys().next();
    if (oldest.done === true) break;
    map.delete(oldest.value);
  }
}

export function createSelectionMemory(): SelectionMemory {
  const beforeEdits = new Map<string, SelectionPair>();
  const afterEdits = new Map<string, SelectionPair>();
  return {
    record: (before, beforeSelection, after, afterSelection) => {
      remember(beforeEdits, before, beforeSelection);
      remember(afterEdits, after, afterSelection);
    },
    afterUndo: (text) => beforeEdits.get(text) ?? null,
    afterRedo: (text) => afterEdits.get(text) ?? null,
  };
}

/** Clamps a remembered selection to a text that may have changed length since. */
export function clampSelection(selection: SelectionPair, length: number): SelectionPair {
  return [Math.min(selection[0], length), Math.min(selection[1], length)];
}
