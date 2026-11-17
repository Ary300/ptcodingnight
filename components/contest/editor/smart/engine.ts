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
 *   Backspace  between an empty pair deletes both halves.
 *   Enter      keeps the indent, adds one level after a block opener, splits "{|}" onto three
 *              lines, strips the trailing whitespace it leaves behind, and continues a "/** ... *"
 *              comment. Shift+Enter is IntelliJ's "Start New Line": Enter from the end of the line.
 *   Mod+/      toggles a line comment on every selected line.
 *   Mod+D      duplicates the line, or the selection.
 *   Alt+Shift+Up/Down  moves the line, or every selected line.
 *   Tab        expands a live template whose abbreviation ends at the caret, and otherwise returns
 *              null so the surface keeps its own block indent.
 *
 * Mod is Cmd on a Mac and Ctrl everywhere else. IME composition never reaches this function; the
 * surface filters it out first.
 */

import type { Edit, EditState, KeyInput, LanguageProfile, LiveTemplate } from "./types";

/** Java identifiers allow `$`, so it counts as a word character for pairing and templates. */
const WORD_CHAR = /[A-Za-z0-9_$]/;
const TRAILING_WORD = /[A-Za-z0-9_$]+$/;
const LEADING_INLINE_SPACE = /^[ \t]*/;
const TRAILING_INLINE_SPACE = /[ \t]+$/;
const END_MARKER = "$END$";

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
  return null;
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

  if (next === quote) return caretOnly(caret, caret + 1);
  if (prev === "\\" || isWordChar(next)) return null;
  if (isWordChar(prev) && !followsStringPrefix(text, caret, profile)) return null;

  // `""|` plus a third quote opens a Python docstring or a Java text block: `"""|"""`.
  const opensTriple = caret >= 2 && text.slice(caret - 2, caret) === quote + quote && text[caret - 3] !== quote;
  const insert = opensTriple ? quote.repeat(4) : quote + quote;
  return { from: caret, to: caret, insert, selectionStart: caret + 1, selectionEnd: caret + 1 };
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
  if (!isPair) return null;

  return { from: caret - 1, to: caret + 1, insert: "", selectionStart: caret - 1, selectionEnd: caret - 1 };
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
  const shape = enterShape(text, start, end, { lineBefore, indent, kept, rest }, profile);
  const caret = from + shape.caret;
  return { from, to, insert: shape.insert, selectionStart: caret, selectionEnd: caret };
}

interface EnterContext {
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
}

function enterShape(
  text: string,
  start: number,
  end: number,
  ctx: EnterContext,
  profile: LanguageProfile,
): EnterShape {
  const brace = BRACE_LANGUAGES.has(profile.id);
  if (brace && insideBlockComment(text, start)) return commentContinuation(text, end, ctx);

  const unit = profile.indentUnit;
  const prev = ctx.kept[ctx.kept.length - 1];
  const next = ctx.rest[0];
  if (profile.pairs.some(([open, close]) => open === prev && close === next)) {
    return splitPair(ctx.indent, unit, next ?? "");
  }

  if (brace && prev === "{" && ctx.rest === "" && braceDebt(text, profile) > 0) {
    // IntelliJ's "insert pair }": an Enter after an unbalanced "{" writes the closing brace.
    return splitPair(ctx.indent, unit, "}", true);
  }

  const insert = `\n${ctx.indent}${profile.opensBlock(ctx.lineBefore) ? unit : ""}`;
  return { insert, caret: insert.length };
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

function insideBlockComment(text: string, caret: number): boolean {
  const open = text.lastIndexOf("/*", caret - 2);
  if (open === -1) return false;
  const close = text.lastIndexOf("*/", caret - 2);
  return close < open + 2;
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

  const lineBefore = text.slice(lineStartAt(text, start), start);
  const word = TRAILING_WORD.exec(lineBefore)?.[0];
  if (word === undefined) return null;
  const template = profile.templates.find((candidate) => candidate.abbreviation === word);
  if (template === undefined) return null;

  const from = start - word.length;
  const { body, caret } = renderTemplate(template, leadingSpace(lineBefore), profile.indentUnit);
  return { from, to: start, insert: body, selectionStart: from + caret, selectionEnd: from + caret };
}

/**
 * The template body with every continuation line indented to the line it was typed on, leading
 * tabs in the body widened to the profile's indent unit, and the $END$ marker turned into the
 * caret offset (the end of the body when there is no marker).
 */
function renderTemplate(template: LiveTemplate, indent: string, unit: string): { body: string; caret: number } {
  const lines = template.body.split("\n").map((line, i) => {
    if (i === 0 || line === "") return line;
    return indent + line.replace(/^\t+/, (tabs) => unit.repeat(tabs.length));
  });
  const joined = lines.join("\n");
  const marker = joined.indexOf(END_MARKER);
  const body = joined.split(END_MARKER).join("");
  return { body, caret: marker === -1 ? body.length : marker };
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
