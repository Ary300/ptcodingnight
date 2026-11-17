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
  const changes = element.value.slice(edit.from, edit.to) !== edit.insert;
  if (changes) {
    element.setSelectionRange(edit.from, edit.to);
    // An empty insertText is not a delete in every engine; "delete" over a range always is.
    const applied =
      edit.insert === ""
        ? document.execCommand("delete", false)
        : document.execCommand("insertText", false, edit.insert);
    if (!applied) {
      element.setRangeText(edit.insert, edit.from, edit.to, "end");
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  element.setSelectionRange(edit.selectionStart, edit.selectionEnd);
}
