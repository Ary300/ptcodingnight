/**
 * Small pure helpers over a textarea's text, shared by the engine and the keystroke modules
 * beside it. Offsets are UTF-16 indices, as a textarea's are.
 */

import type { Edit, EditState, LanguageProfile } from "./types";

/** Java identifiers allow `$`, so it counts as a word character for pairing and templates. */
export const WORD_CHAR = /[A-Za-z0-9_$]/;
const LEADING_INLINE_SPACE = /^[ \t]*/;

/** Languages with C-style braces and block comments. Python has neither. */
export const BRACE_LANGUAGES: ReadonlySet<LanguageProfile["id"]> = new Set(["java", "cpp"]);

/** A selection normalised so start <= end, clamped to the text. */
export interface Range {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/** A span of text as [start, end). For whole lines, `end` sits at a line end. */
export interface LineSpan {
  readonly start: number;
  readonly end: number;
}

export function normalise(state: EditState): Range {
  const clamp = (pos: number) => Math.min(Math.max(pos, 0), state.text.length);
  const a = clamp(state.selectionStart);
  const b = clamp(state.selectionEnd);
  return { text: state.text, start: Math.min(a, b), end: Math.max(a, b) };
}

/** An edit that changes no text and only moves the caret. */
export function caretOnly(at: number, caret: number): Edit {
  return { from: at, to: at, insert: "", selectionStart: caret, selectionEnd: caret };
}

/** An edit that changes no text and selects [start, end). */
export function selectOnly(start: number, end: number): Edit {
  return { from: start, to: start, insert: "", selectionStart: start, selectionEnd: end };
}

export function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && WORD_CHAR.test(ch);
}

export function isInlineSpace(ch: string | undefined): boolean {
  return ch === " " || ch === "\t";
}

export function leadingSpace(line: string): string {
  return LEADING_INLINE_SPACE.exec(line)?.[0] ?? "";
}

export function lineStartAt(text: string, pos: number): number {
  return pos <= 0 ? 0 : text.lastIndexOf("\n", pos - 1) + 1;
}

export function lineEndAt(text: string, pos: number): number {
  const newline = text.indexOf("\n", pos);
  return newline === -1 ? text.length : newline;
}

/**
 * The lines a selection covers. A selection that ends at column 0 of a line does not include that
 * line, as in IntelliJ: selecting two whole lines by dragging to the start of the third must not
 * comment or move the third.
 */
export function selectedLines(range: Range): LineSpan {
  const { text, start, end } = range;
  const last = end > start && lineStartAt(text, end) === end ? end - 1 : end;
  return { start: lineStartAt(text, start), end: lineEndAt(text, last) };
}

/** The identifier run around `pos` (touching it on either side), or null. */
export function wordAt(text: string, pos: number): LineSpan | null {
  let from = pos;
  let to = pos;
  while (from > 0 && isWordChar(text[from - 1])) from -= 1;
  while (to < text.length && isWordChar(text[to])) to += 1;
  return from === to ? null : { start: from, end: to };
}

/** One indent level less. */
export function removeOneIndent(indent: string, unit: string): string {
  if (indent.endsWith(unit)) return indent.slice(0, indent.length - unit.length);
  if (indent.endsWith("\t")) return indent.slice(0, -1);
  return indent.slice(0, Math.max(0, indent.length - unit.length));
}

/** The indent unit a line uses: a tab when its indent holds one, else the profile's. */
export function unitFor(indent: string, profile: LanguageProfile): string {
  return indent.includes("\t") ? "\t" : profile.indentUnit;
}
