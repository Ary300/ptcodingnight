import type { Edit } from "../smart/types";

import { findAll, wordAt, type MatchRange } from "./find";

/**
 * IntelliJ's Select Next Occurrence and Select All Occurrences, inside a single textarea.
 *
 * A textarea has one selection, so real multiple carets would need a different editor. What this
 * keeps is the habit those keys serve: select a name, press the key until every copy you want is
 * picked, then type the new name once. Every picked copy is a range of the same text; a key that
 * edits (a character, Backspace, Delete) is applied at the same place in every range, as ONE Edit,
 * so Ctrl/Cmd + Z takes each keystroke back everywhere at once. The textarea's own selection sits
 * on the primary copy, and the others are drawn by the match layer.
 *
 * Escape, a click, or any caret movement out of the copy ends the session with one caret.
 */

export interface OccurrenceSession {
  /** Sorted, non-overlapping, every one holding `word`. */
  readonly ranges: readonly MatchRange[];
  readonly word: string;
  /** Index into `ranges` of the copy holding the real caret. */
  readonly primary: number;
  /** Caret offset inside every copy, or null while each copy is wholly selected. */
  readonly offset: number | null;
  /** Picked from a caret (a word), so only whole-word copies count, as in IntelliJ. */
  readonly wholeWord: boolean;
}

