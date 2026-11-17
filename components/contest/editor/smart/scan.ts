/**
 * Reading code the way the compiler does: which characters are code, which sit in a string or a
 * comment, and which brackets pair up. Pure, so every keystroke module can ask "is the caret in
 * a string?" without a parser.
 */

import { BRACE_LANGUAGES, lineEndAt } from "./text";
import type { LanguageProfile } from "./types";

/** A string literal or a comment, as [from, to) in the text, `closed` when it ends properly. */
export interface Region {
  readonly kind: "string" | "comment";
  readonly from: number;
  readonly to: number;
  readonly closed: boolean;
  /** Length of the opening delimiter: 1 for "x", 3 for a docstring, 2 for a comment. */
  readonly openLength: number;
}

export type RegionKind = "code" | Region["kind"];

interface StringEnd {
  readonly end: number;
  readonly closed: boolean;
}

/** Where a string starting at `at` ends (exclusive), and whether it was closed. */
function stringEnd(text: string, at: number, quote: string): StringEnd {
  const triple = quote.repeat(3);
  if (text.startsWith(triple, at)) {
    const close = text.indexOf(triple, at + 3);
    return close === -1 ? { end: text.length, closed: false } : { end: close + 3, closed: true };
  }
  let i = at + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") i += 2;
    else if (ch === quote) return { end: i + 1, closed: true };
    else if (ch === "\n") return { end: i, closed: false };
    else i += 1;
  }
  return { end: text.length, closed: false };
}

/** Index just after the string starting at `at`; an unterminated one stops at its line end. */
export function skipString(text: string, at: number, quote: string): number {
  return Math.min(stringEnd(text, at, quote).end, text.length);
}

/** Every string and comment that starts before `end`, in order. */
export function regions(text: string, profile: LanguageProfile, end = text.length): readonly Region[] {
  const blockComments = BRACE_LANGUAGES.has(profile.id);
  const found: Region[] = [];
  let i = 0;
  while (i < end) {
    if (text.startsWith(profile.lineComment, i)) {
      const to = lineEndAt(text, i);
      found.push({ kind: "comment", from: i, to, closed: false, openLength: profile.lineComment.length });
      i = to;
    } else if (blockComments && text.startsWith("/*", i)) {
      const close = text.indexOf("*/", i + 2);
      const to = close === -1 ? text.length : close + 2;
      found.push({ kind: "comment", from: i, to, closed: close !== -1, openLength: 2 });
      i = to;
    } else if (profile.quotes.includes(text[i] ?? "")) {
      const quote = text[i] ?? "";
      const { end: to, closed } = stringEnd(text, i, quote);
      const openLength = text.startsWith(quote.repeat(3), i) ? 3 : 1;
      found.push({ kind: "string", from: i, to: Math.min(to, text.length), closed, openLength });
      i = to;
    } else {
      i += 1;
    }
  }
  return found;
}

/** Whether `pos` is inside `region`: past its opener, and before its closer if it has one. */
export function isInside(region: Region, pos: number): boolean {
  return region.closed ? pos > region.from && pos < region.to : pos > region.from && pos <= region.to;
}

/**
 * What `pos` sits in. A caret just before an opening quote is in code, and just after a closing
 * one is in code again; at the end of an unterminated string or a line comment it is inside.
 */
export function regionAt(text: string, pos: number, profile: LanguageProfile): RegionKind {
  const region = regions(text, profile, pos).find((candidate) => isInside(candidate, pos));
  return region === undefined ? "code" : region.kind;
}

/** Walks the code in [0, end) and reports every character outside strings and comments. */
export function scanCode(
  text: string,
  end: number,
  profile: LanguageProfile,
  visit: (ch: string, pos: number) => void,
): void {
  let i = 0;
  for (const region of regions(text, profile, end)) {
    for (; i < Math.min(region.from, end); i += 1) visit(text[i] ?? "", i);
    i = region.to;
  }
  for (; i < end; i += 1) visit(text[i] ?? "", i);
}

/** A matched bracket pair in code: the offsets of the opener and of its closer. */
export interface BracketPair {
  readonly open: number;
  readonly close: number;
  readonly ch: string;
}

const CLOSER_OF: Readonly<Record<string, string>> = { "(": ")", "[": "]", "{": "}" };
const OPENER_OF: Readonly<Record<string, string>> = { ")": "(", "]": "[", "}": "{" };

/**
 * Every matched (), [] and {} in the code, strings and comments excluded. A mismatched closer
 * discards the openers above its own, so a missing ")" does not poison the "}" after it.
 */
export function bracketPairs(text: string, profile: LanguageProfile): readonly BracketPair[] {
  const pairs: BracketPair[] = [];
  let stack: readonly { readonly ch: string; readonly pos: number }[] = [];
  scanCode(text, text.length, profile, (ch, pos) => {
    if (CLOSER_OF[ch] !== undefined) {
      stack = [...stack, { ch, pos }];
      return;
    }
    const opener = OPENER_OF[ch];
    if (opener === undefined) return;
    const match = stack.map((entry) => entry.ch).lastIndexOf(opener);
    if (match === -1) return;
    const entry = stack[match];
    if (entry !== undefined) pairs.push({ open: entry.pos, close: pos, ch: opener });
    stack = stack.slice(0, match);
  });
  return pairs;
}
