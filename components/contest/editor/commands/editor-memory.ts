/**
 * What the editor remembers per browser: where the caret and scroll were in each problem and
 * language, and the editor's font size. Both are conveniences, so every read and write is wrapped:
 * a private window or blocked storage throws, and the editor works the same without them.
 */

export interface CaretMemory {
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly scrollTop: number;
  readonly scrollLeft: number;
}

const CARET_PREFIX = "ptcn.editor.caret.";
const FONT_KEY = "ptcn.editor.fontSize";

export const FONT_MIN_PX = 12;
export const FONT_MAX_PX = 22;

/** One problem page and language, e.g. "/contest/two-sum|JAVA_21". */
export function caretKey(path: string, language: string): string {
  return `${CARET_PREFIX}${path}|${language}`;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Parses a stored record, rejecting anything that is not four non-negative integers. */
export function parseCaretMemory(raw: string | null): CaretMemory | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const { selectionStart, selectionEnd, scrollTop, scrollLeft } = record;
  if (!isCount(selectionStart) || !isCount(selectionEnd) || !isCount(scrollTop) || !isCount(scrollLeft)) return null;
  if (selectionEnd < selectionStart) return null;
  return { selectionStart, selectionEnd, scrollTop, scrollLeft };
}

export function readCaret(key: string): CaretMemory | null {
  try {
    return parseCaretMemory(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function writeCaret(key: string, memory: CaretMemory): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(memory));
  } catch {
    // Storage full or blocked: the caret is a convenience and starts at the top next time.
  }
}

/** A stored size inside the bounds, else null (the editor's default). */
export function clampFontSize(px: number): number {
  return Math.min(FONT_MAX_PX, Math.max(FONT_MIN_PX, Math.round(px)));
}

export function readFontSize(): number | null {
  try {
    const raw = window.localStorage.getItem(FONT_KEY);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? clampFontSize(value) : null;
  } catch {
    return null;
  }
}

export function writeFontSize(px: number): void {
  try {
    window.localStorage.setItem(FONT_KEY, String(clampFontSize(px)));
  } catch {
    // Blocked storage: the size holds for this page only.
  }
}
