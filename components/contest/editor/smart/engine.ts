/**
 * The keystroke half of the editor's IntelliJ behaviour, as one pure function.
 *
 * `handleKey` looks at the editor's text and selection plus the key the surface saw, and either
 * returns ONE replacement (so the surface can apply it with a single insertText call and native
 * undo records one step) or null, meaning "this key is not ours, let the browser act". Nothing in
 * here reads the DOM, the clock or any global, so every behaviour below is a unit test in
 * tests/unit/editor-engine.test.ts.
 *
 * What is covered, each as IntelliJ IDEA does it by default (PyCharm and CLion for the others):
 *
 *   typing     an opener inserts its closer, a closer typed in front of the same closer steps over
 *              it, a selection is wrapped, quotes pair up unless they would end a word or follow a
 *              backslash, and a "}" typed as the first thing on a line snaps to its block's indent.
 *              A quote in front of an existing string opens a new one; only a closing quote is
 *              typed over. Python's `else:`, `elif`, `except` and `finally` snap back to their
 *              opener on the ":".
 *   Backspace  between an empty pair deletes both halves; in the indentation it removes a level.
 *   Enter      keeps the indent, adds one level after a block opener, a case label or a braceless
 *              `if (a)`, drops one after Python's `return` and its kin, splits "{|}" onto three
 *              lines (`};` after a C++ struct), leaves ")" after the caret on a continuation line,
 *              strips the trailing whitespace it leaves behind, and continues a "/** ... *"
 *              comment. Shift+Enter is IntelliJ's "Start New Line": Enter from the end of the line.
 *   Mod+Shift+Enter  Complete Current Statement. Plain Mod+Enter is never answered here: it is the
 *              surface's submit key.
 *   Mod+/      toggles a line comment on every selected line.
 *   Mod+D      duplicates the line, or the selection.
 *   Cmd+Backspace (Mac), Ctrl+Y (elsewhere)  deletes the line.
 *   Alt+Shift+Up/Down  moves the line, or every selected line.
 *   Tab        expands a live template whose abbreviation ends at the caret (a postfix template
 *              after a dot, as in `n.fori`), and otherwise returns null so the surface keeps its
 *              own block indent. A template with fields carries `tabStops`, which the surface
 *              walks with template-session.ts.
 *
 * Mod is Cmd on a Mac and Ctrl everywhere else. IME composition never reaches this function; the
 * surface filters it out first.
 */

import { renderTemplate, shiftStops } from "./template";
import type { Edit, EditState, KeyInput, LanguageProfile } from "./types";

/** Java identifiers allow `$`, so it counts as a word character for pairing and templates. */
const WORD_CHAR = /[A-Za-z0-9_$]/;
const TRAILING_WORD = /[A-Za-z0-9_$]+$/;
const LEADING_INLINE_SPACE = /^[ \t]*/;
const TRAILING_INLINE_SPACE = /[ \t]+$/;

/** Languages with C-style braces and block comments. Python has neither. */
const BRACE_LANGUAGES: ReadonlySet<LanguageProfile["id"]> = new Set(["java", "cpp"]);

/**
 * Word-shaped string prefixes after which a quote still pairs: Python's f"", r"", b"" and their
 * combinations, and C++'s L"", u"", U"", u8"" and R"". Without these, `print(f"` would type one
 * lonely quote, since "f" is a word character.
 */
const STRING_PREFIXES: Readonly<Record<LanguageProfile["id"], ReadonlySet<string>>> = {
  python: new Set(["f", "r", "b", "u", "rb", "br", "fr", "rf"]),
  cpp: new Set(["L", "u", "U", "u8", "R", "LR", "uR", "UR", "u8R"]),
  java: new Set<string>(),
};

