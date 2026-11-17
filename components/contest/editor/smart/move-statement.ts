/**
 * IntelliJ's Move Statement Up / Down (Mod+Shift+Up / Down).
 *
 * Unlike Move Line, the unit is a statement: a line, or a header with its whole block (braces in
 * Java and C++, the deeper-indented lines in Python), and it moves past the neighbouring statement
 * or block as a whole. In Java and C++ the first statement of a block moving up (or the last moving
 * down) leaves the block and takes the indent of the block's header. In Python, as PyCharm does,
 * the first statement of a block moving up leaves it above its header at the header's indent.
 */

import { scanCode } from "./scan";
import { BRACE_LANGUAGES, leadingSpace, normalise, removeOneIndent, unitFor } from "./text";
import type { Edit, EditState, LanguageProfile } from "./types";

interface Lines {
  readonly lines: readonly string[];
  readonly starts: readonly number[];
}

/** First and last line index of a unit, inclusive. */
interface Unit {
  readonly first: number;
  readonly last: number;
}

function splitLines(text: string): Lines {
  const lines = text.split("\n");
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  return { lines, starts };
}

function lineIndexOf(lines: Lines, pos: number): number {
  let index = 0;
  for (let i = 0; i < lines.starts.length; i += 1) if ((lines.starts[i] ?? 0) <= pos) index = i;
  return index;
}

/** Brace depth at the start of each line, plus one entry for the end of the text. */
function depthBefore(text: string, lines: Lines, profile: LanguageProfile): readonly number[] {
  const deltas = new Array<number>(lines.lines.length).fill(0);
  let line = 0;
  scanCode(text, text.length, profile, (ch, pos) => {
    while (line + 1 < lines.starts.length && (lines.starts[line + 1] ?? 0) <= pos) line += 1;
    if (ch === "{") deltas[line] = (deltas[line] ?? 0) + 1;
    else if (ch === "}") deltas[line] = (deltas[line] ?? 0) - 1;
  });
  return deltas.reduce<number[]>((acc, delta) => [...acc, (acc[acc.length - 1] ?? 0) + delta], [0]);
}

interface BraceModel {
  readonly depth: readonly number[];
}

function braceBlockEnd(model: BraceModel, first: number): number {
  const start = model.depth[first] ?? 0;
  if ((model.depth[first + 1] ?? 0) <= start) return first;
  for (let j = first + 1; j < model.depth.length - 1; j += 1) if ((model.depth[j + 1] ?? 0) <= start) return j;
  return model.depth.length - 2;
}

function braceBlockStart(model: BraceModel, last: number): number {
  const after = model.depth[last + 1] ?? 0;
  if ((model.depth[last] ?? 0) <= after) return last;
  for (let i = last - 1; i >= 0; i -= 1) if ((model.depth[i] ?? 0) <= after) return i;
  return 0;
}

const width = (lines: Lines, i: number) => leadingSpace(lines.lines[i] ?? "").length;
const blank = (lines: Lines, i: number) => (lines.lines[i] ?? "").trim() === "";

function pythonBlockEnd(lines: Lines, first: number): number {
  if (!(lines.lines[first] ?? "").trimEnd().endsWith(":")) return first;
  let last = first;
  for (let j = first + 1; j < lines.lines.length && (blank(lines, j) || width(lines, j) > width(lines, first)); j += 1) {
    if (!blank(lines, j)) last = j;
  }
  return last;
}

type Neighbour = { readonly kind: "swap"; readonly unit: Unit } | { readonly kind: "leave"; readonly line: number } | null;

function braceNeighbour(lines: Lines, model: BraceModel, unit: Unit, up: boolean): Neighbour {
  const d = model.depth;
  if (up) {
    const prev = unit.first - 1;
    if (prev < 0) return null;
    if ((d[prev] ?? 0) < (d[prev + 1] ?? 0)) {
      return (lines.lines[prev] ?? "").trimStart().startsWith("}") ? null : { kind: "leave", line: prev };
    }
    return { kind: "swap", unit: { first: braceBlockStart(model, prev), last: prev } };
  }
  const next = unit.last + 1;
  if (next >= lines.lines.length) return null;
  if ((lines.lines[next] ?? "").trimStart().startsWith("}")) {
    return (d[next + 1] ?? 0) < (d[next] ?? 0) && !(lines.lines[next] ?? "").trimEnd().endsWith("{")
      ? { kind: "leave", line: next }
      : null;
  }
  return { kind: "swap", unit: { first: next, last: braceBlockEnd(model, next) } };
}

