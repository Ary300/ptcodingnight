import type { Edit } from "./smart/types";
import { clampSelection, createSelectionMemory, type SelectionMemory } from "./undo-selection";

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
  const beforeSelection = [element.selectionStart, element.selectionEnd] as const;
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
    } else {
      memoryOf(element).record(before, beforeSelection, element.value, [edit.selectionStart, edit.selectionEnd]);
    }
  }
  // Shift+Home leaves the moving end at selectionStart, so the next Shift+Home extends from the anchor.
  element.setSelectionRange(edit.selectionStart, edit.selectionEnd, edit.selectionDirection);
}

const memories = new WeakMap<HTMLTextAreaElement, SelectionMemory>();

/**
 * The element's undo selection memory (undo-selection.ts), created with the one `input` listener
 * that puts the caret back after the browser's own undo or redo of a smart edit.
 */
function memoryOf(element: HTMLTextAreaElement): SelectionMemory {
  const known = memories.get(element);
  if (known !== undefined) return known;
  const memory = createSelectionMemory();
  memories.set(element, memory);
  element.addEventListener("input", (event) => {
    const inputType = "inputType" in event ? event.inputType : null;
    const selection =
      inputType === "historyUndo"
        ? memory.afterUndo(element.value)
        : inputType === "historyRedo"
          ? memory.afterRedo(element.value)
          : null;
    if (selection === null) return;
    const [start, end] = clampSelection(selection, element.value.length);
    element.setSelectionRange(start, end);
  });
  return memory;
}

/**
 * Keeps a typed run one undo step in a React-controlled textarea.
 *
 * React writes `defaultValue` on every change to a controlled textarea, which replaces the
 * element's child text node, and Chrome closes its open typing command on that mutation. So every
 * letter became its own undo step: Cmd+Z after typing "hello world" gave "hello worl", where a plain
 * textarea (and IntelliJ) takes the whole run back. Nothing here reads `defaultValue` (no form is
 * reset), so on this one element it is kept as a plain field and React's write touches no DOM.
 */
export function keepTypingUndoable(element: HTMLTextAreaElement): void {
  if (Object.prototype.hasOwnProperty.call(element, "defaultValue")) return;
  let shadow = element.defaultValue;
  Object.defineProperty(element, "defaultValue", {
    configurable: true,
    get: () => shadow,
    set: (next: string) => {
      shadow = next;
    },
  });
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
