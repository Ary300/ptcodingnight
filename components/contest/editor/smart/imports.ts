/**
 * Imports, the way IntelliJ, PyCharm and CLion add them when a name is accepted from completion
 * or picked from Show Context Actions (Alt+Enter).
 *
 * Everything works on an item's `importLine`, the line written in full ("import java.io.
 * BufferedReader;", "#include <vector>", "from collections import deque", "import math"). This file
 * decides whether the file already has it (the line itself, a wildcard such as java.util.* or
 * bits/stdc++.h, or a from-import that names it), where it goes, and how the import and the
 * accepted word become ONE replacement, so the surface's single insertText is a single undo step.
 */

import type { Edit, EditState, LanguageProfile } from "./types";

/** A replacement in the OLD text, before it is folded into an Edit. */
export interface TextChange {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

const JAVA_IMPORT = /^import\s+(static\s+)?([\w.]+)\.(\w+|\*)\s*;$/;
const JAVA_IMPORT_LINE = /^import\s+[\w.*\s]+;[ \t]*$/gm;
const CPP_INCLUDE_LINE = /^[ \t]*#[ \t]*include[ \t]*[<"][^>"]*[>"][ \t]*$/gm;
const PY_FROM = /^from\s+([\w.]+)\s+import\s+(\w+)$/;
const PY_IMPORT = /^import\s+([\w.]+)$/;
const PY_IMPORT_LINE = /^(?:import|from)\s+[^\n]*$/gm;

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** End of the line that starts at or contains `offset`, past its newline when there is one. */
function afterLine(text: string, offset: number): number {
  const newline = text.indexOf("\n", offset);
  return newline === -1 ? text.length : newline + 1;
}

/** Every match of a /gm line pattern, as [start, end) of the line. */
function lines(text: string, pattern: RegExp): { readonly start: number; readonly line: string }[] {
  return [...text.matchAll(pattern)].map((match) => ({ start: match.index, line: match[0] }));
}

/** At the end of a final line with no newline, the import needs one in front of it. */
function placeAfter(text: string, lineStart: number, importLine: string): TextChange {
  const at = afterLine(text, lineStart);
  const needsNewline = at === text.length && !text.endsWith("\n");
  return { from: at, to: at, insert: needsNewline ? `\n${importLine}` : `${importLine}\n` };
}

/** The top of a file with no imports: the line, then a blank line before the code. */
function placeAtTop(text: string, importLine: string, blank: boolean): TextChange {
  const separator = blank && text.length > 0 && !text.startsWith("\n") ? "\n\n" : "\n";
  return { from: 0, to: 0, insert: `${importLine}${separator}` };
}

function javaImport(text: string, importLine: string): TextChange | null {
  const parsed = JAVA_IMPORT.exec(importLine);
  if (parsed === null) return null;
  const pkg = parsed[2] ?? "";
  const name = parsed[3] ?? "";
  if (pkg === "java.lang") return null;
  const covering = new RegExp(`^\\s*import\\s+${escape(pkg)}\\.(?:\\*|${escape(name)})\\s*;`, "m");
  if (covering.test(text)) return null;
  const existing = lines(text, JAVA_IMPORT_LINE);
  if (existing.length === 0) {
    const pkgLine = /^package\s+[\w.]+\s*;[ \t]*$/m.exec(text);
    if (pkgLine !== null) {
      const at = afterLine(text, pkgLine.index);
      return { from: at, to: at, insert: `\n${importLine}\n` };
    }
    return placeAtTop(text, importLine, true);
  }
  // IntelliJ keeps java.* imports in A to Z order.
  const later = existing.find((entry) => entry.line.trim() > importLine);
  if (later !== undefined) return { from: later.start, to: later.start, insert: `${importLine}\n` };
  const last = existing[existing.length - 1];
  return last === undefined ? null : placeAfter(text, last.start, importLine);
}

function cppInclude(text: string, importLine: string): TextChange | null {
  const header = /<([^>]+)>/.exec(importLine)?.[1];
  if (header === undefined) return null;
  const covering = new RegExp(`^[ \\t]*#[ \\t]*include[ \\t]*<(?:bits/stdc\\+\\+\\.h|${escape(header)})>`, "m");
  if (covering.test(text)) return null;
  const existing = lines(text, CPP_INCLUDE_LINE);
  const last = existing[existing.length - 1];
  if (last === undefined) return placeAtTop(text, importLine, true);
  return placeAfter(text, last.start, importLine);
}

function pythonImport(text: string, importLine: string): TextChange | null {
  const from = PY_FROM.exec(importLine);
  if (from !== null) {
    const moduleName = from[1] ?? "";
    const name = from[2] ?? "";
    const sameModule = new RegExp(`^from\\s+${escape(moduleName)}\\s+import\\s+([^\\n#]*)`, "gm");
    for (const match of text.matchAll(sameModule)) {
      const names = (match[1] ?? "").split(",").map((part) => part.trim().split(/\s+as\s+/)[0]);
      if (names.includes(name) || names.includes("*")) return null;
    }
    const first = sameModule.exec(text);
    sameModule.lastIndex = 0;
    if (first !== null && !(first[1] ?? "").includes("(")) {
      // PyCharm adds the name to the from-import the file already has.
      const end = first.index + first[0].trimEnd().length;
      return { from: end, to: end, insert: `, ${name}` };
    }
  } else {
    const plain = PY_IMPORT.exec(importLine);
    if (plain === null) return null;
    const moduleName = plain[1] ?? "";
    const covering = new RegExp(`^import\\s+(?:[\\w.]+\\s*,\\s*)*${escape(moduleName)}(?:\\s|,|$)`, "m");
    if (covering.test(text)) return null;
  }
  const existing = lines(text, PY_IMPORT_LINE);
  const last = existing[existing.length - 1];
  if (last === undefined) {
    // A module docstring stays the first statement, as PyCharm keeps it: the import goes under it.
    const docstring = /^(?:[ \t]*(?:#[^\n]*)?\n)*[rRuU]?("""|''')[\s\S]*?\1[ \t]*(?:\n|$)/.exec(text);
    if (docstring !== null) {
      const at = docstring.index + docstring[0].length;
      const lead = text[at - 1] === "\n" ? "" : "\n";
      return { from: at, to: at, insert: `${lead}${importLine}\n` };
    }
    return placeAtTop(text, importLine, true);
  }
  return placeAfter(text, last.start, importLine);
}

/**
 * The change that adds `importLine` to `text`, or null when the file already has it or something
 * that covers it (java.lang, a wildcard, bits/stdc++.h, a from-import naming it).
 */
export function importChange(text: string, importLine: string, profile: LanguageProfile): TextChange | null {
  if (profile.id === "java") return javaImport(text, importLine);
  if (profile.id === "cpp") return cppInclude(text, importLine);
  return pythonImport(text, importLine);
}

/**
 * Folds `extra` into `edit` as one replacement over both ranges and the text between them. The
 * selection and tab stops follow the text they were in. Overlapping ranges keep `edit` alone.
 */
export function combineEdit(text: string, edit: Edit, extra: TextChange): Edit {
  if (extra.to <= edit.from) {
    const delta = extra.insert.length - (extra.to - extra.from);
    const shifted: Edit = {
      from: extra.from,
      to: edit.to,
      insert: extra.insert + text.slice(extra.to, edit.from) + edit.insert,
      selectionStart: edit.selectionStart + delta,
      selectionEnd: edit.selectionEnd + delta,
    };
    return edit.tabStops === undefined
      ? shifted
      : { ...shifted, tabStops: edit.tabStops.map((stop) => ({ from: stop.from + delta, to: stop.to + delta })) };
  }
  if (extra.from >= edit.to) {
    return {
      ...edit,
      to: extra.to,
      insert: edit.insert + text.slice(edit.to, extra.from) + extra.insert,
    };
  }
  return edit;
}

/** `edit`, plus the import `importLine` names when the file still needs it. */
export function withImport(text: string, edit: Edit, importLine: string | undefined, profile: LanguageProfile): Edit {
  if (importLine === undefined) return edit;
  const change = importChange(text, importLine, profile);
  return change === null ? edit : combineEdit(text, edit, change);
}

/** One fix that Show Context Actions (Alt+Enter) offers at the caret. */
export interface ContextAction {
  readonly label: string;
  readonly edit: Edit;
}

const WORD = /[A-Za-z0-9_$]/;

function wordAt(text: string, caret: number): string {
  let start = caret;
  let end = caret;
  while (start > 0 && WORD.test(text.charAt(start - 1))) start -= 1;
  while (end < text.length && WORD.test(text.charAt(end))) end += 1;
  return text.slice(start, end);
}

/** The edit that only adds `change`, keeping the caret where it was. */
function changeOnly(state: EditState, change: TextChange): Edit {
  const delta = change.from < state.selectionStart ? change.insert.length - (change.to - change.from) : 0;
  return {
    from: change.from,
    to: change.to,
    insert: change.insert,
    selectionStart: state.selectionStart + delta,
    selectionEnd: state.selectionEnd + delta,
  };
}

/**
 * Java: the header of the method around `caret`, as the offset of its "{" and the header text,
 * when the caret sits inside a method body. Found by walking back to the innermost unclosed "{"
 * whose line has a ")" before it.
 */
function enclosingMethod(text: string, caret: number): { readonly brace: number; readonly header: string; readonly bodyEnd: number } | null {
  let depth = 0;
  for (let i = caret - 1; i >= 0; i -= 1) {
    const ch = text.charAt(i);
    if (ch === "}") depth += 1;
    else if (ch === "{") {
      if (depth > 0) {
        depth -= 1;
        continue;
      }
      const headerStart = Math.max(text.lastIndexOf(";", i), text.lastIndexOf("}", i), text.lastIndexOf("{", i - 1)) + 1;
      const header = text.slice(headerStart, i);
      if (/\)\s*(?:throws\s+[\w.,\s]+)?$/.test(header) && !/^\s*(?:if|for|while|switch|catch|synchronized)\b/.test(header.trim())) {
        return { brace: i, header, bodyEnd: matchingClose(text, i) };
      }
    }
  }
  return null;
}

function matchingClose(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text.charAt(i) === "{") depth += 1;
    else if (text.charAt(i) === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return text.length;
}

const NEEDS_IO_EXCEPTION = /\.readLine\s*\(|new\s+FileReader\s*\(|\bin\.read\s*\(|reader\.read\s*\(/;

function throwsFix(state: EditState, profile: LanguageProfile): ContextAction | null {
  const method = enclosingMethod(state.text, state.selectionStart);
  if (method === null) return null;
  const body = state.text.slice(method.brace, method.bodyEnd);
  if (!NEEDS_IO_EXCEPTION.test(body)) return null;
  const throwsClause = /throws\s+([\w.,\s]+?)\s*$/.exec(method.header);
  if (throwsClause !== null && /\b(?:IOException|Exception|Throwable)\b/.test(throwsClause[1] ?? "")) return null;
  const headerEnd = method.brace - (method.header.length - method.header.trimEnd().length);
  const insert = throwsClause === null ? " throws IOException" : ", IOException";
  const primary = changeOnly(state, { from: headerEnd, to: headerEnd, insert });
  const edit = withImport(state.text, primary, "import java.io.IOException;", profile);
  return { label: "Add 'throws IOException' to method signature", edit };
}

/**
 * Show Context Actions (Alt+Enter) at the caret, the fixes that can be found by reading the text:
 * import the known name under the caret, and in Java add `throws IOException` to the enclosing
 * method when its body calls readLine() without it. Empty when nothing applies.
 */
export function importFixFor(text: string, caret: number, profile: LanguageProfile): readonly ContextAction[] {
  const state: EditState = { text, selectionStart: caret, selectionEnd: caret };
  const actions: ContextAction[] = [];
  const word = wordAt(text, caret);
  if (word !== "") {
    const known = [...profile.globals, ...(profile.importables ?? [])].find(
      (item) => item.importLine !== undefined && /^[A-Za-z0-9_$]+/.exec(item.label)?.[0] === word,
    );
    const change = known?.importLine === undefined ? null : importChange(text, known.importLine, profile);
    if (known?.importLine !== undefined && change !== null) {
      actions.push({ label: `Add ${known.importLine}`, edit: changeOnly(state, change) });
    }
  }
  if (profile.id === "java") {
    const fix = throwsFix(state, profile);
    if (fix !== null) actions.push(fix);
  }
  return actions;
}