function pythonNeighbour(lines: Lines, unit: Unit, up: boolean): Neighbour {
  const own = width(lines, unit.first);
  if (up) {
    const prev = unit.first - 1;
    if (prev < 0) return null;
    if (blank(lines, prev)) return { kind: "swap", unit: { first: prev, last: prev } };
    if (width(lines, prev) < own) {
      // The block's header: the statement leaves the block and goes above it, one level out.
      return (lines.lines[prev] ?? "").trimEnd().endsWith(":") ? { kind: "leave", line: prev } : null;
    }
    let first = prev;
    while (first > 0 && (blank(lines, first) || width(lines, first) > own)) first -= 1;
    return { kind: "swap", unit: { first, last: prev } };
  }
  const next = unit.last + 1;
  if (next >= lines.lines.length) return null;
  if (blank(lines, next)) return { kind: "swap", unit: { first: next, last: next } };
  if (width(lines, next) < own) return null;
  return { kind: "swap", unit: { first: next, last: pythonBlockEnd(lines, next) } };
}

/** The statement or block the selection covers, as whole lines. */
function unitAt(lines: Lines, model: BraceModel | null, first: number, last: number): Unit {
  const end = model === null ? pythonBlockEnd(lines, last) : braceBlockEnd(model, last);
  return { first, last: Math.max(last, end) };
}

/** Moves the statement (or the selected lines, grown to whole statements) up or down. */
export function moveStatement(state: EditState, profile: LanguageProfile, up: boolean): Edit {
  const range = normalise(state);
  const { text, start, end } = range;
  const unchanged: Edit = { from: start, to: start, insert: "", selectionStart: start, selectionEnd: end };
  const lines = splitLines(text);
  const model = BRACE_LANGUAGES.has(profile.id) ? { depth: depthBefore(text, lines, profile) } : null;
  const firstLine = lineIndexOf(lines, start);
  const lastPos = end > start && text[end - 1] === "\n" ? end - 1 : end;
  const unit = unitAt(lines, model, firstLine, lineIndexOf(lines, lastPos));
  const neighbour = model === null ? pythonNeighbour(lines, unit, up) : braceNeighbour(lines, model, unit, up);
  if (neighbour === null) return unchanged;

  const moving = lines.lines.slice(unit.first, unit.last + 1);
  const unitIndent = leadingSpace(moving[0] ?? "");
  const outdent = (line: string) => {
    const indent = leadingSpace(line);
    return removeOneIndent(indent, unitFor(unitIndent, profile)) + line.slice(indent.length);
  };
  const placed = neighbour.kind === "leave" ? moving.map((line) => (line.trim() === "" ? line : outdent(line))) : moving;
  const other = neighbour.kind === "leave" ? { first: neighbour.line, last: neighbour.line } : neighbour.unit;
  const otherLines = lines.lines.slice(other.first, other.last + 1);

  const top = Math.min(unit.first, other.first);
  const bottom = Math.max(unit.last, other.last);
  const from = lines.starts[top] ?? 0;
  const to = (lines.starts[bottom] ?? 0) + (lines.lines[bottom] ?? "").length;
  const block = up ? [...placed, ...otherLines] : [...otherLines, ...placed];
  const insert = block.join("\n");

  const unitStart = up ? from : from + otherLines.join("\n").length + 1;
  const shift = (moving[0] ?? "").length - (placed[0] ?? "").length;
  const oldUnitStart = lines.starts[unit.first] ?? 0;
  const map = (pos: number) => Math.max(unitStart, unitStart + (pos - oldUnitStart) - shift);
  return { from, to, insert, selectionStart: map(start), selectionEnd: Math.max(map(start), map(end)) };
}
