import type { Edit } from "../smart/types";

/**
 * Find, Replace and Go to Line as pure functions over the editor's text.
 *
 * Ranges are `[start, end)` UTF-16 offsets, as a textarea's selection is. Every replacement is ONE
 * Edit, so the surface applies it through insertText and Ctrl/Cmd + Z takes back a whole Replace
 * All in one step, as IntelliJ does.
 */

export interface FindOptions {
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
}

export type MatchRange = readonly [start: number, end: number];

/** More than this and the count reads "1000+"; a contest file never has that many hits. */
export const MAX_MATCHES = 1000;

const WORD_CHAR = /[A-Za-z0-9_$]/;

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && WORD_CHAR.test(ch);
}

/** Every match of `query` in `text`, in order, never overlapping. Empty query, no matches. */
export function findAll(text: string, query: string, options: FindOptions): readonly MatchRange[] {
  if (query === "") return [];
  const haystack = options.caseSensitive ? text : text.toLowerCase();
  const needle = options.caseSensitive ? query : query.toLowerCase();
  const found: MatchRange[] = [];
  let from = 0;
  while (found.length < MAX_MATCHES) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    const end = at + needle.length;
    const bounded = !options.wholeWord || (!isWordChar(text[at - 1]) && !isWordChar(text[end]));
    if (bounded) {
      found.push([at, end]);
      from = end;
    } else {
      from = at + 1;
    }
  }
  return found;
}

/**
 * The match the bar starts on: the first at or after `caret`, wrapping to the first in the file.
 * -1 when there is none.
 */
export function matchAtOrAfter(matches: readonly MatchRange[], caret: number): number {
  if (matches.length === 0) return -1;
  const index = matches.findIndex(([start]) => start >= caret);
  return index === -1 ? 0 : index;
}

/** The next (or previous) match index, wrapping around the file. */
export function stepMatch(count: number, current: number, delta: 1 | -1): number {
  if (count === 0) return -1;
  if (current < 0) return delta === 1 ? 0 : count - 1;
  return (((current + delta) % count) + count) % count;
}

/** "3 of 12", "No results", or "1000+ results" past the cap. */
export function matchCountLabel(count: number, current: number): string {
  if (count === 0) return "No results";
  if (count >= MAX_MATCHES) return `${MAX_MATCHES}+ results`;
  return `${current < 0 ? 0 : current + 1} of ${count}`;
}

/** Replace one match and select the replacement, so the next Replace moves on from there. */
export function replaceOne(match: MatchRange, replacement: string): Edit {
  const [from, to] = match;
  return { from, to, insert: replacement, selectionStart: from, selectionEnd: from + replacement.length };
}

/**
 * Replace every match as one Edit spanning the first match to the last, with the text between
 * them rebuilt. Null when there is nothing to replace.
 */
export function replaceAll(text: string, matches: readonly MatchRange[], replacement: string): Edit | null {
  const first = matches[0];
  const last = matches[matches.length - 1];
  if (first === undefined || last === undefined) return null;
  let insert = "";
  let cursor = first[0];
  for (const [start, end] of matches) {
    insert += text.slice(cursor, start) + replacement;
    cursor = end;
  }
  const caret = first[0] + insert.length;
  return { from: first[0], to: last[1], insert, selectionStart: caret, selectionEnd: caret };
}

/** The word (identifier) touching `offset`, or null. */
export function wordAt(text: string, offset: number): MatchRange | null {
  let start = offset;
  let end = offset;
  while (start > 0 && isWordChar(text[start - 1])) start -= 1;
  while (end < text.length && isWordChar(text[end])) end += 1;
  return start === end ? null : [start, end];
}

/**
 * What the find field is prefilled with: the selection when it is on one line, else the word at
 * the caret, else nothing.
 */
export function initialQuery(text: string, selectionStart: number, selectionEnd: number): string {
  if (selectionStart !== selectionEnd) {
    const selected = text.slice(selectionStart, selectionEnd);
    return selected.includes("\n") ? "" : selected;
  }
  const word = wordAt(text, selectionStart);
  return word === null ? "" : text.slice(word[0], word[1]);
}

/**
 * "12", "12:5" or "12,5" as a 1-based line and column, or null when it is not a position. A
 * missing column is 1.
 */
export function parseLineColumn(input: string): { readonly line: number; readonly column: number } | null {
  const match = /^\s*(\d+)\s*(?:[:,]\s*(\d+)\s*)?$/.exec(input);
  if (match === null || match[1] === undefined) return null;
  const line = Number(match[1]);
  const column = match[2] === undefined ? 1 : Number(match[2]);
  if (line < 1 || column < 1) return null;
  return { line, column };
}

/** The offset of a 1-based line and column, clamped to the text: line 999 is the last line. */
export function offsetOf(text: string, line: number, column: number): number {
  const lines = text.split("\n");
  const row = Math.min(Math.max(line, 1), lines.length) - 1;
  let offset = 0;
  for (let index = 0; index < row; index += 1) offset += (lines[index]?.length ?? 0) + 1;
  const length = lines[row]?.length ?? 0;
  return offset + Math.min(Math.max(column, 1) - 1, length);
}
