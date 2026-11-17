import type { EditorDiagnostic } from "../decorations/diagnostics";

/**
 * IntelliJ's Next and Previous Highlighted Error (F2 and Shift+F2): the error line after, or
 * before, the caret's line, wrapping round the file. Pure, so the order is a unit test.
 *
 * Several marks on one line count once, the first of them, because the caret can only stand on
 * a line once and a second press must move on to the next line rather than stay put.
 */
export function nextDiagnostic(
  items: readonly EditorDiagnostic[],
  caretLine: number,
  direction: 1 | -1,
): EditorDiagnostic | null {
  const byLine = new Map<number, EditorDiagnostic>();
  for (const item of items) if (!byLine.has(item.line)) byLine.set(item.line, item);
  const ordered = [...byLine.values()].sort((a, b) => a.line - b.line);
  if (ordered.length === 0) return null;
  if (direction === 1) return ordered.find((item) => item.line > caretLine) ?? ordered[0] ?? null;
  return [...ordered].reverse().find((item) => item.line < caretLine) ?? ordered[ordered.length - 1] ?? null;
}