/** A selection normalised so start <= end, clamped to the text. */
interface Range {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/** The whole lines a selection touches, as [start, end) with `end` at a line end. */
interface LineSpan {
  readonly start: number;
  readonly end: number;
}

/* ------------------------------------------------------------------------------------------ */
/* Entry point                                                                                  */
/* ------------------------------------------------------------------------------------------ */

export function handleKey(state: EditState, input: KeyInput, profile: LanguageProfile): Edit | null {
  const range = normalise(state);
  const mod = input.isMac ? input.metaKey : input.ctrlKey;
  // Windows and Linux report AltGr as Ctrl+Alt, and that is how many layouts type "{" and "[".
  const altGr = !input.isMac && input.ctrlKey && input.altKey && !input.metaKey;

  if (altGr && input.key.length === 1) return handleTyped(range, input.key, profile);
  if (mod) return input.altKey ? null : handleModKey(range, input, profile);
  if (input.ctrlKey || input.metaKey) return null;

  switch (input.key) {
    case "Enter":
      return input.altKey ? null : handleEnter(range, profile, input.shiftKey);
    case "Backspace":
      return input.altKey ? null : deleteEmptyPair(range, profile);
    case "Tab":
      return input.shiftKey || input.altKey ? null : expandTemplate(range, profile);
    case "ArrowUp":
    case "ArrowDown":
      return input.altKey && input.shiftKey ? moveLines(range, input.key === "ArrowUp") : null;
    default:
      return input.key.length === 1 ? handleTyped(range, input.key, profile) : null;
  }
}

function handleModKey(range: Range, input: KeyInput, profile: LanguageProfile): Edit | null {
  // "/" is Shift+7 on several European layouts, so Shift is not held against it.
  if (input.key === "/") return toggleLineComment(range, profile);
  if ((input.key === "d" || input.key === "D") && !input.shiftKey) return duplicate(range);
  // Mod+Shift+Enter is Complete Current Statement. Plain Mod+Enter is the surface's submit key.
  if (input.key === "Enter") return input.shiftKey ? completeStatement(range, profile) : null;
  // IntelliJ's Delete Line: Cmd+Backspace on a Mac, Ctrl+Y everywhere else.
  if (input.shiftKey) return null;
  if (input.isMac ? input.key === "Backspace" : input.key === "y" || input.key === "Y") return deleteLines(range);
  return null;
}

/* ------------------------------------------------------------------------------------------ */
/* Mod+Shift+Enter and Delete Line                                                              */
/* ------------------------------------------------------------------------------------------ */

const PYTHON_HEADER = /^\s*(?:if|elif|else|for|while|def|class|try|except|finally|with)\b/;
const BRACE_CONTROL = /^(?:\}\s*)?(?:(?:else\s+)?if|for|while|switch|catch|synchronized)\s*\(/;
const BRACE_BARE_CONTROL: ReadonlySet<string> = new Set(["else", "} else", "do", "try", "finally", "} finally"]);

/**
 * IntelliJ's Complete Current Statement, for the line the caret is on: close what the line left
 * open, then either end it with ";" (Java, C++), open its block (`if (x` becomes `if (x) {` with the
 * caret on the indented line inside), or end a Python header with ":". A line with nothing left to
 * complete gets a new line below it, which is what pressing the key twice does in IntelliJ.
 */
function completeStatement(range: Range, profile: LanguageProfile): Edit {
  const { text } = range;
  const lineStart = lineStartAt(text, range.end);
  const lineEnd = lineEndAt(text, range.end);
  const line = text.slice(lineStart, lineEnd).replace(TRAILING_INLINE_SPACE, "");
  const indent = leadingSpace(line);
  const unit = indent.includes("\t") ? "\t" : profile.indentUnit;
  const code = line + unclosedClosers(line);
  const trimmed = code.trim();
  const replace = (insert: string, caret: number): Edit => ({
    from: lineStart,
    to: lineEnd,
    insert,
    selectionStart: lineStart + caret,
    selectionEnd: lineStart + caret,
  });

  if (trimmed === "") return replace(`${line}\n${indent}`, line.length + 1 + indent.length);

  if (!BRACE_LANGUAGES.has(profile.id)) {
    const header = PYTHON_HEADER.test(code);
    const completed = header && !code.endsWith(":") ? `${code}:` : code;
    if (!header && completed === line) return replace(`${line}\n${indent}`, line.length + 1 + indent.length);
    const below = header ? indent + unit : indent;
    const insert = header ? `${completed}\n${below}` : completed;
    return replace(insert, insert.length);
  }

  const opensBody =
    trimmed.endsWith("{") ||
    BRACE_BARE_CONTROL.has(trimmed) ||
    (BRACE_CONTROL.test(trimmed) && trimmed.endsWith(")"));
  if (opensBody) {
    const head = trimmed.endsWith("{") ? code : `${code} {`;
    const middle = `${head}\n${indent}${unit}`;
    // A "{" the file already closes (the line ended in one) needs no second "}".
    const closed = trimmed.endsWith("{") && braceDebt(text, profile) <= 0;
    const closer = profile.id === "cpp" && CPP_AGGREGATE.test(head) ? "};" : "}";
    return replace(closed ? middle : `${middle}\n${indent}${closer}`, middle.length);
  }

  const needsSemicolon = !/[;{}]$/.test(trimmed) && !/^(?:#|\/\/|\/\*|\*|@)/.test(trimmed);
  const completed = needsSemicolon ? `${code};` : code;
  if (completed === line) return replace(`${line}\n${indent}`, line.length + 1 + indent.length);
  return replace(completed, completed.length);
}

/** The closers a line still owes, innermost first: `f(a[i` owes "])". Quotes are skipped. */
function unclosedClosers(line: string): string {
  const closerOf: Readonly<Record<string, string>> = { "(": ")", "[": "]" };
  let stack: readonly string[] = [];
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i] ?? "";
    if (quote !== null) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "(" || ch === "[") {
      stack = [...stack, closerOf[ch] ?? ""];
    } else if ((ch === ")" || ch === "]") && stack[stack.length - 1] === ch) {
      stack = stack.slice(0, -1);
    }
  }
  return [...stack].reverse().join("");
}

/**
 * Deletes the caret's line, or every line the selection touches, newline included. The caret
 * keeps its column on the line that moves up into place, as IntelliJ's Delete Line does.
 */
function deleteLines(range: Range): Edit {
  const { text, start } = range;
  const span = selectedLines(range);
  const column = start - span.start;
  if (span.end < text.length) {
    const nextLength = lineEndAt(text, span.end + 1) - (span.end + 1);
    const caret = span.start + Math.min(column, nextLength);
    return { from: span.start, to: span.end + 1, insert: "", selectionStart: caret, selectionEnd: caret };
  }
  if (span.start === 0) return { from: 0, to: span.end, insert: "", selectionStart: 0, selectionEnd: 0 };
  const prevStart = lineStartAt(text, span.start - 1);
  const caret = prevStart + Math.min(column, span.start - 1 - prevStart);
  return { from: span.start - 1, to: span.end, insert: "", selectionStart: caret, selectionEnd: caret };
}

