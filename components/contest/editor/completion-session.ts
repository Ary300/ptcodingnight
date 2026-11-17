/**
 * The pure decisions behind the editor's completion popup, kept out of the component so each is a
 * unit test (tests/unit/editor-completion-session.test.ts) rather than a browser test.
 *
 * The popup itself is IntelliJ's lookup: it opens on its own while an identifier is being typed and
 * right after a "." or "::", the arrows move through it, Enter or Tab accept, and Escape closes it.
 * What it must never do is open inside a string or a comment, where every word a student types
 * would drag a list of Java keywords along with it.
 */

import type { Token, TokenKind } from "./highlight";
import type { CompletionContext, Edit } from "./smart/types";

/**
 * Keys after which the popup is refreshed: an identifier character, or the last character of a
 * member separator ("." , "::" and C++'s "->"). Anything else typed closes it.
 */
export function isCompletionTrigger(key: string): boolean {
  return key.length === 1 && /[A-Za-z0-9_$.:>]/.test(key);
}

/** The highlighter's kind for the character at `offset`, or null past the end of the text. */
export function tokenKindAt(tokens: readonly Token[], offset: number): TokenKind | null {
  if (offset < 0) return null;
  let start = 0;
  for (const token of tokens) {
    const end = start + token.value.length;
    if (offset < end) return token.kind;
    start = end;
  }
  return null;
}

/**
 * Whether completion at `ctx` sits inside a string or a comment.
 *
 * The context function already rejects a caret that is inside a string or comment on its own LINE.
 * The highlighter's tokens add what a single line cannot know: a block comment or a Python triple-
 * quoted string that opened on an earlier line. The character checked is the first one of the
 * prefix, or the separator in front of an empty prefix ("System.|").
 */
export function insideStringOrComment(tokens: readonly Token[], ctx: CompletionContext): boolean {
  const probe = ctx.prefix === "" ? ctx.replaceFrom - 1 : ctx.replaceFrom;
  const kind = tokenKindAt(tokens, probe);
  return kind === "string" || kind === "comment";
}

/** The next active row, wrapping at both ends the way IntelliJ's lookup does. */
export function stepIndex(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return (((index + delta) % count) + count) % count;
}

/**
 * Whether applying `edit` to `text` would leave it unchanged.
 *
 * Accepting "result" when "result" is already typed changes nothing, and swallowing the student's
 * Enter for it reads as a broken key. Such an accept is passed through as an ordinary keystroke.
 */
export function isNoOpEdit(text: string, edit: Edit): boolean {
  return text.slice(edit.from, edit.to) === edit.insert && edit.selectionStart === edit.from + edit.insert.length;
}
