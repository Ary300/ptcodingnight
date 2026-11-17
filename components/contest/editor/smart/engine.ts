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
 *   Mod+Shift+Up/Down  moves the statement or whole block (move-statement.ts).
 *   Mod+Alt+Enter  starts a new line above. Mod+Shift+/ (Cmd+Option+/ on a Mac) block comment.
 *   Alt+Up/Down (Mac), Alt+Shift+Right/Left (elsewhere)  extend and shrink the selection.
 *   Ctrl+Shift+J joins lines, Mod+Shift+U toggles case, Ctrl+M (Mac) or Ctrl+Shift+M jumps to
 *              the matching bracket, Home is smart Home, Alt (Mac) or Ctrl + Backspace/Delete
 *              deletes to the word start or end.
 *   "<"        pairs after a type name (angle.ts), never in a comparison.
 *   Tab        expands a live template whose abbreviation ends at the caret (a postfix template
 *              after a dot, as in `n.fori`) where its context allows (template-context.ts), steps
 *              out of a closer that ends the line, and otherwise returns null so the surface
 *              keeps its own block indent. A template with fields carries `tabStops`, which the surface
 *              walks with template-session.ts.
 *
 * Mod is Cmd on a Mac and Ctrl everywhere else. IME composition never reaches this function; the
 * surface filters it out first.
 */

import { hasOpenAngle, opensAngle } from "./angle";
import { toggleBlockComment } from "./block-comment";
import {
  deleteWordBackward,
  deleteWordForward,
  joinLines,
  jumpOutOfCloser,
  moveToBrace,
  smartHome,
  startNewLineBefore,
  toggleCase,
} from "./line-edits";
import { moveStatement } from "./move-statement";
import { reindentLines } from "./reindent";
import { isInside, regionAt, regions, scanCode, skipString, type Region } from "./scan";
import { extendSelection, shrinkSelection } from "./selection";
import { renderTemplate, templateParts } from "./template";
import { resolveMacros } from "./template-macros";
import { templateFits } from "./template-context";
import {
  BRACE_LANGUAGES,
  caretOnly,
  isWordChar,
  leadingSpace,
  lineEndAt,
  lineStartAt,
  normalise,
  removeOneIndent,
  selectedLines,
  selectOnly,
  type LineSpan,
  type Range,
} from "./text";
import type { Edit, EditState, KeyInput, LanguageProfile, LiveTemplate } from "./types";

const TRAILING_WORD = /[A-Za-z0-9_$]+$/;
const TRAILING_INLINE_SPACE = /[ \t]+$/;

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

/* ------------------------------------------------------------------------------------------ */
/* Entry point                                                                                  */
/* ------------------------------------------------------------------------------------------ */

export function handleKey(state: EditState, input: KeyInput, profile: LanguageProfile): Edit | null {
  const range = normalise(state);
  const mod = input.isMac ? input.metaKey : input.ctrlKey;
  // Windows and Linux report AltGr as Ctrl+Alt, and that is how many layouts type "{" and "[".
  const altGr = !input.isMac && input.ctrlKey && input.altKey && !input.metaKey;

  // Ctrl+Alt+L and Ctrl+Alt+I are Reformat and Auto-Indent off a Mac. An AltGr layout that types a
  // character on those keys reports that character, never the plain letter, so it still types.
  const reformat = reformatKey(input);
  if (reformat !== null) return reindentLines(state, profile, reformat === "file");
  if (altGr && input.key.length === 1) return handleTyped(range, input.key, profile);
  if (mod) return input.altKey ? handleModAltKey(range, input, profile) : handleModKey(state, range, input, profile);
  if (input.isMac && input.ctrlKey && !input.metaKey) return handleMacCtrlKey(range, input, profile);
  if (input.ctrlKey || input.metaKey) return null;
  if (input.altKey) return handleAltKey(state, range, input, profile);

  switch (input.key) {
    case "Enter":
      return handleEnter(range, profile, input.shiftKey);
    case "Backspace":
      return deleteEmptyPair(range, profile);
    case "Tab":
      return input.shiftKey ? null : (expandTemplate(range, profile) ?? tabOutOfPair(range, input, profile));
    case "Home":
      return smartHome(state, range, input.shiftKey);
    case "End":
      return input.shiftKey ? null : smartEnd(range, profile);
    default:
      return input.key.length === 1 ? handleTyped(range, input.key, profile) : null;
  }
}