/* ------------------------------------------------------------------------------------------ */
/* Typing a character                                                                           */
/* ------------------------------------------------------------------------------------------ */

function handleTyped(range: Range, ch: string, profile: LanguageProfile): Edit | null {
  if (range.start !== range.end) return wrapSelection(range, ch, profile);

  const { text, start: caret } = range;
  const next = text[caret];

  if (profile.quotes.includes(ch)) return typeQuote(range, ch, profile);

  const closes = profile.pairs.some(([, close]) => close === ch);
  if (closes && next === ch) return caretOnly(caret, caret + 1);

  const pair = profile.pairs.find(([open]) => open === ch);
  if (pair !== undefined) {
    if (isWordChar(next)) return null;
    return { from: caret, to: caret, insert: pair[0] + pair[1], selectionStart: caret + 1, selectionEnd: caret + 1 };
  }

  if (profile.dedentOnType.includes(ch)) return dedentOnType(range, ch, profile);
  if (ch === ":" && profile.alignOnColon !== undefined) return alignClause(range, profile.alignOnColon);
  return null;
}

/**
 * PyCharm's dedent of a continuation clause: the ":" of `else:`, `elif x:`, `except E:` or
 * `finally:` moves the line back to the `if` or `try` it continues. The opener is the nearest line
 * above with less indent; if that line is not one the clause can continue, nothing moves, since
 * the clause then belongs to something the editor cannot see.
 */
function alignClause(range: Range, openers: Readonly<Record<string, readonly string[]>>): Edit | null {
  const { text, start: caret } = range;
  const lineStart = lineStartAt(text, caret);
  if (text.slice(caret, lineEndAt(text, caret)).trim() !== "") return null;
  const before = text.slice(lineStart, caret);
  const clause = /^[ \t]*([a-z]+)\b/.exec(before)?.[1];
  const allowed = clause === undefined ? undefined : openers[clause];
  if (allowed === undefined) return null;

  const indent = leadingSpace(before);
  const target = enclosingOpenerIndent(text, lineStart, indent.length, allowed);
  if (target === null || target === indent) return null;
  const insert = `${target}${before.slice(indent.length)}:`;
  const after = lineStart + insert.length;
  return { from: lineStart, to: caret, insert, selectionStart: after, selectionEnd: after };
}

/** Indent of the nearest code line above `lineStart` with less than `width` indent, if it opens with one of `words`. */
function enclosingOpenerIndent(
  text: string,
  lineStart: number,
  width: number,
  words: readonly string[],
): string | null {
  let end = lineStart - 1;
  while (end >= 0) {
    const start = lineStartAt(text, end);
    const line = text.slice(start, end);
    end = start - 1;
    const code = line.trim();
    if (code === "" || code.startsWith("#")) continue;
    const indent = leadingSpace(line);
    if (indent.length >= width) continue;
    const first = /^[a-z]+/.exec(code)?.[0];
    return first !== undefined && words.includes(first) ? indent : null;
  }
  return null;
}

function wrapSelection(range: Range, ch: string, profile: LanguageProfile): Edit | null {
  const pair = profile.quotes.includes(ch)
    ? ([ch, ch] as const)
    : profile.pairs.find(([open]) => open === ch);
  if (pair === undefined) return null;

  const { text, start, end } = range;
  return {
    from: start,
    to: end,
    insert: pair[0] + text.slice(start, end) + pair[1],
    selectionStart: start + 1,
    selectionEnd: end + 1,
  };
}

function typeQuote(range: Range, quote: string, profile: LanguageProfile): Edit | null {
  const { text, start: caret } = range;
  const prev = text[caret - 1];
  const next = text[caret];

  // Only a CLOSING quote is typed over. In front of a string's opening quote, as in `f(|"abc")`,
  // the key types one quote and leaves the existing literal alone, as IntelliJ does.
  if (next === quote) return insideStringOnLine(text, caret, quote) ? caretOnly(caret, caret + 1) : null;
  if (prev === "\\" || isWordChar(next)) return null;
  if (isWordChar(prev) && !followsStringPrefix(text, caret, profile)) return null;

  // `""|` plus a third quote opens a Python docstring or a Java text block: `"""|"""`.
  const opensTriple = caret >= 2 && text.slice(caret - 2, caret) === quote + quote && text[caret - 3] !== quote;
  const insert = opensTriple ? quote.repeat(4) : quote + quote;
  return { from: caret, to: caret, insert, selectionStart: caret + 1, selectionEnd: caret + 1 };
}

/**
 * Whether the caret sits inside a `quote` string that opened earlier on its line. Escapes are
 * honoured and the other quote character is text inside it, so `"it's|"` is still a string.
 */
function insideStringOnLine(text: string, caret: number, quote: string): boolean {
  const line = text.slice(lineStartAt(text, caret), caret);
  let open: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (open !== null) {
      if (ch === "\\") i += 1;
      else if (ch === open) open = null;
    } else if (ch === '"' || ch === "'") {
      open = ch;
    }
  }
  return open === quote;
}

