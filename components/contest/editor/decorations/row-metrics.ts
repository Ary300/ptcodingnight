/**
 * The editor's row pitch, as one whole number of pixels shared by every layer.
 *
 * The caret-row tint and the indent guides are absolutely positioned, so their offsets are
 * arithmetic: padding plus (line - 1) rows. The text, the textarea and the gutter are laid out by
 * the browser, row by row. With a unitless `line-height: 1.3` the arithmetic said 20.8px per row
 * at 16px, and WebKit lays a line box out at a whole 20px. The difference is 0.8px a row, which
 * by line 17 put the tint 12.8px (most of a row) below the line it belonged to. Blink rounds to
 * 1/64px instead, so it was invisible there and visible on a Mac.
 *
 * A whole pixel is the one value both sides compute identically in every engine, so the line
 * height is set in px and every positioned mark is computed from the same number.
 */

/** The editor's line height as a multiple of its font size. */
export const LINE_HEIGHT_RATIO = 1.3;

/** The row pitch for a font size, rounded to a whole pixel and never below one. */
export function rowPitchPx(fontPx: number): number {
  if (!Number.isFinite(fontPx) || fontPx <= 0) return Math.round(16 * LINE_HEIGHT_RATIO);
  return Math.max(1, Math.round(fontPx * LINE_HEIGHT_RATIO));
}

/**
 * A length of `rows` editor rows. Before the font size is measured the layers still use the
 * unitless ratio, and the marks follow it in `em` so the first frame agrees with itself.
 */
export function rowsLength(rows: number, rowPx: number | null): string {
  return rowPx === null ? `${rows * LINE_HEIGHT_RATIO}em` : `${rows * rowPx}px`;
}
