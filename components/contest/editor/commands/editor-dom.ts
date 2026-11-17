import { caretPosition } from "../caret-position";
import { applyNativeEdit } from "../native-edit";
import type { Edit } from "../smart/types";

/**
 * The few DOM moves every command shares.
 *
 * `execCommand("insertText")` edits whichever element has focus, so an edit started from the find
 * bar's Replace button must put focus in the textarea first, or the replacement lands in the
 * find field. `applyInEditor` does that, then hands focus back to `returnFocus` when given.
 */
export function applyInEditor(element: HTMLTextAreaElement, edit: Edit, returnFocus?: HTMLElement | null): void {
  if (document.activeElement !== element) element.focus({ preventScroll: true });
  applyNativeEdit(element, edit);
  if (returnFocus !== undefined && returnFocus !== null) returnFocus.focus({ preventScroll: true });
}

/** Scrolls the textarea so `offset` sits in the middle of the box, as IntelliJ centres a jump. */
export function revealOffset(element: HTMLTextAreaElement, offset: number): void {
  const position = caretPosition(element, offset);
  const top = position.top - element.clientHeight / 2;
  element.scrollTop = Math.max(0, top);
  const visibleLeft = element.scrollLeft;
  if (position.left < visibleLeft || position.left > visibleLeft + element.clientWidth - 24) {
    element.scrollLeft = Math.max(0, position.left - element.clientWidth / 2);
  }
}

/** Selects a range in the textarea and brings it into view. */
export function selectInEditor(element: HTMLTextAreaElement, start: number, end: number): void {
  element.setSelectionRange(start, end);
  revealOffset(element, start);
}

/** Just under the caret's line, in the coordinates of the textarea's positioned wrapper. */
export function belowCaret(element: HTMLTextAreaElement): { top: number; left: number } {
  const position = caretPosition(element, element.selectionStart);
  return {
    top: Math.max(0, position.top - element.scrollTop + position.lineHeight + 2),
    left: Math.max(0, position.left - element.scrollLeft),
  };
}
