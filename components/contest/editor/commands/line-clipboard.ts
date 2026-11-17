/**
 * IntelliJ's line clipboard: Copy and Cut with nothing selected take the caret's whole line, and
 * pasting that line puts it above the caret's line rather than into the middle of it.
 *
 * Without this, Cmd+C on a bare caret copied nothing and the Cmd+V that followed pasted whatever
 * the clipboard held before, into the middle of the student's code. Pure, so each rule is a test.
 */

import type { Edit, EditState } from "../smart/types";

export interface LineCopy {
  /** The line with its newline, as the clipboard should hold it. */
  readonly text: string;
}

function lineBounds(text: string, caret: number): { readonly start: number; readonly end: number } {
  const start = text.lastIndexOf("\n", caret - 1) + 1;
  const found = text.indexOf("\n", caret);
  return { start, end: found === -1 ? text.length : found };
}

/** The whole caret line for a Copy or Cut with no selection, or null when something is selected. */
export function lineCopyOf(state: EditState): LineCopy | null {
  if (state.selectionStart !== state.selectionEnd) return null;
  const { start, end } = lineBounds(state.text, state.selectionStart);
  return { text: `${state.text.slice(start, end)}\n` };
}

/**
 * Cut with no selection: the caret line goes, newline and all, and the caret keeps its column on
 * the line that moves up into its place. On the last line the newline before it goes instead.
 */
export function lineCutOf(state: EditState): Edit | null {
  if (state.selectionStart !== state.selectionEnd) return null;
  const { text } = state;
  const { start, end } = lineBounds(text, state.selectionStart);
  const column = state.selectionStart - start;
  if (end < text.length) {
    const next = lineBounds(text, end + 1);
    const caret = start + Math.min(column, next.end - next.start);
    return { from: start, to: end + 1, insert: "", selectionStart: caret, selectionEnd: caret };
  }
  if (start === 0) return { from: 0, to: end, insert: "", selectionStart: 0, selectionEnd: 0 };
  const previous = lineBounds(text, start - 1);
  const caret = previous.start + Math.min(column, previous.end - previous.start);
  return { from: start - 1, to: end, insert: "", selectionStart: caret, selectionEnd: caret };
}

/**
 * Paste of a line that came from a line Copy or Cut, with no selection: it goes in above the
 * caret's line, and the caret stays where it was on its own line. Null for any other paste.
 */
export function linePasteOf(state: EditState, clipboard: string, copied: string | null): Edit | null {
  if (copied === null || clipboard !== copied || !clipboard.endsWith("\n")) return null;
  if (state.selectionStart !== state.selectionEnd) return null;
  const { start } = lineBounds(state.text, state.selectionStart);
  const caret = state.selectionStart + clipboard.length;
  return { from: start, to: start, insert: clipboard, selectionStart: caret, selectionEnd: caret };
}
