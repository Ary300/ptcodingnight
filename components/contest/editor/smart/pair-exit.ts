import type { Edit } from "./types";

/**
 * Tab out of an auto-inserted closer, the way IntelliJ's "Jump outside closing bracket/quote with
 * Tab" works: only while the caret has stayed inside that pair since the editor typed its closer.
 *
 * Typing `(` writes `()` with the caret between; Tab then steps over the `)`. Once the caret leaves
 * the pair (an arrow past either bracket, a click elsewhere, a deleted bracket), Tab indents again
 * even when the caret comes back, because the closer is now just text. The pairs nest: in
 * `f(a[|])` Tab steps over `]`, then over `)`.
 *
 * Offsets survive typing inside the pair because the opener sits before every edit (its offset is
 * fixed) and the closer after every edit (its distance from the END of the text is fixed).
 */

export interface OpenPair {
  readonly opener: number;
  /** `text.length - closerOffset`, which typing between the brackets leaves unchanged. */
  readonly closerFromEnd: number;
  readonly openChar: string;
  readonly closeChar: string;
}

export type PairStack = readonly OpenPair[];

const CLOSER_OF: Readonly<Record<string, string>> = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "`": "`" };

/** The pair an applied edit created: an opener and its closer with the collapsed caret between. */
export function pairCreatedBy(edit: Edit, textAfter: string): OpenPair | null {
  if (edit.selectionStart !== edit.selectionEnd) return null;
  const inside = edit.selectionStart - edit.from;
  if (inside < 1 || inside >= edit.insert.length) return null;
  const openChar = edit.insert[inside - 1] ?? "";
  const closeChar = edit.insert[inside] ?? "";
  if (CLOSER_OF[openChar] !== closeChar) return null;
  const opener = edit.selectionStart - 1;
  return { opener, closerFromEnd: textAfter.length - edit.selectionStart, openChar, closeChar };
}

function closerOffset(pair: OpenPair, text: string): number {
  return text.length - pair.closerFromEnd;
}

/** The pairs the caret is still inside, with both brackets still where they were written. */
export function prunePairs(stack: PairStack, text: string, selectionStart: number, selectionEnd: number): PairStack {
  if (stack.length === 0) return stack;
  if (selectionStart !== selectionEnd) return [];
  const kept = stack.filter((pair) => {
    const close = closerOffset(pair, text);
    return (
      close > pair.opener &&
      text[pair.opener] === pair.openChar &&
      text[close] === pair.closeChar &&
      selectionStart > pair.opener &&
      selectionStart <= close
    );
  });
  return kept.length === stack.length ? stack : kept;
}

/** The closer Tab may step over at this caret, or null: the innermost live pair's, when it is right here. */
export function exitableCloserAt(stack: PairStack, text: string, caret: number): number | null {
  const innermost = stack[stack.length - 1];
  if (innermost === undefined) return null;
  return closerOffset(innermost, text) === caret ? caret : null;
}
