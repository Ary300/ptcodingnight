/**
 * Cyclic Expand Word, IntelliJ's "hippie" completion (Alt+/ forward, Alt+Shift+/ backward).
 *
 * It completes the word before the caret from the other words in the file. Forward looks above
 * the caret first, nearest first, then below; backward looks below first. Pressing it again
 * replaces the last expansion with the next candidate, so the surface keeps the anchor (where the
 * typed prefix started and what the prefix was) and a count of presses.
 */

import type { Edit } from "./types";

const WORD = /[A-Za-z0-9_$]+/g;
const WORD_CHAR = /[A-Za-z0-9_$]/;

export interface ExpandWordAnchor {
  /** Where the prefix the student typed starts. */
  readonly from: number;
  /** The prefix as the student typed it, before any expansion. */
  readonly prefix: string;
}

/** The anchor for a first press at `caret`, or null when no word ends there. */
export function expandWordAnchor(text: string, caret: number): ExpandWordAnchor | null {
  let from = caret;
  while (from > 0 && WORD_CHAR.test(text.charAt(from - 1))) from -= 1;
  if (from === caret) return null;
  return { from, prefix: text.slice(from, caret) };
}

/** The candidate words for `anchor`, in the order the presses visit them. */
export function expandWordCandidates(text: string, anchor: ExpandWordAnchor, direction: 1 | -1): readonly string[] {
  const above: { readonly word: string; readonly at: number }[] = [];
  const below: { readonly word: string; readonly at: number }[] = [];
  for (const match of text.matchAll(WORD)) {
    const word = match[0];
    if (match.index === anchor.from || word === anchor.prefix || !word.startsWith(anchor.prefix)) continue;
    (match.index < anchor.from ? above : below).push({ word, at: match.index });
  }
  const nearestAbove = [...above].sort((a, b) => b.at - a.at).map((entry) => entry.word);
  const nearestBelow = below.map((entry) => entry.word);
  const ordered = direction === 1 ? [...nearestAbove, ...nearestBelow] : [...nearestBelow, ...nearestAbove];
  return [...new Set(ordered)];
}

/**
 * The edit for press number `press` (0 for the first) after `anchor`, replacing everything from
 * the anchor to `caret` (the prefix plus the previous expansion). Wraps back to the typed prefix
 * after the last candidate, as IntelliJ does. Null when no word in the file extends the prefix.
 */
export function expandWord(
  text: string,
  caret: number,
  anchor: ExpandWordAnchor,
  press: number,
  direction: 1 | -1 = 1,
): Edit | null {
  const candidates = expandWordCandidates(text, anchor, direction);
  if (candidates.length === 0) return null;
  const cycle = [...candidates, anchor.prefix];
  const word = cycle[press % cycle.length] ?? anchor.prefix;
  const end = anchor.from + word.length;
  return { from: anchor.from, to: caret, insert: word, selectionStart: end, selectionEnd: end };
}