function followsStringPrefix(text: string, caret: number, profile: LanguageProfile): boolean {
  const word = TRAILING_WORD.exec(text.slice(lineStartAt(text, caret), caret))?.[0] ?? "";
  return STRING_PREFIXES[profile.id].has(word);
}

function dedentOnType(range: Range, ch: string, profile: LanguageProfile): Edit | null {
  const { text, start: caret } = range;
  const lineStart = lineStartAt(text, caret);
  const before = text.slice(lineStart, caret);
  if (before.trim() !== "") return null;

  const target = dedentTarget(text, lineStart, before, ch, profile);
  if (target === null || target === before) return null;

  const after = lineStart + target.length + 1;
  return { from: lineStart, to: caret, insert: target + ch, selectionStart: after, selectionEnd: after };
}

/**
 * The indent a dedent character should land at. A closer goes to the indent of the line holding
 * its unmatched opener; any other dedent character drops one indent level from where it was.
 */
function dedentTarget(
  text: string,
  lineStart: number,
  currentIndent: string,
  ch: string,
  profile: LanguageProfile,
): string | null {
  const pair = profile.pairs.find(([, close]) => close === ch);
  if (pair === undefined) return removeOneIndent(currentIndent, profile.indentUnit);

  const openerAt = findUnmatchedOpener(text, lineStart, pair[0], profile);
  if (openerAt === null) return null;
  return leadingSpace(text.slice(lineStartAt(text, openerAt), lineEndAt(text, openerAt)));
}

function removeOneIndent(indent: string, unit: string): string {
  if (indent.endsWith(unit)) return indent.slice(0, indent.length - unit.length);
  if (indent.endsWith("\t")) return indent.slice(0, -1);
  return indent.slice(0, Math.max(0, indent.length - unit.length));
}

/* ------------------------------------------------------------------------------------------ */
/* Backspace                                                                                    */
/* ------------------------------------------------------------------------------------------ */

function deleteEmptyPair(range: Range, profile: LanguageProfile): Edit | null {
  const { text, start: caret } = range;
  if (range.start !== range.end || caret === 0) return null;

  const prev = text[caret - 1];
  const next = text[caret];
  const isPair =
    profile.pairs.some(([open, close]) => open === prev && close === next) ||
    (prev !== undefined && prev === next && profile.quotes.includes(prev));
  if (!isPair) return unindent(range, profile);

  return { from: caret - 1, to: caret + 1, insert: "", selectionStart: caret - 1, selectionEnd: caret - 1 };
}

/**
 * IntelliJ's and PyCharm's smart Backspace: with only indentation before the caret, Backspace
 * takes the line back one whole indent level (to the previous multiple of the unit, or one tab)
 * instead of one space. Anywhere else it is the browser's Backspace.
 */
function unindent(range: Range, profile: LanguageProfile): Edit | null {
  const { text, start: caret } = range;
  const lineStart = lineStartAt(text, caret);
  const before = text.slice(lineStart, caret);
  if (before === "" || before.trim() !== "") return null;
  if (before.endsWith("\t")) return null;
  const unit = profile.indentUnit.length;
  const trailingSpaces = /[ ]*$/.exec(before)?.[0].length ?? 0;
  const remove = Math.min(trailingSpaces, ((before.length - 1) % unit) + 1);
  if (remove <= 1) return null;
  return { from: caret - remove, to: caret, insert: "", selectionStart: caret - remove, selectionEnd: caret - remove };
}

/* ------------------------------------------------------------------------------------------ */
/* Enter                                                                                        */
/* ------------------------------------------------------------------------------------------ */

function handleEnter(range: Range, profile: LanguageProfile, startNewLine: boolean): Edit {
  if (startNewLine) {
    const lineEnd = lineEndAt(range.text, range.end);
    return handleEnter({ text: range.text, start: lineEnd, end: lineEnd }, profile, false);
  }

  const { text, start, end } = range;
  const lineStart = lineStartAt(text, start);
  const lineBefore = text.slice(lineStart, start);
  const indent = leadingSpace(lineBefore);
  const kept = lineBefore.replace(TRAILING_INLINE_SPACE, "");
  const afterLine = text.slice(end, lineEndAt(text, end));
  const spaceAfter = leadingSpace(afterLine).length;
  const rest = afterLine.slice(spaceAfter);

  const from = lineStart + kept.length;
  const to = end + spaceAfter;
  const shape = enterShape(text, start, end, { lineStart, lineBefore, indent, kept, rest }, profile);
  const caret = from + shape.caret;
  return { from, to: to + (shape.consume ?? 0), insert: shape.insert, selectionStart: caret, selectionEnd: caret };
}

interface EnterContext {
  readonly lineStart: number;
  readonly lineBefore: string;
  readonly indent: string;
  /** The line before the caret with its trailing whitespace removed. */
  readonly kept: string;
  /** The rest of the caret's line after the caret, its leading whitespace removed. */
  readonly rest: string;
}

/** What Enter inserts, with the caret as an offset into that insert. */
interface EnterShape {
  readonly insert: string;
  readonly caret: number;
  /** Characters after the caret's trailing space that the insert replaces (a "}" rewritten as "};"). */
  readonly consume?: number;
}

