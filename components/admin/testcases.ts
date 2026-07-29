import type { TestCaseDraft } from "@/components/admin/contract";

/**
 * Bulk-import parsing for the test case editor. Pure functions, so the two import paths —
 * paste and file upload — cannot disagree about what a case is.
 *
 * Both report problems rather than throwing. An organiser pasting forty cases wants all the
 * bad ones listed at once, not the first one, forty times.
 */

export const CASE_SEPARATOR = "---";
export const IO_SEPARATOR = "===";

export interface BulkParseResult {
  readonly cases: readonly TestCaseDraft[];
  readonly problems: readonly string[];
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `tc-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/**
 * Trailing-newline policy: a single trailing newline is stripped from both sides. Judges
 * compare with the whitespace-normalizing comparator by default, but the editor should show
 * the organiser exactly what will be stored, and an invisible trailing blank line is the
 * classic "why is this WA" of contest authoring.
 */
function trimTrailingNewline(text: string): string {
  return text.replace(/\n+$/, "");
}

/**
 * Paste format, chosen because it survives a spreadsheet copy and a text editor equally:
 *
 * ```
 * <input>
 * ===
 * <expected output>
 * ---
 * <input>
 * ===
 * <expected output>
 * ```
 */
export function parseBulkTestCases(text: string, startOrdinal: number): BulkParseResult {
  const source = normalizeNewlines(text).trim();
  if (source.length === 0) return { cases: [], problems: ["Nothing pasted."] };

  const blocks = source.split(new RegExp(`^${CASE_SEPARATOR}\\s*$`, "m"));
  const cases: TestCaseDraft[] = [];
  const problems: string[] = [];

  blocks.forEach((block, index) => {
    const label = `Case ${index + 1}`;
    if (block.trim().length === 0) {
      problems.push(`${label}: empty block, skipped.`);
      return;
    }

    const parts = block.split(new RegExp(`^${IO_SEPARATOR}\\s*$`, "m"));
    if (parts.length < 2) {
      problems.push(`${label}: no "${IO_SEPARATOR}" line separating input from expected output.`);
      return;
    }
    if (parts.length > 2) {
      problems.push(`${label}: more than one "${IO_SEPARATOR}" line; skipped rather than guessed.`);
      return;
    }

    const input = trimTrailingNewline((parts[0] ?? "").replace(/^\n+/, ""));
    const expectedOutput = trimTrailingNewline((parts[1] ?? "").replace(/^\n+/, ""));

    if (expectedOutput.length === 0) {
      problems.push(`${label}: expected output is empty. If that is intentional, add it by hand.`);
      return;
    }

    cases.push({
      id: nextId(),
      ordinal: startOrdinal + cases.length,
      input,
      expectedOutput,
      isSample: false,
      points: 0,
      group: null,
    });
  });

  return { cases, problems };
}

export interface UploadedFile {
  readonly name: string;
  readonly text: string;
}

const INPUT_EXT = /\.(in|input|txt)$/i;
const OUTPUT_EXT = /\.(out|output|ans|expected)$/i;

function stemOf(name: string): string {
  return name.replace(/\.[^.]+$/, "").toLowerCase();
}

/**
 * Pairs uploaded files by stem: `01.in` with `01.out`, `case3.input` with `case3.expected`.
 * An unpaired file is reported, never silently dropped — a missing `.out` means a case that
 * would otherwise ship with an empty expected output and fail every correct submission.
 */
export function pairUploadedFiles(
  files: readonly UploadedFile[],
  startOrdinal: number,
): BulkParseResult {
  const inputs = new Map<string, string>();
  const outputs = new Map<string, string>();
  const problems: string[] = [];

  for (const file of files) {
    if (INPUT_EXT.test(file.name)) inputs.set(stemOf(file.name), file.text);
    else if (OUTPUT_EXT.test(file.name)) outputs.set(stemOf(file.name), file.text);
    else problems.push(`${file.name}: unrecognised extension, ignored.`);
  }

  const stems = [...inputs.keys()].sort((a, b) => a.localeCompare(b, "en"));
  const cases: TestCaseDraft[] = [];

  for (const stem of stems) {
    const expected = outputs.get(stem);
    if (expected === undefined) {
      problems.push(`${stem}: input file has no matching output file.`);
      continue;
    }
    cases.push({
      id: nextId(),
      ordinal: startOrdinal + cases.length,
      input: trimTrailingNewline(normalizeNewlines(inputs.get(stem) ?? "")),
      expectedOutput: trimTrailingNewline(normalizeNewlines(expected)),
      isSample: false,
      points: 0,
      group: null,
    });
  }

  for (const stem of outputs.keys()) {
    if (!inputs.has(stem)) problems.push(`${stem}: output file has no matching input file.`);
  }

  return { cases, problems };
}

/** Ordinals are positional and must stay dense after an insert or a delete. */
export function renumber(cases: readonly TestCaseDraft[]): readonly TestCaseDraft[] {
  return cases.map((testCase, index) => ({ ...testCase, ordinal: index }));
}

export function totalPoints(cases: readonly TestCaseDraft[]): number {
  return cases.reduce((sum, c) => sum + (c.isSample ? 0 : c.points), 0);
}

/**
 * Two cases with identical input and different expected output. No reference solution can
 * pass both, so this is a data error that would otherwise only surface as an unexplainable
 * WA during the contest. Checkable without running anything.
 */
export function contradictoryCases(cases: readonly TestCaseDraft[]): readonly TestCaseDraft[] {
  const byInput = new Map<string, string>();
  const bad: TestCaseDraft[] = [];

  for (const testCase of cases) {
    const key = testCase.input.trim();
    const seen = byInput.get(key);
    if (seen === undefined) byInput.set(key, testCase.expectedOutput.trim());
    else if (seen !== testCase.expectedOutput.trim()) bad.push(testCase);
  }
  return bad;
}

/** Authoring problems that should stop a problem leaving DRAFT. */
export function testCaseWarnings(cases: readonly TestCaseDraft[]): readonly string[] {
  const warnings: string[] = [];
  if (cases.length === 0) return ["No test cases yet."];
  if (!cases.some((c) => c.isSample)) warnings.push("No sample case: students get no worked example.");
  if (totalPoints(cases) === 0) {
    warnings.push("Every hidden case is worth 0 points, so the problem cannot score anything.");
  }
  const blankInputs = cases.filter((c) => c.input.trim().length === 0).length;
  if (blankInputs > 0) warnings.push(`${blankInputs} case(s) have an empty input.`);
  return warnings;
}
