/**
 * IntelliJ's Extend Selection and Shrink Selection (Alt+Up / Alt+Down on a Mac; Ctrl+W cannot be
 * taken from a browser elsewhere, so Alt+Shift+Right / Alt+Shift+Left there, as VS Code binds it).
 *
 * Each press grows the selection by one syntactic step: the word, the dotted chain or call, the
 * inside of the enclosing string or brackets, the brackets themselves, the line without its
 * indent, the whole line, the block's lines, the block with its header, and finally the file.
 * Shrink takes the largest of those steps that fits strictly inside the current selection.
 */

import { bracketPairs, regions, type BracketPair } from "./scan";
import {
  BRACE_LANGUAGES,
  isWordChar,
  leadingSpace,
  lineEndAt,
  lineStartAt,
  normalise,
  wordAt,
  type LineSpan,
} from "./text";
import type { EditState, LanguageProfile } from "./types";

type Span = LineSpan;

/** The chain of names, calls and indexes around the word: `a.b(c)[i]`. */
function chainAround(text: string, word: Span, pairs: readonly BracketPair[]): Span {
  const closeOf = new Map(pairs.map((pair) => [pair.open, pair.close] as const));
  const openOf = new Map(pairs.map((pair) => [pair.close, pair.open] as const));
  let { start, end } = word;
  for (;;) {
    const close = closeOf.get(end);
    if (close !== undefined && (text[end] === "(" || text[end] === "[")) end = close + 1;
    else if (text[end] === "." && isWordChar(text[end + 1])) end = wordAt(text, end + 1)?.end ?? end + 1;
    else break;
  }
  for (;;) {
    if (text[start - 1] !== ".") break;
    let i = start - 1;
    const open = openOf.get(i - 1);
    if (open !== undefined) i = open;
    const previous = wordAt(text, i);
    if (previous === null || previous.end !== i) break;
    start = previous.start;
  }
  return { start, end };
}

/** Lines strictly between an opener at the end of its line and a closer at the start of its own. */
function innerLines(text: string, pair: BracketPair): Span | null {
  const afterOpen = lineEndAt(text, pair.open);
  const closeLineStart = lineStartAt(text, pair.close);
  if (text.slice(pair.open + 1, afterOpen).trim() !== "") return null;
  if (text.slice(closeLineStart, pair.close).trim() !== "") return null;
  if (afterOpen + 1 >= closeLineStart) return null;
  return { start: afterOpen + 1, end: closeLineStart };
}

/** Python blocks enclosing the line at `pos`: each header with its deeper-indented lines. */
function indentBlocks(text: string, pos: number): readonly Span[] {
  const lines = text.split("\n");
  const starts = lines.reduce<number[]>((acc, _line, i) => [...acc, i === 0 ? 0 : (acc[i - 1] ?? 0) + (lines[i - 1] ?? "").length + 1], []);
  const lineIndex = text.slice(0, pos).split("\n").length - 1;
  const width = (i: number) => leadingSpace(lines[i] ?? "").length;
  const blank = (i: number) => (lines[i] ?? "").trim() === "";
  const found: Span[] = [];
  let current = blank(lineIndex) ? Number.POSITIVE_INFINITY : width(lineIndex);
  for (let h = lineIndex - 1; h >= 0; h -= 1) {
    if (blank(h) || width(h) >= current || !(lines[h] ?? "").trimEnd().endsWith(":")) continue;
    current = width(h);
    let last = h;
    for (let j = h + 1; j < lines.length && (blank(j) || width(j) > current); j += 1) if (!blank(j)) last = j;
    const end = (starts[last] ?? 0) + (lines[last] ?? "").length;
    const headerStart = (starts[h] ?? 0) + current;
    const bodyStart = starts[h + 1] ?? end;
    found.push({ start: bodyStart, end }, { start: headerStart, end }, { start: starts[h] ?? 0, end });
  }
  return found;
}

