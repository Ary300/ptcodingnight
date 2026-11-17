import type { Edit } from "../smart/types";

import type { MatchRange } from "./find";

/**
 * IntelliJ's multiple carets, inside a single textarea, as pure functions.
 *
 * Alt+click (Option+click) adds a caret, Alt+Shift+drag or a middle-button drag selects a column,
 * and Clone Caret Above / Below adds one on the next line up or down. Each caret is a range of the
 * text: empty for a bare caret, one line's slice for a column selection. A key that edits (a
 * character, Backspace, Delete, Enter, a paste) is applied at every range as ONE Edit spanning the
 * first to the last, so Ctrl/Cmd + Z takes it back everywhere at once. The textarea's own selection
 * sits on the primary range; the match layer draws the others. Escape returns to one caret.
 *
 * This sits beside the occurrence session (occurrences.ts) rather than inside it: an occurrence
 * session is copies of one word edited at one offset, and carets here are anywhere, on any text.
 */

export interface MultiCaret {
  /** Sorted by start, non-overlapping. `[at, at]` is a bare caret; the caret is at a range's end. */
  readonly ranges: readonly MatchRange[];
  /** Index into `ranges` of the one the textarea's own selection shows. */
  readonly primary: number;
}

export type MultiKey =
  | { readonly kind: "insert"; readonly text: string }
  | { readonly kind: "backspace" }
  | { readonly kind: "delete" }
  | { readonly kind: "enter" }
  | { readonly kind: "paste"; readonly text: string };

export interface MultiEdit {
  readonly carets: MultiCaret;
  readonly edit: Edit;
}

function lineStartAt(text: string, at: number): number {
  return text.lastIndexOf("\n", at - 1) + 1;
}

function lineEndAt(text: string, at: number): number {
  const end = text.indexOf("\n", at);
  return end === -1 ? text.length : end;
}

/** Sorted, with overlapping or touching-and-equal ranges merged; `keep` stays the primary. */
function normalised(ranges: readonly MatchRange[], keep: MatchRange): MultiCaret {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: MatchRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && (range[0] < last[1] || (range[0] === last[0] && range[1] === last[1]))) {
      merged[merged.length - 1] = [last[0], Math.max(last[1], range[1])];
    } else {
      merged.push(range);
    }
  }
  const primary = merged.findIndex(([start, end]) => start <= keep[0] && keep[1] <= end);
  return { ranges: merged, primary: primary === -1 ? merged.length - 1 : primary };
}

/** Alt+click: the carets already there plus one at `at`, which becomes the primary. */
export function addCaret(current: MultiCaret | null, selection: MatchRange, at: number): MultiCaret {
  const existing = current?.ranges ?? [selection];
  // Alt+click on an existing bare caret removes it, as IntelliJ's does, unless it is the last one.
  const hit = existing.findIndex(([start, end]) => start === at && end === at);
  if (hit !== -1 && existing.length > 1) {
    const rest = existing.filter((_range, index) => index !== hit);
    const keep = rest[rest.length - 1] ?? [at, at];
    return normalised(rest, keep);
  }
  return normalised([...existing, [at, at]], [at, at]);
}

/** The visual column of `offset` on its line, with tabs widened to `tabSize`. */
export function columnOf(text: string, offset: number, tabSize: number): number {
  let column = 0;
  for (let i = lineStartAt(text, offset); i < offset; i += 1) {
    column = text[i] === "\t" ? column + tabSize - (column % tabSize) : column + 1;
  }
  return column;
}

/** The offset on the line starting at `lineStart` nearest visual `column`, clamped to the line. */
export function offsetAtColumn(text: string, lineStart: number, column: number, tabSize: number): number {
  const end = lineEndAt(text, lineStart);
  let current = 0;
  for (let i = lineStart; i < end; i += 1) {
    if (current >= column) return i;
    current = text[i] === "\t" ? current + tabSize - (current % tabSize) : current + 1;
  }
  return end;
}

/** The offsets at which each line starts. */
export function lineStarts(text: string): readonly number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === "\n") starts.push(i + 1);
  return starts;
}

/**
 * Column selection from (anchor row, column) to (head row, column), 0-based rows: one range per
 * line between them, each from the left column to the right one, clamped to the line. The head's
 * line is the primary, as the caret is where the drag ended.
 */
export function columnSelection(
  text: string,
  anchor: { readonly row: number; readonly column: number },
  head: { readonly row: number; readonly column: number },
  tabSize: number,
): MultiCaret {
  const starts = lineStarts(text);
  const last = starts.length - 1;
  const clampRow = (row: number) => Math.min(Math.max(row, 0), last);
  const top = clampRow(Math.min(anchor.row, head.row));
  const bottom = clampRow(Math.max(anchor.row, head.row));
  const left = Math.max(0, Math.min(anchor.column, head.column));
  const right = Math.max(0, anchor.column, head.column);
  const ranges: MatchRange[] = [];
  for (let row = top; row <= bottom; row += 1) {
    const start = starts[row] ?? 0;
    ranges.push([offsetAtColumn(text, start, left, tabSize), offsetAtColumn(text, start, right, tabSize)]);
  }
  const headRow = clampRow(head.row) - top;
  return { ranges, primary: Math.min(Math.max(headRow, 0), ranges.length - 1) };
}