/**
 * IntelliJ's Reformat Code (Cmd+Option+L, Ctrl+Alt+L) and Auto-Indent Lines (Ctrl+Option+I,
 * Ctrl+Alt+I). On a Mac, Option turns the letter into a symbol, so the chord matches on `code`.
 * Cmd+Option+L is Chrome's Downloads page on a Mac, so taking it also keeps the student here.
 */
function reformatKey(input: KeyInput): "file" | "lines" | null {
  if (!input.altKey || input.shiftKey) return null;
  const letter = input.code === undefined ? input.key.toLowerCase() : input.code.replace(/^Key/, "").toLowerCase();
  const plain = input.isMac || input.key.toLowerCase() === letter;
  if (!plain) return null;
  if (input.isMac) {
    if (input.metaKey && !input.ctrlKey && letter === "l") return "file";
    if (input.ctrlKey && !input.metaKey && letter === "i") return "lines";
    return null;
  }
  if (!input.ctrlKey || input.metaKey) return null;
  if (letter === "l") return "file";
  if (letter === "i") return "lines";
  return null;
}

/**
 * Whether the physical key is "/". On a Mac, Option turns `key` into a symbol ("÷"), so the
 * chord is matched on `code` when the surface passes it, and on the symbols otherwise.
 */
function isSlashKey(input: KeyInput): boolean {
  if (input.code !== undefined) return input.code === "Slash";
  return input.key === "/" || input.key === "?" || input.key === "÷";
}

/** Alt (Option) with no Ctrl or Cmd. Matched by name, never by the symbol Option types. */
function handleAltKey(state: EditState, range: Range, input: KeyInput, profile: LanguageProfile): Edit | null {
  switch (input.key) {
    case "ArrowUp":
    case "ArrowDown": {
      const up = input.key === "ArrowUp";
      if (input.shiftKey) return moveLines(range, up);
      // Extend and Shrink Selection are Option+Up and Option+Down in IntelliJ's macOS keymap.
      return input.isMac ? resizeSelection(state, profile, up) : null;
    }
    case "ArrowRight":
    case "ArrowLeft":
      // Ctrl+W cannot be taken from a browser, so elsewhere Alt+Shift+Right / Left (as VS Code).
      return !input.isMac && input.shiftKey ? resizeSelection(state, profile, input.key === "ArrowRight") : null;
    case "Backspace":
      return input.isMac ? deleteWordBackward(range) : null;
    case "Delete":
      return input.isMac ? deleteWordForward(range) : null;
    default:
      // Mac layouts type some brackets with Option (Option+5 is "[" on a German Mac).
      return input.key.length === 1 ? handleTyped(range, input.key, profile) : null;
  }
}

function resizeSelection(state: EditState, profile: LanguageProfile, grow: boolean): Edit {
  const range = normalise(state);
  const next = grow ? extendSelection(state, profile) : shrinkSelection(state, profile);
  // At the whole file (or a caret) the key is still ours: nothing changes, nothing scrolls.
  return next === null ? selectOnly(range.start, range.end) : selectOnly(next.start, next.end);
}

function handleModKey(state: EditState, range: Range, input: KeyInput, profile: LanguageProfile): Edit | null {
  // "/" is Shift+7 on several European layouts, so Shift is not held against it.
  if (input.key === "/") return toggleLineComment(range, profile);
  // Ctrl+Shift+/ is the block comment (the key reads "?" on a US layout).
  if (input.shiftKey && isSlashKey(input)) return toggleBlockComment(range, profile);
  // Mod+Shift+Enter is Complete Current Statement. Plain Mod+Enter is the surface's submit key.
  if (input.key === "Enter") return input.shiftKey ? completeStatement(range, profile) : null;
  const letter = input.key.toLowerCase();

  if (input.shiftKey) {
    if (input.key === "ArrowUp" || input.key === "ArrowDown") return moveStatement(state, profile, input.key === "ArrowUp");
    if (letter === "u") return toggleCase(range);
    if (letter === "j") return joinLines(range);
    if (letter === "m" && !input.isMac) return moveToBrace(range, profile);
  }
  // Cmd+Left and Cmd+Right are a Mac's Home and End.
  if (input.isMac && input.key === "ArrowLeft") return smartHome(state, range, input.shiftKey);
  if (input.isMac && input.key === "ArrowRight") return input.shiftKey ? null : smartEnd(range, profile);
  if (input.shiftKey) return null;

  if (letter === "d") return duplicate(range);
  // IntelliJ's Delete Line: Cmd+Backspace on a Mac, Ctrl+Y everywhere else.
  if (input.isMac ? input.key === "Backspace" : letter === "y") return deleteLines(range);
  // Delete to Word Start / End is Ctrl+Backspace / Ctrl+Delete off a Mac.
  if (!input.isMac && input.key === "Backspace") return deleteWordBackward(range);
  if (!input.isMac && input.key === "Delete") return deleteWordForward(range);
  return null;
}

