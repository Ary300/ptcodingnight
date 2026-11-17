/**
 * IntelliJ's Reformat Code (Cmd+Option+L / Ctrl+Alt+L) and Auto-Indent Lines (Ctrl+Option+I /
 * Ctrl+Alt+I), for what a contest file needs: every line's indent set from its brace depth, a
 * `case` label one level inside its switch and the statements under it one more, trailing
 * whitespace stripped, and in Python every leading tab widened to four spaces. Code is never
 * reordered or rewrapped, and lines inside a block comment or a multi-line string are left alone.
 *
 * Reformat covers the selected lines, or the whole file with nothing selected; Auto-Indent covers
 * the selected lines or the caret's line. The caret keeps its place in the code it was on.
 */

import { regions, scanCode } from "./scan";
import { BRACE_LANGUAGES } from "./text";
import type { Edit, EditState, LanguageProfile } from "./types";

interface LineInfo {
  readonly start: number;
  readonly text: string;
}

function linesOf(text: string): readonly LineInfo[] {
  const found: LineInfo[] = [];
  let start = 0;
  for (const line of text.split("\n")) {
    found.push({ start, text: line });
    start += line.length + 1;
  }
  return found;
}

/** Offsets inside a block comment or a string that spans lines: those lines are not touched. */
function frozenLines(text: string, lines: readonly LineInfo[], profile: LanguageProfile): ReadonlySet<number> {
  const frozen = new Set<number>();
  for (const region of regions(text, profile)) {
    const spansLines = text.slice(region.from, region.to).includes("\n");
    if (!spansLines) continue;
    lines.forEach((line, index) => {
      if (line.start > region.from && line.start < region.to) frozen.add(index);
    });
  }
  return frozen;
}

const LABEL = /^(?:case\b[^:]*|default\s*):(?!:)/;

/**
 * The indent depth of every line from the braces before it, in levels. A brace that opened a
 * switch counts two, so its labels (one level back) sit one in and their statements two in.
 */
function braceDepths(text: string, lines: readonly LineInfo[], profile: LanguageProfile): readonly number[] {
  const atLineStart: (readonly boolean[])[] = [];
  let stack: readonly boolean[] = [];
  let next = 0;
  const record = (upTo: number) => {
    while (next < lines.length && (lines[next]?.start ?? Infinity) <= upTo) {
      atLineStart.push(stack);
      next += 1;
    }
  };
  scanCode(text, text.length, profile, (ch, pos) => {
    record(pos);
    if (ch === "{") {
      const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
      stack = [...stack, /\bswitch\s*\(/.test(text.slice(lineStart, pos))];
    } else if (ch === "}") {
      stack = stack.slice(0, -1);
    }
  });
  record(Infinity);

  const levels = (open: readonly boolean[]): number => open.reduce((sum, isSwitch) => sum + (isSwitch ? 2 : 1), 0);
  return lines.map((line, index) => {
    const code = line.text.trim();
    let open = atLineStart[index] ?? [];
    // A line that starts by closing blocks sits with the line that opened the last of them.
    const closers = (/^[}\s]*/.exec(code)?.[0] ?? "").split("").filter((ch) => ch === "}").length;
    if (closers > 0) open = open.slice(0, Math.max(0, open.length - closers));
    let depth = levels(open);
    if (LABEL.test(code) && open[open.length - 1] === true) depth -= 1;
    return Math.max(0, depth);
  });
}

/** Python keeps its structure: a leading tab becomes four columns, trailing space goes. */
function pythonIndent(line: string, unit: string): string {
  const lead = /^[ \t]*/.exec(line)?.[0] ?? "";
  let width = 0;
  for (const ch of lead) width = ch === "\t" ? width + unit.length - (width % unit.length) : width + 1;
  return " ".repeat(width);
}

/**
 * Reformat (`wholeFile` true with nothing selected) or Auto-Indent the lines. Always an Edit, so
 * the key is the editor's even when nothing changes and Chrome never opens its Downloads page.
 */
export function reindentLines(state: EditState, profile: LanguageProfile, wholeFile: boolean): Edit {
  const { text } = state;
  const start = Math.min(state.selectionStart, state.selectionEnd);
  const end = Math.max(state.selectionStart, state.selectionEnd);
  const lines = linesOf(text);
  const lineOf = (offset: number): number => {
    let index = 0;
    while (index + 1 < lines.length && (lines[index + 1]?.start ?? Infinity) <= offset) index += 1;
    return index;
  };
  const first = wholeFile && start === end ? 0 : lineOf(start);
  // A selection that ends at column 0 does not take that line.
  const endLine = lineOf(end);
  const lastCandidate = wholeFile && start === end ? lines.length - 1 : endLine;
  const last = end > start && lines[endLine]?.start === end && lastCandidate > first ? lastCandidate - 1 : lastCandidate;

  const frozen = frozenLines(text, lines, profile);
  const braces = BRACE_LANGUAGES.has(profile.id);
  const depths = braces ? braceDepths(text, lines, profile) : [];
  const unit = profile.indentUnit;

  const rewritten = lines.map((line, index) => {
    if (index < first || index > last || frozen.has(index)) return line.text;
    const code = line.text.trim();
    if (code === "") return "";
    if (!braces) return pythonIndent(line.text, unit) + line.text.trimStart().replace(/[ \t]+$/, "");
    if (profile.id === "cpp" && code.startsWith("#")) return code;
    return unit.repeat(depths[index] ?? 0) + code;
  });

  const from = lines[first]?.start ?? 0;
  const lastLine = lines[last];
  const to = lastLine === undefined ? text.length : lastLine.start + lastLine.text.length;
  const insert = rewritten.slice(first, last + 1).join("\n");

  // Each end of the selection keeps its place in the code of its line.
  const place = (offset: number): number => {
    const index = lineOf(offset);
    const line = lines[index];
    if (line === undefined || index < first || index > last) {
      return offset <= from ? offset : offset + insert.length - (to - from);
    }
    const oldLead = (/^[ \t]*/.exec(line.text)?.[0] ?? "").length;
    const newText = rewritten[index] ?? "";
    const newLead = (/^ */.exec(newText)?.[0] ?? "").length;
    const column = offset - line.start;
    const newColumn = column <= oldLead ? newLead : Math.min(newText.length, column - oldLead + newLead);
    const before = rewritten.slice(first, index).reduce((sum, written) => sum + written.length + 1, 0);
    return from + before + newColumn;
  };
  return { from, to, insert, selectionStart: place(state.selectionStart), selectionEnd: place(state.selectionEnd) };
}
