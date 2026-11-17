import { isNameChar } from "./char-kinds";

/**
 * IntelliJ's "highlight usages of the element at the caret", done lexically.
 *
 * Every whole-word occurrence of the name under the caret, outside strings and comments, gets a
 * soft background. With a selection, every occurrence of the selected text does. There is no
 * type information, so two locals called `i` in different methods light up together, which is
 * the right trade for a single contest file.
 */

export interface TextRange {
  readonly from: number;
  readonly to: number;
}

/** Past this many the marks stop helping and start costing frames. */
export const OCCURRENCE_CAP = 500;

const NAME_CHAR = /[A-Za-z0-9_$]/;

function nameCharAt(source: string, kinds: Uint8Array, offset: number): boolean {
  return NAME_CHAR.test(source[offset] ?? "") && isNameChar(kinds, offset);
}

/** The name the caret is in or touching, or null over a keyword, a literal, a string or a comment. */
export function identifierAt(source: string, kinds: Uint8Array, caret: number): TextRange | null {
  let from = caret;
  let to = caret;
  while (from > 0 && nameCharAt(source, kinds, from - 1)) from -= 1;
  while (to < source.length && nameCharAt(source, kinds, to)) to += 1;
  if (from === to) return null;
  // A name never starts with a digit; `x1` is a name, `1` alone is a number the tokenizer kept.
  if (/[0-9]/.test(source[from] ?? "")) return null;
  return { from, to };
}

/** Whole-word occurrences of `word` in code, ascending. */
export function wordOccurrences(
  source: string,
  kinds: Uint8Array,
  word: string,
  cap: number = OCCURRENCE_CAP,
): readonly TextRange[] {
  const found: TextRange[] = [];
  if (word === "") return found;
  let index = source.indexOf(word);
  while (index !== -1 && found.length < cap) {
    const end = index + word.length;
    const whole = !NAME_CHAR.test(source[index - 1] ?? "") && !NAME_CHAR.test(source[end] ?? "");
    if (whole && isNameChar(kinds, index)) found.push({ from: index, to: end });
    index = source.indexOf(word, index + 1);
  }
  return found;
}

/** Every non-overlapping occurrence of `needle`, strings and comments included, as IntelliJ does. */
export function textOccurrences(
  source: string,
  needle: string,
  cap: number = OCCURRENCE_CAP,
): readonly TextRange[] {
  const found: TextRange[] = [];
  if (needle === "") return found;
  let index = source.indexOf(needle);
  while (index !== -1 && found.length < cap) {
    found.push({ from: index, to: index + needle.length });
    index = source.indexOf(needle, index + needle.length);
  }
  return found;
}

/**
 * What to highlight for this selection.
 *
 * A collapsed caret in a name: that name's usages, but only when there are at least two, so the
 * word being typed for the first time does not light up under the student's fingers. A selection
 * on one line of at least two non-space characters: its occurrences, again only when it is not
 * the only one. Anything else: nothing.
 */
export function usageRanges(
  source: string,
  kinds: Uint8Array,
  selectionStart: number,
  selectionEnd: number,
): readonly TextRange[] {
  if (selectionStart !== selectionEnd) {
    const from = Math.min(selectionStart, selectionEnd);
    const to = Math.max(selectionStart, selectionEnd);
    const selected = source.slice(from, to);
    if (selected.includes("\n") || selected.trim().length < 2) return [];
    const ranges = textOccurrences(source, selected);
    return ranges.length >= 2 ? ranges : [];
  }
  const name = identifierAt(source, kinds, selectionStart);
  if (name === null) return [];
  const ranges = wordOccurrences(source, kinds, source.slice(name.from, name.to));
  return ranges.length >= 2 ? ranges : [];
}
