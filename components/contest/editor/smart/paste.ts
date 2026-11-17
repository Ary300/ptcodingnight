/**
 * Paste, the way IntelliJ, PyCharm and CLion re-indent it.
 *
 * Code pasted from a template, a teammate or a PDF problem statement arrives with Windows line
 * endings, tabs (a TabError in Python when mixed with spaces), non-breaking spaces and zero-width
 * characters (compile errors nobody can see), curly quotes, and somebody else's indentation. The
 * paste is cleaned, its common indent removed, and every line after the first re-based onto the
 * caret's indent. Paste as Plain Text skips all of this and is the surface's business.
 */

import { regionAt } from "./scan";
import { leadingSpace, lineEndAt, lineStartAt } from "./text";
import type { Edit, EditState, LanguageProfile } from "./types";

const ZERO_WIDTH = /[​‌‍⁠﻿]/g;
const NO_BREAK_SPACE = /[  ]/g;
const CURLY_DOUBLE = /[“”„‟]/;
const CURLY_SINGLE = /[‘’‚‛]/;

/** Curly quotes to straight ones, except inside a straight-quoted string the paste already holds. */
function straightenQuotes(text: string): string {
  let out = "";
  let open: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    if (open !== null) {
      out += ch;
      if (ch === "\\") {
        out += text[i + 1] ?? "";
        i += 1;
      } else if (ch === open || ch === "\n") {
        open = null;
      }
    } else if (ch === '"' || ch === "'") {
      open = ch;
      out += ch;
    } else if (CURLY_DOUBLE.test(ch)) {
      out += '"';
    } else if (CURLY_SINGLE.test(ch)) {
      out += "'";
    } else {
      out += ch;
    }
  }
  return out;
}

/** Leading tabs as indent units; a tab after spaces in the indent counts the same. */
function expandLeadingTabs(line: string, unit: string): string {
  const indent = leadingSpace(line);
  if (!indent.includes("\t")) return line;
  return indent.replace(/\t/g, unit) + line.slice(indent.length);
}

/** The characters every editor sees as noise, cleaned; quotes only when pasting into code. */
export function cleanPastedText(pasted: string, intoCode: boolean): string {
  const cleaned = pasted.replace(/\r\n?/g, "\n").replace(ZERO_WIDTH, "").replace(NO_BREAK_SPACE, " ");
  return intoCode ? straightenQuotes(cleaned) : cleaned;
}

/**
 * The edit a paste makes at the caret (replacing the selection): cleaned, its common indent
 * removed, and re-based onto the caret line's indent. When only whitespace precedes the caret the
 * first line lands at the caret with its own indent dropped; otherwise it keeps what it had. A
 * paste ending in a newline leaves the rest of the caret line at the caret's indent.
 */
export function reindentPaste(
  text: string,
  pastedText: string,
  caretState: Pick<EditState, "selectionStart" | "selectionEnd">,
  profile: LanguageProfile,
): Edit {
  const from = Math.max(0, Math.min(caretState.selectionStart, caretState.selectionEnd, text.length));
  const to = Math.min(text.length, Math.max(caretState.selectionStart, caretState.selectionEnd));
  const intoCode = regionAt(text, from, profile) === "code";
  const cleaned = cleanPastedText(pastedText, intoCode);

  const lineStart = lineStartAt(text, from);
  const beforeCaret = text.slice(lineStart, from);
  const atIndent = beforeCaret.trim() === "";
  const target = atIndent ? beforeCaret : leadingSpace(beforeCaret);

  const [first = "", ...rest] = cleaned.split("\n").map((line) => expandLeadingTabs(line, profile.indentUnit));
  const filled = rest.filter((line) => line.trim() !== "");
  const common = filled.reduce((min, line) => Math.min(min, leadingSpace(line).length), Number.POSITIVE_INFINITY);
  const measured = Number.isFinite(common) ? common : 0;
  // A header copied from mid-line (`if x:` then its body) tells nothing by its own indent, so a
  // body that would land level with its header keeps one level under it.
  const firstBody = filled[0];
  const opens = /[:{]\s*$/.test(first) && firstBody !== undefined && leadingSpace(firstBody).length === measured;
  const strip = opens ? Math.max(0, measured - profile.indentUnit.length) : measured;

  const head = atIndent ? first.trimStart() : first;
  const tail = rest.map((line, i) => {
    if (line.trim() === "") return i === rest.length - 1 && lineEndAt(text, to) > to ? target : "";
    return target + line.slice(strip);
  });
  const insert = [head, ...tail].join("\n");
  const caret = from + insert.length;
  return { from, to, insert, selectionStart: caret, selectionEnd: caret };
}
