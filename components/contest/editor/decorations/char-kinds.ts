import type { Token, TokenKind } from "../highlight";

/**
 * What each character of the source is, as one byte per character.
 *
 * Every on-screen mark needs to know whether an offset is code, or sits inside a string or a
 * comment: a "}" in `"}"` is not a brace, and `count` in `// count the rows` is not a usage of
 * the variable. The tokenizer already answered that for the colours, so the marks read its answer
 * rather than scanning the text a second way that could disagree with what the student sees.
 *
 * A typed array because the source can legally be 200 000 characters and this is rebuilt on
 * every edit.
 */

export const KIND_CODE: Readonly<Record<TokenKind, number>> = {
  plain: 0,
  keyword: 1,
  type: 2,
  string: 3,
  number: 4,
  comment: 5,
  punctuation: 6,
};

export function charKinds(tokens: readonly Token[], length: number): Uint8Array {
  const kinds = new Uint8Array(length);
  let offset = 0;
  for (const token of tokens) {
    const end = Math.min(length, offset + token.value.length);
    kinds.fill(KIND_CODE[token.kind], offset, end);
    offset = end;
  }
  return kinds;
}

/** Outside every string and comment. */
export function isCode(kinds: Uint8Array, offset: number): boolean {
  const kind = kinds[offset];
  return kind !== undefined && kind !== KIND_CODE.string && kind !== KIND_CODE.comment;
}

/** A character of a name the student wrote or a library type: never a keyword, string or comment. */
export function isNameChar(kinds: Uint8Array, offset: number): boolean {
  const kind = kinds[offset];
  return kind === KIND_CODE.plain || kind === KIND_CODE.type;
}
