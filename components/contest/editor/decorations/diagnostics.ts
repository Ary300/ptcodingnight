import type { Language } from "@/lib/schemas/judge";

/**
 * Compile and runtime errors from the judge, turned into line marks the editor can draw.
 *
 * The post-compile substitute for IntelliJ's live error highlighting. javac, g++ and the Python
 * interpreter each name the line in their own format, and the student should not have to count
 * rows to find it.
 *
 * ## Line numbers need no offset
 *
 * The worker writes the student's source byte for byte to `/work/Main.java`, `/work/main.cpp`,
 * `/work/main.c` or `/work/main.py` (worker/runner.ts, `variant.sourceFile`), and nothing is
 * prepended: the problem's starter, harness included, is already part of what the student edits.
 * So line N in the compiler's output is line N in the editor. The JVM harness runs the student's
 * compiled `Main`, so its stack frames still say `Main.java:N`.
 *
 * ## Only the student's own output reaches this
 *
 * The compiler's stderr, and a SAMPLE test's stderr. Hidden tests never carry a snippet
 * (`sanitizeTestResults` and the worker both refuse), and `errorOutputOf` reads sample rows only.
 */

export interface EditorDiagnostic {
  /** 1-based. */
  readonly line: number;
  /** 1-based, or null when the tool did not say; the caret then goes to the line's first glyph. */
  readonly column: number | null;
  readonly message: string;
}

/** A run's error marks, with the source they describe so later edits can move or drop them. */
export interface DiagnosticsInput {
  readonly source: string;
  readonly items: readonly EditorDiagnostic[];
}

type Family = "java" | "c" | "python" | null;

export function familyOf(language: Language): Family {
  if (language.startsWith("JAVASCRIPT")) return null;
  if (language.startsWith("JAVA")) return "java";
  if (language.startsWith("PYTHON")) return "python";
  if (language.startsWith("CPP") || language.startsWith("C_")) return "c";
  return null;
}

const JAVAC_LINE = /^(?:.*[\\/])?(\w+)\.java:(\d+): (error|warning): (.*)$/;
const JAVA_FRAME = /\((\w+)\.java:(\d+)\)/;
const JAVA_EXCEPTION = /^(?:Exception in thread "[^"]*" )?([\w.$]+(?:Exception|Error)(?::.*)?)$/;
const GCC_LINE = /^(?:.*[\\/])?(main\.(?:cpp|cc|cxx|c)):(\d+)(?::(\d+))?: (?:fatal )?(error|warning): (.*)$/;
const PYTHON_FRAME = /File "(?:[^"]*[\\/])?main\.py", line (\d+)/;
const PYTHON_ERROR = /^([A-Za-z_][\w.]*(?:Error|Exception|Exit|Interrupt|Warning))(?::\s*(.*))?$/;
const CARET_ONLY = /^(\s*)\^[\^~]*\s*$/;

function sortedUnique(items: readonly EditorDiagnostic[]): readonly EditorDiagnostic[] {
  const seen = new Set<number>();
  const kept: EditorDiagnostic[] = [];
  for (const item of items) {
    if (seen.has(item.line)) continue;
    seen.add(item.line);
    kept.push(item);
  }
  return kept.sort((a, b) => a.line - b.line);
}

function parseJava(lines: readonly string[]): readonly EditorDiagnostic[] {
  const found: EditorDiagnostic[] = [];
  lines.forEach((text, index) => {
    const hit = JAVAC_LINE.exec(text);
    if (hit === null) return;
    // javac prints the offending source line and then a caret under the column.
    const caret = CARET_ONLY.exec(lines[index + 2] ?? "");
    found.push({
      line: Number(hit[2]),
      column: caret === null ? null : (caret[1]?.length ?? 0) + 1,
      message: `${hit[3] ?? "error"}: ${hit[4] ?? ""}`.trim(),
    });
  });
  if (found.length > 0) return sortedUnique(found);

  // A runtime exception: the first frame in the student's file is where it was thrown.
  const exception = lines.map((text) => JAVA_EXCEPTION.exec(text.trim())).find((hit) => hit !== null);
  for (const text of lines) {
    const frame = JAVA_FRAME.exec(text);
    if (frame === null) continue;
    return [{ line: Number(frame[2]), column: null, message: exception?.[1] ?? "Exception" }];
  }
  return [];
}

function parseGcc(lines: readonly string[]): readonly EditorDiagnostic[] {
  const found: EditorDiagnostic[] = [];
  for (const text of lines) {
    const hit = GCC_LINE.exec(text);
    if (hit === null) continue;
    found.push({
      line: Number(hit[2]),
      column: hit[3] === undefined ? null : Number(hit[3]),
      message: `${hit[4] ?? "error"}: ${hit[5] ?? ""}`.trim(),
    });
  }
  return sortedUnique(found);
}