/** Mod+Alt (Cmd+Option on a Mac, Ctrl+Alt elsewhere) chords, matched on `code` for the symbol keys. */
function handleModAltKey(range: Range, input: KeyInput, profile: LanguageProfile): Edit | null {
  if (input.key === "Enter" && !input.shiftKey) return startNewLineBefore(range, profile);
  // Cmd+Option+/ is the Mac's block comment.
  if (input.isMac && isSlashKey(input)) return toggleBlockComment(range, profile);
  return null;
}

/** Ctrl on a Mac, where Cmd is the IntelliJ modifier: Join Lines and Move Caret to Matching Brace. */
function handleMacCtrlKey(range: Range, input: KeyInput, profile: LanguageProfile): Edit | null {
  if (input.altKey) return null;
  const letter = input.code === undefined ? input.key.toLowerCase() : input.code.replace(/^Key/, "").toLowerCase();
  if (input.shiftKey && letter === "j") return joinLines(range);
  if (!input.shiftKey && letter === "m") return moveToBrace(range, profile);
  return null;
}

/**
 * End on a blank line goes to the indent the line should have (the indent Enter would give it
 * from the line above), as IntelliJ's virtual space does. On a line with code End is the browser's.
 */
function smartEnd(range: Range, profile: LanguageProfile): Edit | null {
  const { text, start, end } = range;
  if (start !== end) return null;
  const lineStart = lineStartAt(text, start);
  const lineEnd = lineEndAt(text, start);
  const line = text.slice(lineStart, lineEnd);
  if (line.trim() !== "" || lineStart === 0) return null;
  const fromAbove = handleEnter({ text, start: lineStart - 1, end: lineStart - 1 }, profile, false);
  const placed = fromAbove.insert.slice(0, fromAbove.selectionStart - fromAbove.from);
  const proper = placed.slice(placed.lastIndexOf("\n") + 1);
  if (proper.length <= line.length) return null;
  const caret = lineStart + proper.length;
  return { from: lineStart, to: lineEnd, insert: proper, selectionStart: caret, selectionEnd: caret };
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
    // A header opens its indented body; a plain statement moves to a new line, as IntelliJ's does.
    const below = header ? indent + unit : indent;
    const insert = `${completed}\n${below}`;
    return replace(insert, insert.length);
  }

  const opensBody =
    trimmed.endsWith("{") ||
    TYPE_HEADER.test(trimmed) ||
    BRACE_BARE_CONTROL.has(trimmed) ||
    (BRACE_CONTROL.test(trimmed) && trimmed.endsWith(")")) ||
    isMethodSignature(trimmed, braceDepthBefore(text, lineStart, profile), profile);
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
  // The statement is finished, so the caret goes on to a new line below it.
  return replace(`${completed}\n${indent}`, completed.length + 1 + indent.length);
}

/** `struct P`, `class Node`, `enum Color`: a type with no body yet, which Complete Statement opens. */
const TYPE_HEADER = /^(?:(?:public|private|protected|static|final|abstract)\s+)*(?:struct|class|union|enum|interface|record)\s+[A-Za-z_$][\w$]*(?:\s+(?:extends|implements)\s+[\w$.<>, ]+)?$/;

/**
 * `void f(int a)` or `static int gcd(int a, int b) throws X`: a declaration whose body Complete
 * Current Statement opens instead of ending it with ";". Only where a method can be declared:
 * directly in a Java class, or outside every block in C++.
 */
const SIGNATURE = /^(?:[\w$]+(?:<[^;=]*>)?(?:\[\])*[\s*&]+)+[\w$:~]+\s*\([^;=]*\)(?:\s*const)?(?:\s*throws\s+[\w$.,\s]+)?$/;
const NOT_A_TYPE = /^(?:return|new|throw|else|case|do|delete|goto)\b/;

