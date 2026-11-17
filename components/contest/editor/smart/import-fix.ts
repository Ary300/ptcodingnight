import type { Edit, EditState, LanguageProfile } from "./types";

/**
 * Show Context Actions (Alt+Enter, Option+Return): the fixes that can be found without a compiler.
 * Today that is the import for a known name at the caret that the file does not import yet.
 *
 * Minimal version written by the commands group against the agreed name `importFixFor`; the
 * completion group's version (throws IOException, try/catch, more headers) replaces it.
 */

export interface ContextAction {
  readonly label: string;
  readonly edit: Edit;
}

/** C++ names and the header that declares them, for the names contest code reaches for. */
const CPP_HEADERS: Readonly<Record<string, string>> = {
  vector: "vector",
  string: "string",
  map: "map",
  set: "set",
  unordered_map: "unordered_map",
  unordered_set: "unordered_set",
  queue: "queue",
  priority_queue: "queue",
  stack: "stack",
  deque: "deque",
  pair: "utility",
  sort: "algorithm",
  reverse: "algorithm",
  max_element: "algorithm",
  min_element: "algorithm",
  cout: "iostream",
  cin: "iostream",
  setprecision: "iomanip",
  accumulate: "numeric",
};

function wordAt(text: string, caret: number): string {
  let start = caret;
  let end = caret;
  while (start > 0 && /\w/.test(text[start - 1] ?? "")) start -= 1;
  while (end < text.length && /\w/.test(text[end] ?? "")) end += 1;
  return text.slice(start, end);
}

/** Inserts `line` after the last line matching `existing`, else at the top. Keeps the caret. */
function insertLine(state: EditState, line: string, existing: RegExp): Edit {
  const lines = state.text.split("\n");
  let at = 0;
  let offset = 0;
  lines.forEach((current, index) => {
    if (existing.test(current)) at = index + 1;
  });
  for (let index = 0; index < at; index += 1) offset += (lines[index]?.length ?? 0) + 1;
  const insert = `${line}\n`;
  const shift = offset <= state.selectionStart ? insert.length : 0;
  return {
    from: offset,
    to: offset,
    insert,
    selectionStart: state.selectionStart + shift,
    selectionEnd: state.selectionEnd + shift,
  };
}

function javaFix(state: EditState, name: string, profile: LanguageProfile): ContextAction | null {
  const item = profile.globals.find((candidate) => candidate.kind === "type" && candidate.insertText === name);
  const pkg = item?.detail;
  if (pkg === undefined || pkg === "java.lang" || !pkg.startsWith("java")) return null;
  const imported = new RegExp(`^\\s*import\\s+${pkg.replace(/\./g, "\\.")}\\.(\\*|${name})\\s*;`, "m");
  if (imported.test(state.text)) return null;
  const line = `import ${pkg}.${name};`;
  return { label: `Import ${pkg}.${name}`, edit: insertLine(state, line, /^\s*(import|package)\s/) };
}

/** Standard modules whose names are imported with "from X import name". */
const PYTHON_MODULES: ReadonlySet<string> = new Set(["heapq", "collections", "bisect", "math", "itertools", "functools", "string"]);

function pythonFix(state: EditState, name: string, profile: LanguageProfile): ContextAction | null {
  const owner = Object.entries(profile.members).find(
    ([key, items]) => PYTHON_MODULES.has(key) && items.some((item) => /^[\w]+/.exec(item.insertText)?.[0] === name),
  )?.[0];
  if (owner === undefined) return null;
  const imported = new RegExp(`^\\s*from\\s+${owner}\\s+import\\s+.*\\b${name}\\b`, "m");
  if (imported.test(state.text)) return null;
  const line = `from ${owner} import ${name}`;
  return { label: `Import ${name} from ${owner}`, edit: insertLine(state, line, /^\s*(import|from)\s/) };
}

function cppFix(state: EditState, name: string): ContextAction | null {
  const header = CPP_HEADERS[name];
  if (header === undefined) return null;
  if (new RegExp(`#include\\s*<(${header}|bits/stdc\\+\\+\\.h)>`).test(state.text)) return null;
  const line = `#include <${header}>`;
  return { label: `Add ${line}`, edit: insertLine(state, line, /^\s*#include\s/) };
}

export function importFixFor(state: EditState, profile: LanguageProfile): readonly ContextAction[] {
  const name = wordAt(state.text, state.selectionStart);
  if (name === "") return [];
  const fix =
    profile.id === "java" ? javaFix(state, name, profile) : profile.id === "python" ? pythonFix(state, name, profile) : cppFix(state, name);
  return fix === null ? [] : [fix];
}