function parsePython(lines: readonly string[]): readonly EditorDiagnostic[] {
  // A traceback lists the outermost call first; the last frame in main.py is where it failed.
  let line: number | null = null;
  for (const text of lines) {
    const frame = PYTHON_FRAME.exec(text);
    if (frame !== null) line = Number(frame[1]);
  }
  if (line === null) return [];
  let message = "Error";
  for (const text of lines) {
    const error = PYTHON_ERROR.exec(text.trim());
    if (error !== null) message = error[2] ? `${error[1] ?? ""}: ${error[2]}` : (error[1] ?? message);
  }
  return [{ line, column: null, message }];
}

/** Every line the output names in the student's file, one mark per line, ascending. */
export function parseDiagnostics(language: Language, output: string): readonly EditorDiagnostic[] {
  const lines = output.split(/\r?\n/);
  const family = familyOf(language);
  const parsed =
    family === "java"
      ? parseJava(lines)
      : family === "c"
        ? parseGcc(lines)
        : family === "python"
          ? parsePython(lines)
          : [];
  return parsed.filter((item) => Number.isInteger(item.line) && item.line > 0);
}

/** The shape of a test row this module reads, a subset of `PublicTestResult`. */
export interface ErrorRow {
  readonly verdict: string;
  readonly isSample: boolean;
  readonly diffSnippet: string | null;
}

/**
 * The text that names the error lines: the compiler output, else a sample's compile error row,
 * else the first sample's runtime error. Never a hidden test's anything.
 */
export function errorOutputOf(compileError: string | null, rows: readonly ErrorRow[]): string | null {
  if (compileError !== null && compileError.trim() !== "") return compileError;
  const sampleRows = rows.filter((row) => row.isSample && row.diffSnippet !== null);
  const compile = sampleRows.find((row) => row.verdict === "CE");
  if (compile !== undefined) return compile.diffSnippet;
  const runtime = sampleRows.find((row) => row.verdict === "RE");
  return runtime?.diffSnippet ?? null;
}

/**
 * Carry marks across the student's edits since the run.
 *
 * The lines before the first changed line keep their numbers, the lines after the last changed
 * line shift by however many lines were added or removed, and a mark on a line that was itself
 * edited goes away, as IntelliJ clears a stale error once you touch its line.
 */
export function mapDiagnostics(
  items: readonly EditorDiagnostic[],
  fromSource: string,
  toSource: string,
): readonly EditorDiagnostic[] {
  if (fromSource === toSource || items.length === 0) return items;
  const before = fromSource.split("\n");
  const after = toSource.split("\n");
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const shift = after.length - before.length;
  const firstUnchangedTail = before.length - suffix;
  const kept: EditorDiagnostic[] = [];
  for (const item of items) {
    const index = item.line - 1;
    if (index < prefix) kept.push(item);
    else if (index >= firstUnchangedTail) kept.push({ ...item, line: item.line + shift });
  }
  return kept;
}

/** A piece of error text, and the editor position it names when it names one. */
export interface ErrorTextSegment {
  readonly text: string;
  readonly target: { readonly line: number; readonly column: number | null } | null;
}

const LINK_PATTERN: Readonly<Record<Exclude<Family, null>, RegExp>> = {
  java: /\b(?:\w+\.java):(\d+)()/g,
  c: /\bmain\.(?:cpp|cc|cxx|c):(\d+)(?::(\d+))?/g,
  python: /\bline (\d+)()/g,
};

/**
 * Split compiler or traceback text into plain runs and references such as `Main.java:12`,
 * `main.cpp:12:5` or `line 12`, so each reference can be a button that moves the caret there.
 * Concatenating every segment's text gives back the input exactly.
 */
export function errorTextSegments(language: Language, text: string): readonly ErrorTextSegment[] {
  const family = familyOf(language);
  if (family === null) return [{ text, target: null }];
  const pattern = new RegExp(LINK_PATTERN[family].source, "g");
  // javac's column is the caret two lines down, not part of the reference; borrow it.
  const parsedColumn = new Map(parseDiagnostics(language, text).map((item) => [item.line, item.column]));
  const segments: ErrorTextSegment[] = [];
  let last = 0;
  for (let hit = pattern.exec(text); hit !== null; hit = pattern.exec(text)) {
    if (family === "python") {
      // Only frames in the student's file: `File "/usr/lib/python3.12/...", line 40` is not theirs.
      const lineStart = text.lastIndexOf("\n", hit.index) + 1;
      if (!/main\.py"/.test(text.slice(lineStart, hit.index))) continue;
    }
    const line = Number(hit[1]);
    if (!Number.isInteger(line) || line < 1) continue;
    if (hit.index > last) segments.push({ text: text.slice(last, hit.index), target: null });
    const column =
      hit[2] === undefined || hit[2] === "" ? (parsedColumn.get(line) ?? null) : Number(hit[2]);
    segments.push({ text: hit[0], target: { line, column } });
    last = hit.index + hit[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), target: null });
  return segments;
}