function isMethodSignature(code: string, depth: number, profile: LanguageProfile): boolean {
  const allowed = profile.id === "java" ? depth === 1 : depth === 0;
  return allowed && !NOT_A_TYPE.test(code) && SIGNATURE.test(code);
}

function braceDepthBefore(text: string, end: number, profile: LanguageProfile): number {
  let depth = 0;
  scanCode(text, end, profile, (ch) => {
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
  });
  return depth;
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
  if (ch === "<" || ch === ">") return typeAngle(range, ch, profile);

  const closing = profile.pairs.find(([, close]) => close === ch);
  const pair = profile.pairs.find(([open]) => open === ch);
  // In a string or a comment a bracket is only a character: IntelliJ, PyCharm and CLion neither
  // pair it nor step over one, so `"(" + a + ")"` types exactly as written.
  if ((closing !== undefined || pair !== undefined) && regionAt(text, caret, profile) !== "code") return null;
  // A closer steps over the one after the caret only when that one is this bracket's partner. In
  // `Math.max(a, Math.min(b, c|);` the ")" after the caret closes max, so ")" is typed.
  if (closing !== undefined && next === ch && lineBalance(text, caret, closing, profile) <= 0) {
    return caretOnly(caret, caret + 1);
  }

  if (pair !== undefined) {
    if (isWordChar(next)) return null;
    return { from: caret, to: caret, insert: pair[0] + pair[1], selectionStart: caret + 1, selectionEnd: caret + 1 };
  }

  if (profile.dedentOnType.includes(ch)) return dedentOnType(range, ch, profile);
  if (ch === ":" && profile.alignOnColon !== undefined) return alignClause(range, profile.alignOnColon);
  if (ch === ":" && BRACE_LANGUAGES.has(profile.id)) return alignCaseLabel(range, profile);
  return null;
}

/**
 * "<" after a type name (`List<`, `vector<`, `#include `) types "<>", and ">" in front of that
 * ">" steps over it. Anywhere else, `a < b` or `i<n`, the browser types the character.
 */
function typeAngle(range: Range, ch: string, profile: LanguageProfile): Edit | null {
  const { text, start: caret } = range;
  const lineBefore = text.slice(lineStartAt(text, caret), caret);
  if (regionAt(text, caret, profile) !== "code") return null;
  if (ch === ">") return text[caret] === ">" && hasOpenAngle(lineBefore, profile) ? caretOnly(caret, caret + 1) : null;
  if (isWordChar(text[caret]) || !opensAngle(lineBefore, profile)) return null;
  return { from: caret, to: caret, insert: "<>", selectionStart: caret + 1, selectionEnd: caret + 1 };
}

/**
 * IntelliJ and CLion put a `case X:` or `default:` label one level inside its switch, whatever
 * indent the line had: after `break;` + Enter the line sits with the statements, and the ":" of
 * `default:` snaps it back to the labels.
 */
