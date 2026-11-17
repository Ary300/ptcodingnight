import { bracketMatchAt, type BracketPairs } from "./brackets";
import type { EditorDiagnostic } from "./diagnostics";
import type { Mark } from "./marks";
import { usageRanges } from "./occurrences";

/**
 * Every mark the overlay draws for one state of the editor, in one pure function so the policy
 * (what shows when) is testable without a DOM.
 */

export interface MarkInput {
  readonly source: string;
  readonly kinds: Uint8Array;
  readonly pairs: BracketPairs;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  /** False while the student is still typing; unmatched brackets wait for the pause. */
  readonly sourceSettled: boolean;
  /** False until the caret has rested; usages wait for it so they do not chase the arrow keys. */
  readonly selectionSettled: boolean;
  /** Already mapped onto `source` (see `mapDiagnostics`). */
  readonly diagnostics: readonly EditorDiagnostic[];
}

/** The line's text from its first glyph to its end, so the underline does not run under the indent. */
export function lineGlyphRange(source: string, line: number): { from: number; to: number } | null {
  const lines = source.split("\n");
  if (line < 1 || line > lines.length) return null;
  let start = 0;
  for (let row = 0; row < line - 1; row += 1) start += (lines[row]?.length ?? 0) + 1;
  const text = lines[line - 1] ?? "";
  const lead = text.length - text.trimStart().length;
  const trail = text.trimEnd().length;
  if (trail <= lead) return null;
  return { from: start + lead, to: start + trail };
}

export function buildMarks(input: MarkInput): readonly Mark[] {
  const { source, kinds, pairs, selectionStart, selectionEnd } = input;
  const marks: Mark[] = [];

  if (input.selectionSettled) {
    for (const range of usageRanges(source, kinds, selectionStart, selectionEnd)) {
      marks.push({ ...range, kind: "usage" });
    }
  }

  for (const diagnostic of input.diagnostics) {
    const range = lineGlyphRange(source, diagnostic.line);
    if (range !== null) marks.push({ ...range, kind: "diagnostic" });
  }

  // A bracket with no partner is in `pairs.unmatched`, so the caret's own bracket needs no
  // separate error case: it is drawn here once the student pauses.
  if (input.sourceSettled) {
    for (const offset of pairs.unmatched) marks.push({ from: offset, to: offset + 1, kind: "bracket-error" });
  }

  if (selectionStart === selectionEnd) {
    const match = bracketMatchAt(source, kinds, pairs, selectionStart);
    if (match !== null && match.partner !== null) {
      marks.push({ from: match.at, to: match.at + 1, kind: "bracket-match" });
      marks.push({ from: match.partner, to: match.partner + 1, kind: "bracket-match" });
    }
  }
  return marks;
}
