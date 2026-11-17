/**
 * IntelliJ's line and caret commands, each a pure function from the editor's text and selection
 * to one Edit (or null when the key should stay the browser's):
 *
 *   deleteWordBackward / deleteWordForward   Alt+Backspace / Alt+Delete on a Mac, Ctrl elsewhere
 *   smartHome                                Home, or Cmd+Left on a Mac: first non-blank, then column 0
 *   joinLines                                Ctrl+Shift+J
 *   toggleCase                               Mod+Shift+U
 *   moveToBrace                              Ctrl+M on a Mac, Ctrl+Shift+M elsewhere
 *   startNewLineBefore                       Mod+Alt+Enter
 *   jumpOutOfCloser                          Tab right before a ")" or quote that ends the line
 */

import { bracketPairs, regions, isInside } from "./scan";
import {
  BRACE_LANGUAGES,
  caretOnly,
  isInlineSpace,
  isWordChar,
  leadingSpace,
  lineEndAt,
  lineStartAt,
  selectedLines,
  unitFor,
  wordAt,
  type Range,
} from "./text";
import type { Edit, EditState, LanguageProfile } from "./types";

/** What kind of run a character belongs to, for word deletion. */
function runKind(ch: string | undefined): "space" | "word" | "punct" {
  if (isInlineSpace(ch)) return "space";
  return isWordChar(ch) ? "word" : "punct";
}

function deleteRange(range: Range): Edit {
  return { from: range.start, to: range.end, insert: "", selectionStart: range.start, selectionEnd: range.start };
}

/**
 * Delete to Word Start: removes the run of identifier characters, spaces or punctuation that
 * ends at the caret, staying on its line. At column 0 it joins the line onto the one above.
 */
export function deleteWordBackward(range: Range): Edit | null {
  const { text, start, end } = range;
  if (start !== end) return deleteRange(range);
  if (start === 0) return null;
  const lineStart = lineStartAt(text, start);
  if (start === lineStart) return deleteRange({ text, start: start - 1, end: start });
  const kind = runKind(text[start - 1]);
  let from = start;
  while (from > lineStart && runKind(text[from - 1]) === kind) from -= 1;
  return deleteRange({ text, start: from, end: start });
}

/** Delete to Word End: the mirror of deleteWordBackward. At a line end it joins the next line. */
export function deleteWordForward(range: Range): Edit | null {
  const { text, start, end } = range;
  if (start !== end) return deleteRange(range);
  if (start >= text.length) return null;
  const lineEnd = lineEndAt(text, start);
  if (start === lineEnd) return deleteRange({ text, start, end: start + 1 });
  const kind = runKind(text[start]);
  let to = start;
  while (to < lineEnd && runKind(text[to]) === kind) to += 1;
  return deleteRange({ text, start, end: to });
}

/** The selection's anchor (the end that stays) and head (the end that moves). */
function anchorAndHead(state: EditState, range: Range): { readonly anchor: number; readonly head: number } {
  return state.selectionDirection === "backward"
    ? { anchor: range.end, head: range.start }
    : { anchor: range.start, head: range.end };
}

/** A caret at `target`, or with `extend` a selection from the anchor to it. */
function moveHead(state: EditState, range: Range, target: number, extend: boolean): Edit {
  if (!extend) return caretOnly(range.start, target);
  const { anchor } = anchorAndHead(state, range);
  const backward = target < anchor;
  return {
    from: range.start,
    to: range.start,
    insert: "",
    selectionStart: Math.min(anchor, target),
    selectionEnd: Math.max(anchor, target),
    selectionDirection: backward ? "backward" : "forward",
  };
}

/**
 * IntelliJ's Home: to the first non-blank character, and from there to column 0, toggling. With
 * Shift the selection grows or shrinks from its anchor.
 */
export function smartHome(state: EditState, range: Range, extend: boolean): Edit {
  const { text } = range;
  const { head } = anchorAndHead(state, range);
  const lineStart = lineStartAt(text, head);
  const line = text.slice(lineStart, lineEndAt(text, head));
  const firstCode = lineStart + leadingSpace(line).length;
  const target = head === firstCode ? lineStart : firstCode;
  return moveHead(state, range, target, extend);
}

