"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";

import { applyInEditor } from "./editor-dom";
import type { MatchRange } from "./find";
import {
  addCaret,
  applyMultiKey,
  cloneCaret,
  columnSelection,
  lineStarts,
  offsetAtColumn,
  secondaryCaretOffsets,
  type MultiCaret,
  type MultiKey,
} from "./multi-caret";

/**
 * The textarea side of multiple carets (multi-caret.ts holds the rules): Alt+click, column
 * selection by Alt+Shift+drag or a middle-button drag, Clone Caret Above / Below, and the editing
 * keys and paste applied at every caret. Arrow keys and every other chord return to one caret.
 */

const TAB_SIZE = 4;
const INDENT = "    ";

export interface MultiCaretControls {
  /** The carets while there is more than the textarea's own, else null. */
  readonly carets: MultiCaret | null;
  readonly intercept: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  readonly paste: (event: ClipboardEvent<HTMLTextAreaElement>) => boolean;
  /** True when the press was Alt+click or a column drag, which the caller must leave alone. */
  readonly pointerDown: (event: MouseEvent<HTMLTextAreaElement>) => boolean;
  readonly clone: (element: HTMLTextAreaElement, direction: -1 | 1) => void;
  readonly end: () => void;
  /** Where the match layer draws them: the other carets, and the other carets' selections. */
  readonly highlights: { readonly matches: readonly MatchRange[]; readonly carets: readonly number[] } | null;
}

interface Cell {
  readonly row: number;
  readonly column: number;
}

/** The text cell under a pointer, from the textarea's own metrics: monospace, no wrapping. */
function cellAt(element: HTMLTextAreaElement, clientX: number, clientY: number): Cell {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const lineHeight = Number.parseFloat(style.lineHeight) || 20;
  const probe = document.createElement("span");
  probe.textContent = "0".repeat(20);
  probe.style.font = style.font;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.whiteSpace = "pre";
  document.body.appendChild(probe);
  const charWidth = probe.getBoundingClientRect().width / 20 || 8;
  probe.remove();
  const x = clientX - rect.left - element.clientLeft - (Number.parseFloat(style.paddingLeft) || 0) + element.scrollLeft;
  const y = clientY - rect.top - element.clientTop - (Number.parseFloat(style.paddingTop) || 0) + element.scrollTop;
  return { row: Math.max(0, Math.floor(y / lineHeight)), column: Math.max(0, Math.round(x / charWidth)) };
}

function offsetOfCell(text: string, cell: Cell): number {
  const starts = lineStarts(text);
  const start = starts[Math.min(cell.row, starts.length - 1)] ?? 0;
  return offsetAtColumn(text, start, cell.column, TAB_SIZE);
}

function keyOf(event: KeyboardEvent<HTMLTextAreaElement>, isMac: boolean): MultiKey | null {
  if (event.ctrlKey || event.metaKey) return null;
  if (event.altKey && !isMac) return null;
  if (event.shiftKey && (event.key === "Backspace" || event.key === "Delete" || event.key === "Tab")) return null;
  switch (event.key) {
    case "Backspace":
      return event.altKey ? null : { kind: "backspace" };
    case "Delete":
      return event.altKey ? null : { kind: "delete" };
    case "Enter":
      return event.altKey ? null : { kind: "enter" };
    case "Tab":
      return event.altKey ? null : { kind: "insert", text: INDENT };
    default:
      return event.key.length === 1 ? { kind: "insert", text: event.key } : null;
  }
}

export function useMultiCaret(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  isMac: boolean,
  syncCaret: (element: HTMLTextAreaElement | null) => void,
): MultiCaretControls {
  const [carets, setCaretsState] = useState<MultiCaret | null>(null);
  const caretsRef = useRef<MultiCaret | null>(null);

  const setCarets = useCallback((next: MultiCaret | null) => {
    // One bare caret is just the textarea's own.
    const value = next !== null && next.ranges.length <= 1 && (next.ranges[0]?.[0] ?? 0) === (next.ranges[0]?.[1] ?? 0) ? null : next;
    caretsRef.current = value;
    setCaretsState(value);
  }, []);

  const show = useCallback(
    (element: HTMLTextAreaElement, next: MultiCaret) => {
      setCarets(next);
      const primary = next.ranges[next.primary];
      if (primary !== undefined) element.setSelectionRange(primary[0], primary[1]);
      syncCaret(element);
    },
    [setCarets, syncCaret],
  );

  const end = useCallback(() => {
    if (caretsRef.current !== null) setCarets(null);
  }, [setCarets]);

  const apply = useCallback(
    (element: HTMLTextAreaElement, key: MultiKey): boolean => {
      const current = caretsRef.current;
      if (current === null) return false;
      const result = applyMultiKey(element.value, current, key);
      if (result === null) return true;
      applyInEditor(element, result.edit);
      setCarets(result.carets);
      syncCaret(element);
      return true;
    },
    [setCarets, syncCaret],
  );

  const intercept = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
      const current = caretsRef.current;
      if (current === null) return false;
      const element = event.currentTarget;
      if (event.key === "Escape") {
        event.preventDefault();
        const primary = current.ranges[current.primary];
        setCarets(null);
        if (primary !== undefined) element.setSelectionRange(primary[1], primary[1]);
        syncCaret(element);
        return true;
      }
      // Clone Caret keeps the carets; the command handles it.
      if (event.ctrlKey && event.altKey && event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        return false;
      }
      const key = keyOf(event, isMac);
      if (key === null) {
        if (!["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph"].includes(event.key)) setCarets(null);
        return false;
      }
      event.preventDefault();
      return apply(element, key);
    },
    [apply, isMac, setCarets, syncCaret],
  );

  const paste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>): boolean => {
      if (caretsRef.current === null) return false;
      event.preventDefault();
      return apply(event.currentTarget, { kind: "paste", text: event.clipboardData.getData("text/plain") });
    },
    [apply],
  );

  const pointerDown = useCallback(
    (event: MouseEvent<HTMLTextAreaElement>): boolean => {
      const element = event.currentTarget;
      const columnDrag = event.button === 1 || (event.button === 0 && event.altKey && event.shiftKey);
      const altClick = event.button === 0 && event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey;
      if (!columnDrag && !altClick) {
        end();
        return false;
      }
      event.preventDefault();
      element.focus({ preventScroll: true });
      const anchor = cellAt(element, event.clientX, event.clientY);
      if (altClick) {
        const selection: MatchRange = [element.selectionStart, element.selectionEnd];
        show(element, addCaret(caretsRef.current, selection, offsetOfCell(element.value, anchor)));
        return true;
      }
      show(element, columnSelection(element.value, anchor, anchor, TAB_SIZE));
      const move = (moved: globalThis.MouseEvent) => {
        show(element, columnSelection(element.value, anchor, cellAt(element, moved.clientX, moved.clientY), TAB_SIZE));
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      return true;
    },
    [end, show],
  );

  const clone = useCallback(
    (element: HTMLTextAreaElement, direction: -1 | 1) => {
      const selection: MatchRange = [element.selectionStart, element.selectionEnd];
      show(element, cloneCaret(element.value, caretsRef.current, selection, direction, TAB_SIZE));
    },
    [show],
  );

  // One object per carets state, so the callbacks that close over it stay stable between keys.
  return useMemo(() => {
    const highlights =
      carets === null
        ? null
        : {
            matches: carets.ranges.filter(([start, stop], index) => index !== carets.primary && stop > start),
            carets: secondaryCaretOffsets(carets),
          };
    return { carets, intercept, paste, pointerDown, clone, end, highlights };
  }, [carets, clone, end, intercept, paste, pointerDown]);
}
