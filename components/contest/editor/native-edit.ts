import type { Edit } from "./smart/types";

/**
 * Apply one `Edit` to the textarea the way typing would, so Ctrl/Cmd + Z undoes it in one step.
 *
 * Assigning `value` (what a controlled React input normally does) wipes the browser's undo history
 * in Chrome and Safari: a student who pressed Enter inside "{}" and wanted it back would find
 * Ctrl + Z doing nothing at all. `execCommand("insertText")` over the replaced range is the one
 * API that edits a textarea AND records the step natively. It also fires a real `input` event, so
 * React's `onChange` sees the new text exactly as it sees a keystroke.
 *
 * `execCommand` is deprecated in name only; every engine still implements it for text controls.
 * Where it reports failure, `setRangeText` makes the same change without the undo entry, and a
 * synthetic `input` event tells React about it. React's value tracker sits on the `value` setter,
 * which `setRangeText` never calls, so the tracker still holds the old text and the change is seen.
 *
 * The selection is set last, from the Edit, because the caret an edit wants (inside the "()" of a
 * completed call, on the blank middle line of a split block) is rarely the end of what it inserted.
 */
export function applyNativeEdit(element: HTMLTextAreaElement, edit: Edit): void {
  // A replacement with identical text (Shift+Tab on lines with no indent) would still push an
  // empty step onto the undo stack, and the student's next Ctrl + Z would appear to do nothing.
  const before = element.value;
  const changes = before.slice(edit.from, edit.to) !== edit.insert;
  if (changes) {
    element.setSelectionRange(edit.from, edit.to);
    // An empty insertText is not a delete in every engine; "delete" over a range always is.
    const reported =
      edit.insert === ""
        ? document.execCommand("delete", false)
        : document.execCommand("insertText", false, edit.insert);
    if (!reported || !landed(element.value, before, edit)) {
      fallBack(element, before, edit);
    }
  }
  // Shift+Home leaves the moving end at selectionStart, so the next Shift+Home extends from the anchor.
  element.setSelectionRange(edit.selectionStart, edit.selectionEnd, edit.selectionDirection);
}

/** The text the edit should have produced from `before`. */
export function expectedText(before: string, edit: Edit): string {
  return before.slice(0, edit.from) + edit.insert + before.slice(edit.to);
}

/**
 * Whether `execCommand` really made the edit. Some engines (Firefox before 89, a few embedded
 * webviews, a textarea not focused) return true and change nothing, which would silently drop
 * the student's keystroke.
 */
export function landed(after: string, before: string, edit: Edit): boolean {
  return after === expectedText(before, edit);
}

/**
 * The edit without native undo: `setRangeText` plus a synthetic `input` event for React. Only when
 * the text is still untouched, so a half-applied command is never applied twice.
 */
function fallBack(element: HTMLTextAreaElement, before: string, edit: Edit): void {
  if (element.value !== before) return;
  element.setRangeText(edit.insert, edit.from, edit.to, "end");
  element.dispatchEvent(new Event("input", { bubbles: true }));
}