/**
 * Clone Caret Above / Below: a caret on the line past the topmost (or bottommost) caret, at that
 * caret's visual column. Unchanged at the first or last line.
 */
export function cloneCaret(text: string, current: MultiCaret | null, selection: MatchRange, direction: -1 | 1, tabSize: number): MultiCaret {
  const carets = current ?? { ranges: [selection], primary: 0 };
  const edge = direction === -1 ? carets.ranges[0] : carets.ranges[carets.ranges.length - 1];
  if (edge === undefined) return carets;
  const caret = edge[1];
  const column = columnOf(text, caret, tabSize);
  const lineStart = lineStartAt(text, caret);
  let target: number;
  if (direction === -1) {
    if (lineStart === 0) return carets;
    target = lineStartAt(text, lineStart - 1);
  } else {
    const end = lineEndAt(text, caret);
    if (end >= text.length) return carets;
    target = end + 1;
  }
  const at = offsetAtColumn(text, target, column, tabSize);
  return normalised([...carets.ranges, [at, at]], [at, at]);
}

/** What one range becomes: the span it replaces and the text that replaces it. */
function replacementFor(text: string, range: MatchRange, key: MultiKey, piece: string): { from: number; to: number; insert: string } {
  const [start, end] = range;
  if (start !== end) {
    // A selected range: Backspace and Delete remove it, anything else replaces it.
    if (key.kind === "backspace" || key.kind === "delete") return { from: start, to: end, insert: "" };
  }
  switch (key.kind) {
    case "insert":
      return { from: start, to: end, insert: key.text };
    case "paste":
      return { from: start, to: end, insert: piece };
    case "enter": {
      const indent = /^[ \t]*/.exec(text.slice(lineStartAt(text, start)))?.[0] ?? "";
      return { from: start, to: end, insert: `\n${indent}` };
    }
    case "backspace":
      return start === 0 || text[start - 1] === undefined ? { from: start, to: start, insert: "" } : { from: start - 1, to: start, insert: "" };
    case "delete":
      return end >= text.length ? { from: end, to: end, insert: "" } : { from: end, to: end + 1, insert: "" };
  }
}

/**
 * One key at every caret, as one Edit from the first changed offset to the last. A paste whose
 * line count equals the caret count puts one line at each caret, as IntelliJ does; otherwise the
 * whole clipboard goes in at every caret. Null when nothing changes.
 */
export function applyMultiKey(text: string, carets: MultiCaret, key: MultiKey): MultiEdit | null {
  const lines = key.kind === "paste" ? key.text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n") : [];
  const perCaret = key.kind === "paste" && lines.length === carets.ranges.length && lines.length > 1;

  const pieces: { from: number; to: number; insert: string }[] = [];
  let floor = 0;
  carets.ranges.forEach((range, index) => {
    const piece = key.kind === "paste" ? (perCaret ? (lines[index] ?? "") : key.text) : "";
    const next = replacementFor(text, range, key, piece);
    // Two carets side by side must not delete the same character twice.
    const from = Math.max(next.from, floor);
    const to = Math.max(next.to, from);
    pieces.push({ from, to, insert: next.insert });
    floor = to;
  });
  if (pieces.every((piece) => piece.from === piece.to && piece.insert === "")) return null;

  const first = pieces[0];
  const last = pieces[pieces.length - 1];
  if (first === undefined || last === undefined) return null;
  let insert = "";
  let cursor = first.from;
  let shift = 0;
  const ranges: MatchRange[] = [];
  for (const piece of pieces) {
    insert += text.slice(cursor, piece.from) + piece.insert;
    const caret = piece.from + shift + piece.insert.length;
    ranges.push([caret, caret]);
    shift += piece.insert.length - (piece.to - piece.from);
    cursor = piece.to;
  }
  const next = normalised(ranges, ranges[carets.primary] ?? ranges[ranges.length - 1] ?? [0, 0]);
  const primary = next.ranges[next.primary] ?? [0, 0];
  return {
    carets: next,
    edit: { from: first.from, to: last.to, insert, selectionStart: primary[0], selectionEnd: primary[1] },
  };
}

/** Where the match layer draws the carets that are not the textarea's own. */
export function secondaryCaretOffsets(carets: MultiCaret): readonly number[] {
  return carets.ranges.filter((_range, index) => index !== carets.primary).map(([, end]) => end);
}

/** The selected ranges, for the match layer's tint. */
export function selectedRanges(carets: MultiCaret): readonly MatchRange[] {
  return carets.ranges.filter(([start, end]) => end > start);
}
