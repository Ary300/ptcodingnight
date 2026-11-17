import { isCode } from "./char-kinds";

/**
 * Bracket pairing for the two marks IntelliJ draws without being asked: the partner of the
 * bracket next to the caret, and a bracket that has no partner at all.
 *
 * One pass with a stack over the code characters (strings and comments skipped through the
 * tokenizer's own classification), so pairing is computed once per edit and a caret move is a
 * map lookup.
 *
 * ## Mismatches
 *
 * `{ f( }` is the common shape: a missing ")" inside a block that is otherwise closed. The "}"
 * pairs with "{", and the "(" it skipped over is the one reported. A closer that matches nothing
 * on the stack at all, such as a stray "}" at the end of a file, is reported itself and leaves
 * the stack alone, so one extra brace does not unpair every block above it.
 */

const OPENER_OF: Readonly<Record<string, string>> = { ")": "(", "]": "[", "}": "{" };
const OPENERS = new Set(["(", "[", "{"]);

export interface BracketPairs {
  /** Both directions: opener offset to closer offset and closer to opener. */
  readonly partner: ReadonlyMap<number, number>;
  /** Offsets of brackets with no partner, ascending. */
  readonly unmatched: readonly number[];
}

export function isBracket(char: string | undefined): boolean {
  return char !== undefined && (OPENERS.has(char) || char in OPENER_OF);
}

export function pairBrackets(source: string, kinds: Uint8Array): BracketPairs {
  const partner = new Map<number, number>();
  const unmatched: number[] = [];
  const stack: number[] = [];

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? "";
    if (!isBracket(char) || !isCode(kinds, index)) continue;
    if (OPENERS.has(char)) {
      stack.push(index);
      continue;
    }
    const wanted = OPENER_OF[char];
    let depth = stack.length - 1;
    while (depth >= 0 && source[stack[depth] ?? -1] !== wanted) depth -= 1;
    if (depth < 0) {
      unmatched.push(index);
      continue;
    }
    // Everything opened after the partner was never closed.
    for (const skipped of stack.splice(depth + 1)) unmatched.push(skipped);
    const opener = stack.pop() ?? 0;
    partner.set(opener, index);
    partner.set(index, opener);
  }
  for (const open of stack) unmatched.push(open);

  unmatched.sort((a, b) => a - b);
  return { partner, unmatched };
}

export interface BracketMatch {
  /** The bracket beside the caret. */
  readonly at: number;
  /** Its partner, or null when it has none (drawn as an error). */
  readonly partner: number | null;
}

/**
 * The bracket the caret is touching, and its partner.
 *
 * IntelliJ prefers a closer just before the caret (you have just typed it, or arrowed past it),
 * then an opener just after it, then the other two sides.
 */
export function bracketMatchAt(
  source: string,
  kinds: Uint8Array,
  pairs: BracketPairs,
  caret: number,
): BracketMatch | null {
  const candidates: readonly (readonly [number, boolean])[] = [
    [caret - 1, false],
    [caret, true],
    [caret - 1, true],
    [caret, false],
  ];
  for (const [offset, wantOpener] of candidates) {
    const char = source[offset];
    if (offset < 0 || !isBracket(char) || !isCode(kinds, offset)) continue;
    if (OPENERS.has(char ?? "") !== wantOpener) continue;
    return { at: offset, partner: pairs.partner.get(offset) ?? null };
  }
  return null;
}
