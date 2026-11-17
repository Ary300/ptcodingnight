/**
 * IntelliJ's Comment with Block Comment (Ctrl+Shift+/, Cmd+Option+/ on a Mac) for Java and C++.
 *
 * With a selection it wraps it in a block comment; inside an existing block comment (or with one
 * selected) it removes the markers; with no selection it inserts an empty comment with the caret
 * between the markers. Python has no block comment, so PyCharm does nothing and neither does this.
 */

import { regions } from "./scan";
import { BRACE_LANGUAGES, type Range } from "./text";
import type { Edit, LanguageProfile } from "./types";

const OPEN = "/*";
const CLOSE = "*/";

export function toggleBlockComment(range: Range, profile: LanguageProfile): Edit | null {
  if (!BRACE_LANGUAGES.has(profile.id)) return null;
  const { text, start, end } = range;

  const enclosing = regions(text, profile).find(
    (region) =>
      region.kind === "comment" &&
      region.closed &&
      text.startsWith(OPEN, region.from) &&
      region.from <= start &&
      end <= region.to &&
      (start > region.from || end < region.to || start !== end),
  );
  if (enclosing !== undefined) return unwrap(text, enclosing.from, enclosing.to, range);

  if (start === end) {
    return { from: start, to: start, insert: OPEN + CLOSE, selectionStart: start + 2, selectionEnd: start + 2 };
  }
  const insert = OPEN + text.slice(start, end) + CLOSE;
  return { from: start, to: end, insert, selectionStart: start, selectionEnd: start + insert.length };
}

/** Removes the markers of the comment at [from, to), with the one space each side IntelliJ adds. */
function unwrap(text: string, from: number, to: number, range: Range): Edit {
  const inner = text.slice(from + OPEN.length, to - CLOSE.length);
  const lead = inner.startsWith(" ") && inner.endsWith(" ") && inner.length > 1 ? 1 : 0;
  const body = inner.slice(lead, inner.length - lead);
  const removedBefore = OPEN.length + lead;
  const clamp = (pos: number) => Math.min(Math.max(pos - removedBefore, from), from + body.length);
  return { from, to, insert: body, selectionStart: clamp(range.start), selectionEnd: clamp(range.end) };
}
