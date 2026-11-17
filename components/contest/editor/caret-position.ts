/**
 * Where a textarea's caret is drawn, in pixels, measured with a mirror element.
 *
 * A textarea does not report its caret's position, so the completion popup copies the textarea's
 * text metrics onto an off-screen `<div>`, writes the text up to the caret into it, and measures a
 * marker placed at the caret. The mirror is `white-space: pre` because the editor is `wrap="off"`:
 * a line is one row however long it is, which is also what the gutter and the overlay assume.
 *
 * The result is relative to the textarea's padding box with scrolling REMOVED, so a caller adds
 * nothing for padding and subtracts `scrollTop` / `scrollLeft` itself to get the visible spot.
 */

export interface CaretPosition {
  /** Top of the caret's row. */
  readonly top: number;
  /** Left edge of the caret. */
  readonly left: number;
  /** Height of one row, so a popup can sit just under the caret's line. */
  readonly lineHeight: number;
}

/** Every computed property that moves a glyph. Anything not listed cannot change a measurement. */
const COPIED_PROPERTIES = [
  "boxSizing",
  "width",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontFeatureSettings",
  "fontVariationSettings",
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
  "textIndent",
  "textTransform",
] as const;

export function caretPosition(element: HTMLTextAreaElement, offset: number): CaretPosition {
  const style = window.getComputedStyle(element);
  const mirror = document.createElement("div");
  for (const property of COPIED_PROPERTIES) mirror.style[property] = style[property];
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  mirror.style.whiteSpace = "pre";
  mirror.style.overflow = "hidden";
  mirror.setAttribute("aria-hidden", "true");

  const clamped = Math.min(Math.max(offset, 0), element.value.length);
  mirror.textContent = element.value.slice(0, clamped);
  const marker = document.createElement("span");
  // A zero-width marker would collapse to no box at all on an empty row; one space is a glyph
  // wide in a monospace font and its left edge is exactly the caret.
  marker.textContent = " ";
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  try {
    // `offsetTop` / `offsetLeft` are measured from the mirror's padding edge, which is the same
    // origin as the textarea's own content-plus-padding box, so no border arithmetic is needed.
    const parsedLineHeight = Number.parseFloat(style.lineHeight);
    const lineHeight = Number.isFinite(parsedLineHeight)
      ? parsedLineHeight
      : marker.getBoundingClientRect().height;
    return { top: marker.offsetTop, left: marker.offsetLeft, lineHeight };
  } finally {
    mirror.remove();
  }
}