/**
 * A C++ struct, class, union or enum header, whose closing brace needs a ";" after it. CLion
 * writes `};` for these, and a bare `}` is the "expected ';' after struct definition" error.
 */
const CPP_AGGREGATE = /^\s*(?:typedef\s+)?(?:template\s*<[^>]*>\s*)?(?:struct|class|union|enum)\b[^;()=]*\{$/;

/**
 * A control statement with no brace: `if (a)`, `else`, `for (...)`, `while (...)`, `else if (...)`
 * and `do`. IntelliJ and CLion indent the single statement under it one level.
 */
function isBracelessHeader(code: string): boolean {
  const line = code.trim().replace(/^\}\s*/, "");
  if (line === "else" || line === "do") return true;
  const head = /^(?:else\s+)?(?:if|for|while)\s*\(/.exec(line);
  if (head === null || !line.endsWith(")")) return false;
  const open = head[0].length - 1;
  return matchingClose(line, open) === line.length - 1;
}

/** Index of the ")" that closes the "(" at `open`, or -1. Ignores parentheses inside quotes. */
function matchingClose(line: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < line.length; i += 1) {
    const ch = line[i];
    if (quote !== null) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** The code line above the one starting at `lineStart`, skipping blank lines, or null. */
function codeLineAbove(text: string, lineStart: number): string | null {
  let end = lineStart - 1;
  while (end >= 0) {
    const start = lineStartAt(text, end);
    const line = text.slice(start, end);
    if (line.trim() !== "") return line;
    end = start - 1;
  }
  return null;
}

function enterShape(
  text: string,
  start: number,
  end: number,
  ctx: EnterContext,
  profile: LanguageProfile,
): EnterShape {
  const brace = BRACE_LANGUAGES.has(profile.id);
  if (brace && insideBlockComment(text, start, profile)) return commentContinuation(text, end, ctx);

  // A line indented with tabs keeps tabs, so Enter never mixes a tab with four spaces.
  const unit = ctx.indent.includes("\t") ? "\t" : profile.indentUnit;
  const prev = ctx.kept[ctx.kept.length - 1];
  const next = ctx.rest[0];
  const aggregate = profile.id === "cpp" && CPP_AGGREGATE.test(ctx.kept);

  if (profile.pairs.some(([open, close]) => open === prev && close === next)) {
    if (brace && prev !== "{") {
      // IntelliJ's Enter in `println(|)`: the ")" follows the caret onto a continuation line.
      const insert = `\n${ctx.indent}${unit}${unit}`;
      return { insert, caret: insert.length };
    }
    if (aggregate && ctx.rest[1] !== ";") return { ...splitPair(ctx.indent, unit, "};", true), consume: 1 };
    return splitPair(ctx.indent, unit, next ?? "");
  }

  if (brace && prev === "{" && ctx.rest === "" && braceDebt(text, profile) > 0) {
    // IntelliJ's "insert pair }": an Enter after an unbalanced "{" writes the closing brace.
    return splitPair(ctx.indent, unit, aggregate ? "};" : "}", true);
  }

  const insert = `\n${nextLineIndent(text, ctx, profile, unit)}`;
  return { insert, caret: insert.length };
}

/** The indent of a plain new line: one more after a block opener, one less after a block ends. */
function nextLineIndent(text: string, ctx: EnterContext, profile: LanguageProfile, unit: string): string {
  if (profile.opensBlock(ctx.lineBefore)) return ctx.indent + unit;
  if (profile.closesBlock?.(ctx.lineBefore) === true) return removeOneIndent(ctx.indent, unit);
  if (!BRACE_LANGUAGES.has(profile.id)) return ctx.indent;

  const code = ctx.kept.trim();
  if (isBracelessHeader(code)) return ctx.indent + unit;
  // The one statement under a braceless header is done, so the next line goes back to the header.
  const above = codeLineAbove(text, ctx.lineStart);
  if (above !== null && code !== "" && !code.endsWith("{") && isBracelessHeader(above)) {
    const headerIndent = leadingSpace(above);
    if (ctx.indent.length > headerIndent.length) return headerIndent;
  }
  return ctx.indent;
}

/**
 * The three-line split of `{|}`. The closer already sits after the caret and stays where it is,
 * unless `writeCloser` says to write it here because the text never had one.
 */
function splitPair(indent: string, unit: string, closer: string, writeCloser = false): EnterShape {
  const middle = `\n${indent}${unit}`;
  const insert = `${middle}\n${indent}${writeCloser ? closer : ""}`;
  return { insert, caret: middle.length };
}

function commentContinuation(text: string, end: number, ctx: EnterContext): EnterShape {
  const trimmed = ctx.lineBefore.trimStart();
  if (trimmed.startsWith("/*")) {
    const middle = `\n${ctx.indent} * `;
    const close = ctx.rest === "" && !commentClosesAfter(text, end) ? `\n${ctx.indent} */` : "";
    return { insert: middle + close, caret: middle.length };
  }
  const insert = trimmed.startsWith("*") ? `\n${ctx.indent}* ` : `\n${ctx.indent}`;
  return { insert, caret: insert.length };
}

/**
 * Whether `caret` sits inside a block comment. The code is scanned the way the compiler reads it,
 * so a "/*" inside a string (`"src/*.java"`) or after "//" opens nothing.
 */
function insideBlockComment(text: string, caret: number, profile: LanguageProfile): boolean {
  let i = 0;
  while (i < caret) {
    if (text.startsWith(profile.lineComment, i)) {
      i = lineEndAt(text, i);
    } else if (text.startsWith("/*", i)) {
      if (i + 2 > caret) return false;
      const close = text.indexOf("*/", i + 2);
      if (close === -1 || close + 2 > caret) return true;
      i = close + 2;
    } else if (profile.quotes.includes(text[i] ?? "")) {
      i = skipString(text, i, text[i] ?? "");
    } else {
      i += 1;
    }
  }
  return false;
}

/** Whether a "*" + "/" closes the comment before any later comment opens. */
function commentClosesAfter(text: string, from: number): boolean {
  const close = text.indexOf("*/", from);
  const nextOpen = text.indexOf("/*", from);
  return close !== -1 && (nextOpen === -1 || close < nextOpen);
}

/** How many more "{" than "}" the code holds, strings and comments excluded. */
function braceDebt(text: string, profile: LanguageProfile): number {
  let debt = 0;
  scanCode(text, text.length, profile, (ch) => {
    if (ch === "{") debt += 1;
    else if (ch === "}") debt -= 1;
  });
  return debt;
}

/* ------------------------------------------------------------------------------------------ */
/* Mod+/                                                                                        */
/* ------------------------------------------------------------------------------------------ */

/** One line's change: `removed` characters at `col` replaced by `inserted` characters. */
interface LineChange {
  readonly col: number;
  readonly removed: number;
  readonly inserted: string;
}

/**
 * IntelliJ writes "//" at column 0 with no space (its Java and CLion default), PyCharm writes
 * "# " at column 0 (PEP 8). Uncommenting removes exactly what commenting would have added, so a
 * toggle twice is the identity and an indented line never loses a space of its indent.
 */
function commentPrefix(profile: LanguageProfile): string {
  return profile.lineComment === "#" ? "# " : profile.lineComment;
}

function toggleLineComment(range: Range, profile: LanguageProfile): Edit {
  const { text, start, end } = range;
  const span = selectedLines(range);
  const lines = text.slice(span.start, span.end).split("\n");
  const marker = profile.lineComment;
  const prefix = commentPrefix(profile);

  const filled = lines.filter((line) => line.trim() !== "");
  const isCommented = (line: string) => line.trimStart().startsWith(marker);
  const comment = filled.length === 0 || filled.some((line) => !isCommented(line));

  const changes = lines.map((line): LineChange => {
    if (comment) {
      const skip = filled.length > 0 && line.trim() === "";
      return { col: 0, removed: 0, inserted: skip ? "" : prefix };
    }
    const col = leadingSpace(line).length;
    if (!isCommented(line)) return { col, removed: 0, inserted: "" };
    const removed = line.startsWith(prefix, col) ? prefix.length : marker.length;
    return { col, removed, inserted: "" };
  });

  const block = lines
    .map((line, i) => {
      const change = changes[i] ?? { col: 0, removed: 0, inserted: "" };
      return line.slice(0, change.col) + change.inserted + line.slice(change.col + change.removed);
    })
    .join("\n");

  const map = (pos: number, stickLeft: boolean) => mapThroughLines(text, span, changes, block, pos, stickLeft);
  const [selectionStart, selectionEnd] =
    start === end ? caretAfterComment(text, span, block, start, map) : [map(start, true), map(end, false)];
  return { from: span.start, to: span.end, insert: block, selectionStart, selectionEnd };
}

/** With no selection IntelliJ moves the caret down a line, keeping its column, after toggling. */
function caretAfterComment(
  text: string,
  span: LineSpan,
  block: string,
  caret: number,
  map: (pos: number, stickLeft: boolean) => number,
): [number, number] {
  if (span.end >= text.length) {
    const mapped = map(caret, false);
    return [mapped, mapped];
  }
  const nextStart = span.end + 1;
  const nextLength = lineEndAt(text, nextStart) - nextStart;
  const column = Math.min(caret - span.start, nextLength);
  const landed = span.start + block.length + 1 + column;
  return [landed, landed];
}

function mapThroughLines(
  text: string,
  span: LineSpan,
  changes: readonly LineChange[],
  block: string,
  pos: number,
  stickLeft: boolean,
): number {
  if (pos > span.end) return pos + block.length - (span.end - span.start);
  const before = text.slice(span.start, pos).split("\n");
  const index = before.length - 1;
  const column = before[index]?.length ?? 0;

  const oldLines = text.slice(span.start, span.end).split("\n");
  const newLineStart = changes.slice(0, index).reduce((offset, change, i) => {
    const oldLength = (oldLines[i] ?? "").length;
    return offset + oldLength - change.removed + change.inserted.length + 1;
  }, span.start);

  const change = changes[index] ?? { col: 0, removed: 0, inserted: "" };
  return newLineStart + mapColumn(column, change, stickLeft);
}

function mapColumn(column: number, change: LineChange, stickLeft: boolean): number {
  if (column < change.col) return column;
  if (column === change.col && change.removed === 0 && stickLeft) return column;
  if (column >= change.col + change.removed) return column - change.removed + change.inserted.length;
  return change.col + change.inserted.length;
}

/* ------------------------------------------------------------------------------------------ */
/* Mod+D and Alt+Shift+Up/Down                                                                  */
/* ------------------------------------------------------------------------------------------ */

function duplicate(range: Range): Edit {
  const { text, start, end } = range;
  if (start !== end) {
    const copy = text.slice(start, end);
    return { from: end, to: end, insert: copy, selectionStart: end, selectionEnd: end + copy.length };
  }
  const lineStart = lineStartAt(text, start);
  const lineEnd = lineEndAt(text, start);
  const caret = lineEnd + 1 + (start - lineStart);
  return {
    from: lineEnd,
    to: lineEnd,
    insert: `\n${text.slice(lineStart, lineEnd)}`,
    selectionStart: caret,
    selectionEnd: caret,
  };
}

/**
 * Swaps the selected lines with the line above or below. At the top or bottom of the file there
 * is nothing to swap with, and the key is still IntelliJ's, so an edit that changes nothing is
 * returned rather than null: null would hand Alt+Shift+Arrow to the browser, which extends the
 * selection instead.
 */
function moveLines(range: Range, up: boolean): Edit {
  const { text, start, end } = range;
  const span = selectedLines(range);
  const block = text.slice(span.start, span.end);
  const unchanged: Edit = { from: start, to: start, insert: "", selectionStart: start, selectionEnd: end };

  if (up) {
    if (span.start === 0) return unchanged;
    const prevStart = lineStartAt(text, span.start - 1);
    const prevLine = text.slice(prevStart, span.start - 1);
    const shift = -(prevLine.length + 1);
    return shifted(prevStart, span.end, `${block}\n${prevLine}`, range, shift);
  }

  if (span.end >= text.length) return unchanged;
  const nextEnd = lineEndAt(text, span.end + 1);
  const nextLine = text.slice(span.end + 1, nextEnd);
  return shifted(span.start, nextEnd, `${nextLine}\n${block}`, range, nextLine.length + 1);
}

function shifted(from: number, to: number, insert: string, range: Range, shift: number): Edit {
  const length = range.text.length;
  const clamp = (pos: number) => Math.min(Math.max(pos, 0), length);
  return { from, to, insert, selectionStart: clamp(range.start + shift), selectionEnd: clamp(range.end + shift) };
}

/* ------------------------------------------------------------------------------------------ */
/* Tab                                                                                          */
/* ------------------------------------------------------------------------------------------ */

function expandTemplate(range: Range, profile: LanguageProfile): Edit | null {
  const { text, start, end } = range;
  if (start !== end) return null;

  const lineStart = lineStartAt(text, start);
  const lineBefore = text.slice(lineStart, start);
  const word = TRAILING_WORD.exec(lineBefore)?.[0];
  if (word === undefined) return null;
  const wordStart = start - word.length;
  const separator = separatorEndingAt(text, wordStart);
  if (separator === ".") return expandPostfix(range, word, wordStart, profile);
  // `std::fori` or `p->sout` is a member being typed, never a template.
  if (separator !== null) return null;

  const template = profile.templates.find((candidate) => candidate.abbreviation === word);
  if (template === undefined) return null;
  return templateEdit(wordStart, start, template.body, leadingSpace(lineBefore), profile);
}

/**
 * IntelliJ's postfix completion: `x.sout` becomes `System.out.println(x);` and `n.fori` a loop up
 * to n. The expression is the chain of names, calls and indexes before the dot on this line.
 */
function expandPostfix(range: Range, word: string, wordStart: number, profile: LanguageProfile): Edit | null {
  const template = (profile.postfixTemplates ?? []).find((candidate) => candidate.abbreviation === word);
  if (template === undefined) return null;
  const { text, start } = range;
  const lineStart = lineStartAt(text, start);
  const dot = wordStart - 1;
  const exprStart = expressionStart(text, lineStart, dot);
  if (exprStart === null) return null;
  const expression = text.slice(exprStart, dot);
  const indent = leadingSpace(text.slice(lineStart, start));
  return templateEdit(exprStart, start, template.body, indent, profile, expression);
}

function templateEdit(
  from: number,
  to: number,
  body: string,
  indent: string,
  profile: LanguageProfile,
  expression = "",
): Edit {
  // A line indented with tabs keeps tabs, so the body does not mix the two.
  const unit = indent.includes("\t") ? "\t" : profile.indentUnit;
  const rendered = renderTemplate(body, indent, unit, expression);
  const edit: Edit = {
    from,
    to,
    insert: rendered.text,
    selectionStart: from + rendered.selectionStart,
    selectionEnd: from + rendered.selectionEnd,
  };
  return rendered.tabStops.length === 0 ? edit : { ...edit, tabStops: shiftStops(rendered.tabStops, from) };
}

/** The member separator ("." "::" "->") that ends exactly at `at`, if any. */
function separatorEndingAt(text: string, at: number): string | null {
  if (text.slice(Math.max(0, at - 2), at) === "::") return "::";
  if (text.slice(Math.max(0, at - 2), at) === "->") return "->";
  if (text[at - 1] === ".") return ".";
  return null;
}

/**
 * Start of the expression that ends at `end` (a dot), within the line starting at `lineStart`:
 * names joined by "." with call arguments and indexes as links, as in `a.b(c)[i]`. Null when
 * there is no such expression, or when it is a number, so `3.fori` is not a loop.
 */
function expressionStart(text: string, lineStart: number, end: number): number | null {
  let i = end;
  for (;;) {
    const linkEnd = i;
    while (i > lineStart && (text[i - 1] === ")" || text[i - 1] === "]")) {
      const open = groupStart(text, lineStart, i - 1);
      if (open === null) return null;
      i = open;
    }
    while (i > lineStart && isWordChar(text[i - 1])) i -= 1;
    if (i === linkEnd) return null;
    if (/[0-9]/.test(text[i] ?? "")) return null;
    if (i > lineStart && text[i - 1] === ".") i -= 1;
    else return i;
  }
}

/** Index of the opener matching the closer at `close`, scanning no further back than `lineStart`. */
function groupStart(text: string, lineStart: number, close: number): number | null {
  const closer = text[close];
  const opener = closer === ")" ? "(" : "[";
  let depth = 0;
  for (let i = close; i >= lineStart; i -= 1) {
    if (text[i] === closer) depth += 1;
    else if (text[i] === opener) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return null;
}
/* ------------------------------------------------------------------------------------------ */
/* Text helpers                                                                                 */
/* ------------------------------------------------------------------------------------------ */

function normalise(state: EditState): Range {
  const clamp = (pos: number) => Math.min(Math.max(pos, 0), state.text.length);
  const a = clamp(state.selectionStart);
  const b = clamp(state.selectionEnd);
  return { text: state.text, start: Math.min(a, b), end: Math.max(a, b) };
}

function caretOnly(at: number, caret: number): Edit {
  return { from: at, to: at, insert: "", selectionStart: caret, selectionEnd: caret };
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && WORD_CHAR.test(ch);
}

function leadingSpace(line: string): string {
  return LEADING_INLINE_SPACE.exec(line)?.[0] ?? "";
}

function lineStartAt(text: string, pos: number): number {
  return pos <= 0 ? 0 : text.lastIndexOf("\n", pos - 1) + 1;
}

function lineEndAt(text: string, pos: number): number {
  const newline = text.indexOf("\n", pos);
  return newline === -1 ? text.length : newline;
}

/**
 * The lines a selection covers. A selection that ends at column 0 of a line does not include that
 * line, as in IntelliJ: selecting two whole lines by dragging to the start of the third must not
 * comment or move the third.
 */
function selectedLines(range: Range): LineSpan {
  const { text, start, end } = range;
  const last = end > start && lineStartAt(text, end) === end ? end - 1 : end;
  return { start: lineStartAt(text, start), end: lineEndAt(text, last) };
}

/**
 * Walks the code in [0, end) and reports every character outside strings and comments. Strings
 * stop at an unescaped matching quote or, if unterminated, at the end of their line; a tripled
 * quote is a multi-line string (a Python docstring or a Java text block).
 */
function scanCode(
  text: string,
  end: number,
  profile: LanguageProfile,
  visit: (ch: string, pos: number) => void,
): void {
  const blockComments = BRACE_LANGUAGES.has(profile.id);
  let i = 0;
  while (i < end) {
    if (text.startsWith(profile.lineComment, i)) {
      i = lineEndAt(text, i);
    } else if (blockComments && text.startsWith("/*", i)) {
      const close = text.indexOf("*/", i + 2);
      i = close === -1 ? end : close + 2;
    } else if (profile.quotes.includes(text[i] ?? "")) {
      i = skipString(text, i, text[i] ?? "");
    } else {
      visit(text[i] ?? "", i);
      i += 1;
    }
  }
}

function skipString(text: string, at: number, quote: string): number {
  const triple = quote.repeat(3);
  if (text.startsWith(triple, at)) {
    const close = text.indexOf(triple, at + 3);
    return close === -1 ? text.length : close + 3;
  }
  let i = at + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") i += 2;
    else if (ch === quote) return i + 1;
    else if (ch === "\n") return i;
    else i += 1;
  }
  return text.length;
}

/** The position of the innermost "open" still unclosed at `end`, or null when there is none. */
function findUnmatchedOpener(
  text: string,
  end: number,
  open: string,
  profile: LanguageProfile,
): number | null {
  const opens = new Map(profile.pairs.map(([o, c]) => [o, c] as const));
  const closes = new Map(profile.pairs.map(([o, c]) => [c, o] as const));
  let stack: readonly { readonly ch: string; readonly pos: number }[] = [];

  scanCode(text, end, profile, (ch, pos) => {
    if (opens.has(ch)) {
      stack = [...stack, { ch, pos }];
      return;
    }
    const opener = closes.get(ch);
    if (opener === undefined) return;
    // A mismatched closer discards everything above its own opener, which is how a missing ")"
    // inside a block stops poisoning the "}" that ends the block.
    const match = stack.map((entry) => entry.ch).lastIndexOf(opener);
    if (match !== -1) stack = stack.slice(0, match);
  });

  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const entry = stack[i];
    if (entry !== undefined && entry.ch === open) return entry.pos;
  }
  return null;
}
