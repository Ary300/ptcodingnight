/**
 * Indent guides: the faint vertical lines IntelliJ draws at each indent level.
 *
 * Pure geometry in columns and lines. A guide at column C runs down every consecutive line whose
 * leading whitespace is wider than C, so it never crosses a glyph. Blank lines take the smaller
 * indent of their neighbours, so a guide does not break at the empty line between two statements
 * of the same block, and stops where the block ends.
 *
 * Level zero is not drawn: it would sit on the gutter's own border.
 */

export interface IndentGuide {
  /** Visual column, 0-based, with tabs expanded. */
  readonly column: number;
  /** 1-based, inclusive. */
  readonly fromLine: number;
  /** 1-based, inclusive. */
  readonly toLine: number;
}

/** Past this many lines the guides are skipped rather than slowing every keystroke. */
export const GUIDE_LINE_CAP = 5000;

/** The visual width of a line's leading whitespace, or null for a blank line. */
export function indentWidth(line: string, tabSize: number): number | null {
  let width = 0;
  for (const char of line) {
    if (char === " ") width += 1;
    else if (char === "\t") width += tabSize - (width % tabSize);
    else if (char !== "\r") return width;
  }
  return null;
}

function nearestIndent(raw: readonly (number | null)[], from: number, step: 1 | -1): number {
  for (let index = from; index >= 0 && index < raw.length; index += step) {
    const value = raw[index];
    if (value !== null && value !== undefined) return value;
  }
  return 0;
}

export function indentGuides(source: string, unit = 4, tabSize = 4): readonly IndentGuide[] {
  const lines = source.split("\n");
  if (lines.length > GUIDE_LINE_CAP || unit <= 0) return [];

  const raw = lines.map((line) => indentWidth(line, tabSize));
  const widths = raw.map((width, index) =>
    width ?? Math.min(nearestIndent(raw, index - 1, -1), nearestIndent(raw, index + 1, 1)),
  );

  const guides: IndentGuide[] = [];
  const deepest = Math.max(0, ...widths);
  for (let column = unit; column < deepest; column += unit) {
    let start: number | null = null;
    for (let index = 0; index <= widths.length; index += 1) {
      const inside = index < widths.length && (widths[index] ?? 0) > column;
      if (inside && start === null) start = index;
      if (!inside && start !== null) {
        guides.push({ column, fromLine: start + 1, toLine: index });
        start = null;
      }
    }
  }
  return guides;
}
