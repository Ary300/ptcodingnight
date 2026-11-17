/**
 * IntelliJ's Surround With (Mod+Alt+T): the selected lines, or the caret's line, wrapped in an
 * `if`, a loop, a `try` or a plain block, indented one level into it, with the caret in the
 * condition. Pure: the surface shows the chooser (`surroundKindsFor`) and applies `surroundWith`.
 *
 * Kinds are written as the lines before and after the body. A leading tab is one indent level
 * deeper than the first selected line, and `{{}}` (or `{{default}}`) is a field: the first is
 * where the caret lands, the rest are the template's Tab stops, ending after the body.
 */

import { leadingSpace, normalise, selectedLines, unitFor, type Range } from "./text";
import type { Edit, EditState, LanguageProfile, TabStop } from "./types";

export interface SurroundKind {
  readonly id: string;
  /** What the chooser shows, e.g. "if / else". */
  readonly label: string;
}

interface SurroundShape extends SurroundKind {
  readonly before: readonly string[];
  readonly after: readonly string[];
}

const BRACE_COMMON: readonly SurroundShape[] = [
  { id: "if", label: "if", before: ["if ({{}}) {"], after: ["}"] },
  { id: "if-else", label: "if / else", before: ["if ({{}}) {"], after: ["} else {", "\t{{}}", "}"] },
  { id: "while", label: "while", before: ["while ({{}}) {"], after: ["}"] },
  { id: "do-while", label: "do / while", before: ["do {"], after: ["} while ({{}});"] },
  { id: "for", label: "for", before: ["for ({{}}) {"], after: ["}"] },
];

const JAVA_KINDS: readonly SurroundShape[] = [
  ...BRACE_COMMON,
  { id: "try-catch", label: "try / catch", before: ["try {"], after: ["} catch ({{Exception}} e) {", "\t{{}}", "}"] },
  { id: "try-finally", label: "try / finally", before: ["try {"], after: ["} finally {", "\t{{}}", "}"] },
  { id: "block", label: "{ }", before: ["{"], after: ["}"] },
];

const CPP_KINDS: readonly SurroundShape[] = [
  ...BRACE_COMMON,
  { id: "try-catch", label: "try / catch", before: ["try {"], after: ["} catch ({{...}}) {", "\t{{}}", "}"] },
  { id: "block", label: "{ }", before: ["{"], after: ["}"] },
];

const PYTHON_KINDS: readonly SurroundShape[] = [
  { id: "if", label: "if", before: ["if {{}}:"], after: [] },
  { id: "if-else", label: "if / else", before: ["if {{}}:"], after: ["else:", "\t{{pass}}"] },
  { id: "while", label: "while", before: ["while {{}}:"], after: [] },
  { id: "for", label: "for", before: ["for {{}} in {{}}:"], after: [] },
  { id: "try-except", label: "try / except", before: ["try:"], after: ["except {{Exception}}:", "\t{{pass}}"] },
  { id: "try-finally", label: "try / finally", before: ["try:"], after: ["finally:", "\t{{pass}}"] },
  { id: "with", label: "with", before: ["with {{}}:"], after: [] },
];

function shapesFor(profile: LanguageProfile): readonly SurroundShape[] {
  if (profile.id === "python") return PYTHON_KINDS;
  return profile.id === "java" ? JAVA_KINDS : CPP_KINDS;
}

/** The chooser's entries for a language, in IntelliJ's order. */
export function surroundKindsFor(profile: LanguageProfile): readonly SurroundKind[] {
  return shapesFor(profile).map(({ id, label }) => ({ id, label }));
}

const FIELD = /\{\{([^}]*)\}\}/g;

interface Built {
  text: string;
  fields: TabStop[];
}

/** Appends one line, turning its `{{...}}` markers into fields at their offsets. */
function appendLine(built: Built, line: string): void {
  let last = 0;
  for (const match of line.matchAll(FIELD)) {
    built.text += line.slice(last, match.index);
    const fallback = match[1] ?? "";
    built.fields.push({ from: built.text.length, to: built.text.length + fallback.length });
    built.text += fallback;
    last = match.index + match[0].length;
  }
  built.text += line.slice(last);
}

/**
 * The edit that wraps the selected lines (or the caret's line) in the kind `kindId`, or null for
 * a kind the language does not have.
 */
export function surroundWith(state: EditState, kindId: string, profile: LanguageProfile): Edit | null {
  const shape = shapesFor(profile).find((candidate) => candidate.id === kindId);
  if (shape === undefined) return null;
  const range: Range = normalise(state);
  const span = selectedLines(range);
  const lines = range.text.slice(span.start, span.end).split("\n");
  const filled = lines.filter((line) => line.trim() !== "");
  const base = filled.reduce<string | null>((min, line) => {
    const indent = leadingSpace(line);
    return min === null || indent.length < min.length ? indent : min;
  }, null) ?? leadingSpace(lines[0] ?? "");
  const unit = unitFor(base, profile);
  const frame = (line: string) => base + line.replace(/^\t/, unit);

  const built: Built = { text: "", fields: [] };
  for (const line of shape.before) appendLine(built, `${frame(line)}\n`);
  const body = filled.length === 0 ? [base + unit] : lines.map((line) => (line.trim() === "" ? "" : unit + line));
  built.text += body.join("\n");
  const bodyEnd = built.text.length;
  for (const line of shape.after) appendLine(built, `\n${frame(line)}`);

  const at = (stop: TabStop): TabStop => ({ from: span.start + stop.from, to: span.start + stop.to });
  const finish: TabStop = { from: span.start + bodyEnd, to: span.start + bodyEnd };
  const fields = built.fields.map(at);
  const [first, ...rest] = fields;
  // A field after the body (the else branch, the catch) is the last stop; otherwise the body's end is.
  const fieldAfterBody = built.fields.some((field) => field.from > bodyEnd);
  const edit: Edit = {
    from: span.start,
    to: span.end,
    insert: built.text,
    selectionStart: (first ?? finish).from,
    selectionEnd: (first ?? finish).to,
  };
  if (first === undefined) return edit;
  const stops = fieldAfterBody ? rest : [...rest, finish];
  return stops.length === 0 ? edit : { ...edit, tabStops: stops };
}