export interface SessionStep {
  readonly session: OccurrenceSession;
  /** The textarea selection to show. */
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

export interface SessionEdit {
  readonly session: OccurrenceSession;
  readonly edit: Edit;
}

/** The modifier state of a key press, as the surface saw it. */
export interface OccurrenceKeyPress {
  readonly key: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

/**
 * What a key press does to the picked occurrences: type a character, Backspace or Delete, or null
 * when it is not an edit. Off a Mac, Alt with a letter is a chord and never a character (AltGr
 * arrives as Ctrl+Alt), so the second Alt+J of Select Next Occurrence adds the next copy instead of
 * typing "j" over every one. On a Mac, Option types characters, so it is still an insert there.
 */
export function occurrenceKeyOf(press: OccurrenceKeyPress, isMac: boolean): OccurrenceKey | null {
  if (press.ctrlKey || press.metaKey) return null;
  if (press.key === "Backspace" && !press.altKey && !press.shiftKey) return { kind: "backspace" };
  if (press.key === "Delete" && !press.altKey && !press.shiftKey) return { kind: "delete" };
  if (press.altKey && !isMac) return null;
  if (press.key.length === 1) return { kind: "insert", text: press.key };
  return null;
}

export type OccurrenceKey =
  | { readonly kind: "insert"; readonly text: string }
  | { readonly kind: "backspace" }
  | { readonly kind: "delete" };

function selectionOf(session: OccurrenceSession): SessionStep {
  const range = session.ranges[session.primary] ?? session.ranges[0] ?? [0, 0];
  if (session.offset === null) return { session, selectionStart: range[0], selectionEnd: range[1] };
  const caret = range[0] + session.offset;
  return { session, selectionStart: caret, selectionEnd: caret };
}

/** The first press: the selection (one line) or the word at the caret. Null when there is neither. */
export function startOccurrences(text: string, selectionStart: number, selectionEnd: number): SessionStep | null {
  if (selectionStart !== selectionEnd) {
    const word = text.slice(selectionStart, selectionEnd);
    if (word.includes("\n")) return null;
    return selectionOf({ ranges: [[selectionStart, selectionEnd]], word, primary: 0, offset: null, wholeWord: false });
  }
  const range = wordAt(text, selectionStart);
  if (range === null) return null;
  return selectionOf({ ranges: [range], word: text.slice(range[0], range[1]), primary: 0, offset: null, wholeWord: true });
}

function copiesOf(text: string, session: OccurrenceSession): readonly MatchRange[] {
  return findAll(text, session.word, { caseSensitive: true, wholeWord: session.wholeWord });
}

function sortRanges(ranges: readonly MatchRange[]): MatchRange[] {
  return [...ranges].sort((a, b) => a[0] - b[0]);
}

/** Adds the next copy after the primary one, wrapping around; unchanged when every copy is in. */
export function addNextOccurrence(text: string, session: OccurrenceSession): SessionStep {
  const primary = session.ranges[session.primary];
  const taken = new Set(session.ranges.map(([start]) => start));
  const copies = copiesOf(text, session).filter(([start]) => !taken.has(start));
  if (primary === undefined || copies.length === 0) return selectionOf(session);
  const next = copies.find(([start]) => start > primary[0]) ?? copies[0];
  if (next === undefined) return selectionOf(session);
  const ranges = sortRanges([...session.ranges, next]);
  return selectionOf({ ...session, ranges, primary: ranges.findIndex(([start]) => start === next[0]), offset: null });
}

/** Every copy in the file. */
export function addAllOccurrences(text: string, session: OccurrenceSession): SessionStep {
  const primary = session.ranges[session.primary];
  const ranges = sortRanges(copiesOf(text, session));
  if (ranges.length === 0 || primary === undefined) return selectionOf(session);
  const index = ranges.findIndex(([start]) => start === primary[0]);
  return selectionOf({ ...session, ranges, primary: index === -1 ? 0 : index, offset: null });
}

/** Unselect Occurrence: drops the primary copy and moves the caret to the one before it. */
export function removeOccurrence(session: OccurrenceSession): SessionStep | null {
  if (session.ranges.length <= 1) return null;
  const ranges = session.ranges.filter((_range, index) => index !== session.primary);
  return selectionOf({ ...session, ranges, primary: Math.max(0, session.primary - 1) });
}

/** The copy's new text after `key`, and the caret inside it, or null when the key changes nothing. */
function rewrite(word: string, offset: number | null, key: OccurrenceKey): { text: string; caret: number } | null {
  if (offset === null) {
    const inserted = key.kind === "insert" ? key.text : "";
    return { text: inserted, caret: inserted.length };
  }
  if (key.kind === "insert") return { text: word.slice(0, offset) + key.text + word.slice(offset), caret: offset + key.text.length };
  if (key.kind === "backspace") {
    return offset === 0 ? null : { text: word.slice(0, offset - 1) + word.slice(offset), caret: offset - 1 };
  }
  return offset >= word.length ? null : { text: word.slice(0, offset) + word.slice(offset + 1), caret: offset };
}

/**
 * Applies one editing key at the same place in every copy, as one Edit spanning the first copy to
 * the last. Null when the key changes nothing (Backspace at the start of every copy).
 */
export function typeInOccurrences(text: string, session: OccurrenceSession, key: OccurrenceKey): SessionEdit | null {
  const first = session.ranges[0];
  const last = session.ranges[session.ranges.length - 1];
  const next = rewrite(session.word, session.offset, key);
  if (first === undefined || last === undefined || next === null) return null;

  let insert = "";
  let cursor = first[0];
  let shift = 0;
  const ranges: MatchRange[] = [];
  for (const [start, end] of session.ranges) {
    insert += text.slice(cursor, start) + next.text;
    const newStart = start + shift;
    ranges.push([newStart, newStart + next.text.length]);
    shift += next.text.length - (end - start);
    cursor = end;
  }
  const moved: OccurrenceSession = { ...session, ranges, word: next.text, offset: next.caret };
  const caret = selectionOf(moved);
  return {
    session: moved,
    edit: { from: first[0], to: last[1], insert, selectionStart: caret.selectionStart, selectionEnd: caret.selectionEnd },
  };
}

/** Left or Right inside the copies. Null when the caret would leave them, which ends the session. */
export function moveInOccurrences(session: OccurrenceSession, delta: -1 | 1): SessionStep | null {
  if (session.offset === null) return selectionOf({ ...session, offset: delta === -1 ? 0 : session.word.length });
  const offset = session.offset + delta;
  if (offset < 0 || offset > session.word.length) return null;
  return selectionOf({ ...session, offset });
}

/** Where the extra carets are drawn: the caret offset in every copy but the primary. */
export function secondaryCarets(session: OccurrenceSession): readonly number[] {
  if (session.offset === null) return [];
  const offset = session.offset;
  return session.ranges.filter((_range, index) => index !== session.primary).map(([start]) => start + offset);
}