/** Whether `ch` goes straight after the previous line's end with no space when joining. */
const NO_SPACE_BEFORE = /^[)\].,;]/;
const NO_SPACE_AFTER = /[([]$/;

/**
 * Join Lines: the next line, or every selected line, onto the first, with the whitespace between
 * them collapsed to one space (none before ")", "]", ".", "," or ";" and none after "(" or "[").
 * The caret lands at the last join.
 */
export function joinLines(range: Range): Edit {
  const { text } = range;
  const span = selectedLines(range);
  const multi = text.slice(span.start, span.end).includes("\n");
  if (!multi && span.end >= text.length) return caretOnly(range.start, range.start);
  const to = multi ? span.end : lineEndAt(text, span.end + 1);
  const [first = "", ...rest] = text.slice(span.start, to).split("\n");
  let joined = first.replace(/[ \t]+$/, "");
  let caret = joined.length;
  for (const line of rest) {
    const next = line.trim();
    if (next === "") continue;
    const glue = joined.trim() === "" || NO_SPACE_BEFORE.test(next) || NO_SPACE_AFTER.test(joined) ? "" : " ";
    caret = joined.length;
    joined = `${joined}${glue}${next}`;
  }
  return { from: span.start, to, insert: joined, selectionStart: span.start + caret, selectionEnd: span.start + caret };
}

/**
 * Toggle Case: upper-cases the selection, or the word at the caret; lower-cases it when it is
 * already all upper case. The selection stays where it was.
 */
export function toggleCase(range: Range): Edit | null {
  const { text, start, end } = range;
  const target = start !== end ? { start, end } : wordAt(text, start);
  if (target === null) return null;
  const original = text.slice(target.start, target.end);
  const upper = original.toUpperCase();
  const insert = original === upper && upper !== original.toLowerCase() ? original.toLowerCase() : upper;
  return { from: target.start, to: target.end, insert, selectionStart: start, selectionEnd: end };
}

/**
 * Move Caret to Matching Brace: from a bracket (before or after the caret) to its partner, and
 * with no bracket beside the caret, to the innermost bracket that encloses it.
 */
export function moveToBrace(range: Range, profile: LanguageProfile): Edit | null {
  const { text } = range;
  const caret = range.end;
  const pairs = bracketPairs(text, profile);
  const at = (pos: number, side: "open" | "close") => pairs.find((pair) => pair[side] === pos);
  const target =
    at(caret, "open")?.close ??
    at(caret, "close")?.open ??
    at(caret - 1, "close")?.open ??
    at(caret - 1, "open")?.close ??
    innermostOpener(pairs, caret);
  return target === undefined ? null : caretOnly(range.start, target);
}

function innermostOpener(pairs: ReturnType<typeof bracketPairs>, caret: number): number | undefined {
  const enclosing = pairs.filter((pair) => pair.open < caret && caret <= pair.close);
  return enclosing.reduce<number | undefined>((best, pair) => (best === undefined || pair.open > best ? pair.open : best), undefined);
}

/**
 * Start New Line Before Current: a line above at the current line's indent, caret on it. Above a
 * line that starts with "}" the new line sits one level in, inside the block that brace ends.
 */
export function startNewLineBefore(range: Range, profile: LanguageProfile): Edit {
  const { text } = range;
  const lineStart = lineStartAt(text, range.start);
  const line = text.slice(lineStart, lineEndAt(text, range.start));
  const base = leadingSpace(line);
  const closer = BRACE_LANGUAGES.has(profile.id) && line.trimStart().startsWith("}");
  const indent = closer ? base + unitFor(base, profile) : base;
  const caret = lineStart + indent.length;
  return { from: lineStart, to: lineStart, insert: `${indent}\n`, selectionStart: caret, selectionEnd: caret };
}

/** What may follow the caret on its line for Tab to step out: closers, then an optional ";". */
const ONLY_CLOSERS = /^[)\]>"'`]+[;,]?[ \t]*$/;

/**
 * Tab inside `println("abc|")`: steps over the quote, and the next Tab over the ")". Only when
 * everything after the caret on the line is closers (a ";" may end it), so Tab in the middle of
 * real code still indents. A quote is stepped over only from inside its string.
 */
export function jumpOutOfCloser(range: Range, profile: LanguageProfile): Edit | null {
  const { text, start, end } = range;
  if (start !== end) return null;
  const rest = text.slice(start, lineEndAt(text, start));
  if (!ONLY_CLOSERS.test(rest)) return null;
  const next = text[start] ?? "";
  if (profile.quotes.includes(next)) {
    const inString = regions(text, profile, start).some((region) => region.kind === "string" && isInside(region, start));
    if (!inString) return null;
  }
  return caretOnly(start, start + 1);
}