function alignCaseLabel(range: Range, profile: LanguageProfile): Edit | null {
  const { text, start: caret } = range;
  const lineStart = lineStartAt(text, caret);
  if (text.slice(caret, lineEndAt(text, caret)).trim() !== "") return null;
  const before = text.slice(lineStart, caret);
  if (!/^\s*(?:case\b.*|default\s*)$/.test(before) || before.trimEnd().endsWith(":")) return null;
  const open = findUnmatchedOpener(text, lineStart, "{", profile);
  if (open === null) return null;
  const switchLine = text.slice(lineStartAt(text, open), open);
  if (!/\bswitch\s*\(/.test(switchLine)) return null;
  const switchIndent = leadingSpace(switchLine);
  const unit = switchIndent.includes("\t") ? "\t" : profile.indentUnit;
  const target = switchIndent + unit;
  const indent = leadingSpace(before);
  if (indent === target) return null;
  const insert = `${target}${before.slice(indent.length)}:`;
  const after = lineStart + insert.length;
  return { from: lineStart, to: caret, insert, selectionStart: after, selectionEnd: after };
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
  // A statement at the clause's own indent ends any chance of an opener at that indent above it.
  let sameLevelOpen = true;
  while (end >= 0) {
    const start = lineStartAt(text, end);
    const line = text.slice(start, end);
    end = start - 1;
    const code = line.trim();
    if (code === "" || code.startsWith("#")) continue;
    const indent = leadingSpace(line);
    const first = /^[a-z]+/.exec(code)?.[0];
    const opener = first !== undefined && words.includes(first);
    if (indent.length === width && sameLevelOpen) {
      // `else` typed under an `if` at its own indent already belongs to it, even inside a loop
      // whose for/else it could also continue: PyCharm leaves it there.
      if (opener) return indent;
      sameLevelOpen = false;
      continue;
    }
    if (indent.length >= width) continue;
    return opener ? indent : null;
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

  const region = regionContaining(text, caret, profile);
  // A quote in a comment is prose (`// don't`, `# print the "debug" values`).
  if (region?.kind === "comment") return null;
  if (region?.kind === "string") {
    // The other quote kind is a character of this string, and so is an escaped quote: `"b's"`,
    // `'say "hi"'`, `"a\"b"`, `'\''`. Only the string's own closing delimiter is typed over, one
    // quote at a time, so `"""Return it."""` typed in full ends exactly where it should.
    if (text[region.from] !== quote || escapedAt(text, caret)) return null;
    const closing = region.closed && caret >= region.to - region.openLength && next === quote;
    return closing ? caretOnly(caret, caret + 1) : null;
  }

  // In code, a quote in front of a string's opening quote, as in `f(|"abc")`, types one quote and
  // leaves the existing literal alone, as IntelliJ does.
  if (next === quote) return null;
  if (prev === "\\" || isWordChar(next)) return null;
  if (isWordChar(prev) && !followsStringPrefix(text, caret, profile)) return null;

  // `""|` plus a third quote opens a Python docstring or a Java text block: `"""|"""`.
  const opensTriple = caret >= 2 && text.slice(caret - 2, caret) === quote + quote && text[caret - 3] !== quote;
  const insert = opensTriple ? quote.repeat(4) : quote + quote;
  return { from: caret, to: caret, insert, selectionStart: caret + 1, selectionEnd: caret + 1 };
}

/** The string or comment `pos` sits inside, if any (see `isInside`). */
function regionContaining(text: string, pos: number, profile: LanguageProfile): Region | undefined {
  return regions(text, profile, pos).find((candidate) => isInside(candidate, pos));
}

/** Whether the character at `pos` is escaped: an odd run of backslashes sits right before it. */
function escapedAt(text: string, pos: number): boolean {
  let count = 0;
  for (let i = pos - 1; i >= 0 && text[i] === "\\"; i -= 1) count += 1;
  return count % 2 === 1;
}

/**
 * Openers minus closers of one bracket pair in the code of the caret's line. Positive means the
 * line still owes a closer, so the closer after the caret belongs to an outer call.
 */
function lineBalance(text: string, caret: number, pair: readonly [string, string], profile: LanguageProfile): number {
  const lineStart = lineStartAt(text, caret);
  let balance = 0;
  scanCode(text, lineEndAt(text, caret), profile, (ch, pos) => {
    if (pos < lineStart) return;
    if (ch === pair[0]) balance += 1;
    else if (ch === pair[1]) balance -= 1;
  });
  return balance;
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

/* ------------------------------------------------------------------------------------------ */
/* Backspace                                                                                    */
/* ------------------------------------------------------------------------------------------ */

function deleteEmptyPair(range: Range, profile: LanguageProfile): Edit | null {
  const { text, start: caret } = range;
  if (range.start !== range.end || caret === 0) return null;

  const prev = text[caret - 1];
  const next = text[caret];
  const bracket = profile.pairs.find(([open, close]) => open === prev && close === next);
  const isPair =
    // `Math.abs((|);`: the ")" closes abs, so Backspace takes only the "(".
    (bracket !== undefined && regionAt(text, caret, profile) === "code" && lineBalance(text, caret, bracket, profile) <= 0) ||
    (prev !== undefined && prev === next && profile.quotes.includes(prev)) ||
    (prev === "<" && next === ">" && opensAngle(text.slice(lineStartAt(text, caret), caret - 1), profile));
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
  const split = splitStringLiteral(range, lineBefore, profile);
  if (split !== null) return split;
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

/**
 * IntelliJ's Enter inside a Java string: `"abc|def"` becomes `"abc" +` and, on a continuation line,
 * `"def"`, so the literal never breaks across a line. Not after a backslash (that would cut an
 * escape in half) and not in a text block, where a newline is legal.
 */
function splitStringLiteral(range: Range, lineBefore: string, profile: LanguageProfile): Edit | null {
  const { text, start, end } = range;
  if (profile.id !== "java" || start !== end || text[start - 1] === "\\") return null;
  if (lineBefore.includes('"""') || !insideStringOnLine(text, start, '"')) return null;
  const indent = leadingSpace(lineBefore);
  const unit = indent.includes("\t") ? "\t" : profile.indentUnit;
  const insert = `" +\n${indent}${unit}${unit}"`;
  const caret = start + insert.length;
  return { from: start, to: start, insert, selectionStart: caret, selectionEnd: caret };
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

/**
 * The indent of a plain new line: the continuation indent inside an open "(", one more after a
 * block opener, one less after a block ends.
 */
function nextLineIndent(text: string, ctx: EnterContext, profile: LanguageProfile, unit: string): string {
  const continuation = continuationIndent(ctx, profile, unit);
  if (continuation !== null) return continuation;
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
 * Enter with a "(" still open on the line. IntelliJ and CLion give the continuation indent, two
 * levels (8 spaces); PyCharm gives a hanging indent of one level after a bare opener, and lines
 * the next argument up under the first one when the opener already has something after it.
 */
function continuationIndent(ctx: EnterContext, profile: LanguageProfile, unit: string): string | null {
  const open = lastUnclosedOpener(ctx.kept, BRACE_LANGUAGES.has(profile.id) ? "([" : "([{");
  if (open === null) return null;
  if (BRACE_LANGUAGES.has(profile.id)) return ctx.indent + unit + unit;
  const after = ctx.kept.slice(open + 1);
  if (after.trim() === "") return ctx.indent + unit;
  return " ".repeat(open + 1 + leadingSpace(after).length);
}

/** Index of the innermost opener among `openers` still open at the end of `line`, or null. */
function lastUnclosedOpener(line: string, openers: string): number | null {
  const closerOf: Readonly<Record<string, string>> = { "(": ")", "[": "]", "{": "}" };
  let stack: readonly { readonly ch: string; readonly at: number }[] = [];
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i] ?? "";
    if (quote !== null) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (closerOf[ch] !== undefined) {
      stack = [...stack, { ch, at: i }];
    } else if (ch === ")" || ch === "]" || ch === "}") {
      const match = stack.map((entry) => closerOf[entry.ch]).lastIndexOf(ch);
      if (match !== -1) stack = stack.slice(0, match);
    }
  }
  const top = stack[stack.length - 1];
  return top !== undefined && openers.includes(top.ch) ? top.at : null;
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
  // IntelliJ and CLion comment at column 0. PyCharm comments at the block's own indent, the
  // smallest indent among the lines, so `    print(x)` becomes `    # print(x)`.
  const commentCol =
    profile.id === "python" && filled.length > 0
      ? Math.min(...filled.map((line) => leadingSpace(line).length))
      : 0;

  const changes = lines.map((line): LineChange => {
    if (comment) {
      const skip = filled.length > 0 && line.trim() === "";
      return { col: skip ? 0 : commentCol, removed: 0, inserted: skip ? "" : prefix };
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
    start === end
      ? caretAfterComment(text, span, block, start, changes[0], map)
      : [map(start, true), map(end, false)];
  return { from: span.start, to: span.end, insert: block, selectionStart, selectionEnd };
}

/** With no selection IntelliJ moves the caret down a line, keeping its column, after toggling. */
function caretAfterComment(
  text: string,
  span: LineSpan,
  block: string,
  caret: number,
  change: LineChange | undefined,
  map: (pos: number, stickLeft: boolean) => number,
): [number, number] {
  if (span.end >= text.length) {
    const mapped = map(caret, false);
    return [mapped, mapped];
  }
  const nextStart = span.end + 1;
  const nextLength = lineEndAt(text, nextStart) - nextStart;
  // The column the caret had on the toggled line AFTER the toggle: two to the right of where it
  // was once "//" goes in, two to the left once it comes out.
  const toggled = change === undefined ? caret - span.start : mapColumn(caret - span.start, change, false);
  const column = Math.min(toggled, nextLength);
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

/** Tab over a closer: the editor's tracked auto-inserted one, or (with no tracking) a line-ending one. */
function tabOutOfPair(range: Range, input: KeyInput, profile: LanguageProfile): Edit | null {
  if (input.exitCloserAt === undefined) return jumpOutOfCloser(range, profile);
  if (input.exitCloserAt === null || range.start !== range.end || input.exitCloserAt !== range.start) return null;
  return caretOnly(range.start, range.start + 1);
}

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
  if (template === undefined || !templateFits(text, wordStart, start, template, profile)) return null;
  return templateEdit(wordStart, start, templateBodyAt(template, text, wordStart), leadingSpace(lineBefore), profile);
}

/**
 * The postfix template whose abbreviation ends at the caret after `expr.`, expanded, or null. The
 * completion popup accepts its postfix rows through this, so a row and `x.sout` + Tab agree.
 */
export function expandPostfixAt(state: EditState, profile: LanguageProfile): Edit | null {
  const range = normalise(state);
  const { text, start, end } = range;
  if (start !== end) return null;
  const word = TRAILING_WORD.exec(text.slice(lineStartAt(text, start), start))?.[0];
  if (word === undefined) return null;
  const wordStart = start - word.length;
  if (separatorEndingAt(text, wordStart) !== ".") return null;
  return expandPostfix(range, word, wordStart, profile);
}

/**
 * IntelliJ's postfix completion: `x.sout` becomes `System.out.println(x);` and `n.fori` a loop up
 * to n. The expression is the chain of names, calls and indexes before the dot on this line.
 */
function expandPostfix(range: Range, word: string, wordStart: number, profile: LanguageProfile): Edit | null {
  const template = (profile.postfixTemplates ?? []).find((candidate) => candidate.abbreviation === word);
  if (template === undefined) return null;
  const { text, start } = range;
  if (isWordChar(text[start]) || regionAt(text, wordStart, profile) !== "code") return null;
  const lineStart = lineStartAt(text, start);
  const dot = wordStart - 1;
  const exprStart = statementExpressionStart(text, lineStart, dot, word) ?? expressionStart(text, lineStart, dot);
  if (exprStart === null) return null;
  const expression = text.slice(exprStart, dot);
  const indent = leadingSpace(text.slice(lineStart, start));
  const body = resolveMacros(template.body, text, exprStart, expression) ?? template.fallback ?? template.body;
  return templateEdit(exprStart, start, body, indent, profile, expression);
}

/** A live template's body with its variables read from the file (template-macros.ts). */
export function templateBodyAt(template: LiveTemplate, text: string, at: number): string {
  return resolveMacros(template.body, text, at) ?? resolveMacros(template.fallback ?? template.body, text, at) ?? template.body;
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
  return { ...edit, ...templateParts(rendered, from) };
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

/** Postfix templates that take the whole statement when it is one expression, `a + b.sout`. */
const STATEMENT_POSTFIX: ReadonlySet<string> = new Set([
  "sout", "serr", "soutv", "souf", "print", "return", "if", "else", "while", "var", "par", "try",
  "switch", "nn", "notnull", "null", "ifn", "ifnn", "for", "fore", "iter", "fori", "forr", "len", "arg",
]);
const STATEMENT_KEYWORD = /^(?:return|if|for|while|else|case|throw|do|try|catch|switch|elif|def|class|import|from|yield|assert|del|raise|print\s)/;

/**
 * IntelliJ and PyCharm offer the whole expression a postfix template follows, not only its last
 * operand: `a + b.sout` prints `a + b`, and `n > 0.if` checks `n > 0`. Taken when the line up to
 * the dot is one expression on its own: balanced, with no assignment, no ";" or braces, and not
 * started by a keyword. Otherwise null, and the last operand is used as before.
 */
function statementExpressionStart(text: string, lineStart: number, dot: number, word: string): number | null {
  if (!STATEMENT_POSTFIX.has(word)) return null;
  const line = text.slice(lineStart, dot);
  const start = lineStart + leadingSpace(line).length;
  const expression = text.slice(start, dot);
  // One operand needs no widening, except a literal string, which the operand scan cannot read.
  if (!/[\s+\-*/%<>=!&|^?:]/.test(expression.trim()) && !/^["']/.test(expression)) return null;
  if (/[;{}]/.test(expression) || STATEMENT_KEYWORD.test(expression)) return null;
  if (/(?:^|[^=!<>])=(?!=)/.test(expression)) return null;
  let depth = 0;
  for (const ch of expression) {
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    if (depth < 0) return null;
  }
  return depth === 0 && /[\w)\]"']$/.test(expression) ? start : null;
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
