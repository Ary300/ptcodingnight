/**
 * The editor's handle for the rest of the page, and the arithmetic behind "go to line".
 *
 * The Results drawer turns `Main.java:12` into a button; pressing it calls `goTo(12, null)` on
 * this handle, which puts the caret on that line and gives the editor focus.
 */

export interface EditorHandle {
  /** Put the caret at a 1-based line and column (null: the line's first glyph), scroll to it, focus. */
  goTo(line: number, column: number | null): void;
  focus(): void;
}

/**
 * The offset of a 1-based line and column, clamped into the source. A null column lands on the
 * first non-space character, which is where IntelliJ's "Go to line" puts you.
 */
export function offsetOfLineColumn(source: string, line: number, column: number | null): number {
  const lines = source.split("\n");
  const index = Math.min(Math.max(1, Math.floor(line)), lines.length) - 1;
  let start = 0;
  for (let row = 0; row < index; row += 1) start += (lines[row]?.length ?? 0) + 1;
  const text = lines[index] ?? "";
  const within =
    column === null
      ? text.length - text.trimStart().length
      : Math.min(Math.max(1, Math.floor(column)), text.length + 1) - 1;
  return start + within;
}