/** Every step Extend Selection can take around `pos`. */
function candidates(text: string, pos: number, profile: LanguageProfile): readonly Span[] {
  const pairs = bracketPairs(text, profile);
  const found: Span[] = [];
  const word = wordAt(text, pos);
  if (word !== null) found.push(word, chainAround(text, word, pairs));

  for (const region of regions(text, profile)) {
    if (region.kind !== "string" || pos < region.from || pos > region.to) continue;
    const closeLength = region.closed ? region.openLength : 0;
    found.push({ start: region.from + region.openLength, end: region.to - closeLength }, { start: region.from, end: region.to });
  }

  for (const pair of pairs) {
    if (pos < pair.open || pos > pair.close + 1) continue;
    const block = pair.ch === "{" && BRACE_LANGUAGES.has(profile.id);
    const inner = block ? innerLines(text, pair) : null;
    // A block's inside is its whole lines; the raw inside would start mid-line after the "{".
    found.push(inner ?? { start: pair.open + 1, end: pair.close }, { start: pair.open, end: pair.close + 1 });
    if (!block) continue;
    const headerStart = lineStartAt(text, pair.open);
    const header = text.slice(headerStart, pair.open);
    found.push({ start: headerStart + leadingSpace(header).length, end: pair.close + 1 });
  }

  const lineStart = lineStartAt(text, pos);
  const lineEnd = lineEndAt(text, pos);
  const line = text.slice(lineStart, lineEnd);
  found.push({ start: lineStart + leadingSpace(line).length, end: lineStart + line.trimEnd().length });
  found.push({ start: lineStart, end: Math.min(text.length, lineEnd + 1) });
  if (!BRACE_LANGUAGES.has(profile.id)) found.push(...indentBlocks(text, pos));
  found.push({ start: 0, end: text.length });
  return found.filter((span) => span.start <= span.end && span.start >= 0 && span.end <= text.length);
}

/**
 * The steps Extend took, so Shrink walks back down the same ones as IntelliJ's does: from the
 * statement back to `Math.max(a, b)`, not to whatever word starts the statement. Any edit or
 * other selection starts a new trail, since the trail is kept only while the text and the
 * selection are exactly what the last step left.
 */
interface Trail {
  readonly text: string;
  readonly steps: readonly Span[];
}

let trail: Trail | null = null;

function sameSpan(a: Span | undefined, start: number, end: number): boolean {
  return a !== undefined && a.start === start && a.end === end;
}

/** The selection one step larger, or null when it already covers the whole file. */
export function extendSelection(state: EditState, profile: LanguageProfile): Span | null {
  const { text, start, end } = normalise(state);
  const lines: Span = { start: lineStartAt(text, start), end: Math.min(text.length, lineEndAt(text, Math.max(start, end - 1)) + 1) };
  const all = [...candidates(text, start, profile), lines];
  const containing = all.filter((span) => span.start <= start && span.end >= end && span.end - span.start > end - start);
  const best = containing.reduce<Span | null>((min, span) => (min === null || span.end - span.start < min.end - min.start ? span : min), null);
  if (best !== null) {
    const continues = trail !== null && trail.text === text && sameSpan(trail.steps[trail.steps.length - 1], start, end);
    const steps = continues && trail !== null ? trail.steps : [{ start, end }];
    trail = { text, steps: [...steps, best] };
  }
  return best;
}

/** The selection one step smaller, or a caret at its start when no smaller step fits inside. */
export function shrinkSelection(state: EditState, profile: LanguageProfile): Span | null {
  const { text, start, end } = normalise(state);
  if (start === end) return null;
  if (trail !== null && trail.text === text && trail.steps.length > 1 && sameSpan(trail.steps[trail.steps.length - 1], start, end)) {
    const steps = trail.steps.slice(0, -1);
    trail = { text, steps };
    const previous = steps[steps.length - 1];
    if (previous !== undefined) return previous;
  }
  const firstCode = start + leadingSpace(text.slice(start, end)).length;
  const all = [...candidates(text, start, profile), ...candidates(text, firstCode, profile)];
  const inside = all.filter(
    (span) => span.start >= start && span.end <= end && span.end > span.start && span.end - span.start < end - start,
  );
  const best = inside.reduce<Span | null>((max, span) => (max === null || span.end - span.start > max.end - max.start ? span : max), null);
  return best ?? { start, end: start };
}
