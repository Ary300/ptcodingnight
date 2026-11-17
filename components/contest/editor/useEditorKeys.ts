"use client";

import { useCallback, useMemo, useState, type KeyboardEvent, type RefObject } from "react";

import type { Language } from "@/lib/schemas/judge";

import { isCompletionTrigger } from "./completion-session";
import { applyNativeEdit } from "./native-edit";
import { handleKey, profileFor, type Edit, type EditState, type KeyInput, type LanguageProfile } from "./smart";
import { useCompletion, type Completion } from "./useCompletion";

/**
 * Everything a key press in the editor does, as one hook the surface wires to its textarea.
 *
 * The order of the checks is the contract, and it is the order a student meets them in:
 *
 *   1. An IME composition owns every key until it ends.
 *   2. The completion popup, when open, takes the arrows, Escape, Enter and Tab.
 *   3. Escape arms "Tab leaves the editor"; Ctrl/Cmd + Enter submits; an armed Tab leaves.
 *   4. The smart engine (smart/engine.ts) answers IntelliJ's keys for Java, Python and C++.
 *   5. What is left keeps the editor's original behaviour: Tab and Shift+Tab indent and dedent the
 *      selected lines, Enter keeps the indent. JavaScript and Go, which have no profile, live here.
 *
 * Every edit goes through `applyNativeEdit`, so each one is a single native undo step.
 */

const INDENT = "    ";

function lineStartBefore(value: string, index: number): number {
  return value.lastIndexOf("\n", index - 1) + 1;
}

function lineEndAfter(value: string, index: number): number {
  const found = value.indexOf("\n", index);
  return found === -1 ? value.length : found;
}

/** Keys that change nothing on their own, so pressing one leaves the popup as it is. */
const MODIFIER_KEYS: ReadonlySet<string> = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph"]);

function editStateOf(element: HTMLTextAreaElement): EditState {
  return { text: element.value, selectionStart: element.selectionStart, selectionEnd: element.selectionEnd };
}

/** The engine's view of a key. `modifiers` omitted means a bare press, as for an accepted Tab. */
function keyInputOf(
  key: string,
  isMac: boolean,
  modifiers?: Pick<KeyboardEvent<HTMLTextAreaElement>, "shiftKey" | "altKey" | "ctrlKey" | "metaKey">,
): KeyInput {
  return {
    key,
    isMac,
    shiftKey: modifiers?.shiftKey ?? false,
    altKey: modifiers?.altKey ?? false,
    ctrlKey: modifiers?.ctrlKey ?? false,
    metaKey: modifiers?.metaKey ?? false,
  };
}

export interface EditorKeysOptions {
  readonly textareaRef: RefObject<HTMLTextAreaElement | null>;
  readonly language: Language;
  readonly onSubmitShortcut?: () => void;
  /** Moves Line/Col; a programmatic selection fires no `select` event of its own. */
  readonly syncCaret: (element: HTMLTextAreaElement | null) => void;
}

export interface EditorKeys {
  readonly handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly completion: Completion;
  /** Null for a language with no smart profile (JavaScript, Go). */
  readonly profile: LanguageProfile | null;
  readonly isMac: boolean;
  readonly applyKeyEdit: (element: HTMLTextAreaElement, edit: Edit) => void;
  /** Escape was pressed, so the next Tab moves focus out instead of indenting. */
  readonly tabMovesFocus: boolean;
}

export function useEditorKeys({
  textareaRef,
  language,
  onSubmitShortcut,
  syncCaret,
}: EditorKeysOptions): EditorKeys {
  const [tabMovesFocus, setTabMovesFocus] = useState(false);

  /**
   * Apply an edit the way typing would, so Ctrl/Cmd + Z takes it back in one step (see
   * `native-edit.ts`), and move Line/Col with it: a programmatic selection fires no `select`.
   */
  const applyKeyEdit = useCallback(
    (element: HTMLTextAreaElement, edit: Edit) => {
      applyNativeEdit(element, edit);
      syncCaret(element);
    },
    [syncCaret],
  );

  const indentSelection = useCallback(
    (element: HTMLTextAreaElement, dedent: boolean) => {
      const source = element.value;
      const start = element.selectionStart;
      const end = element.selectionEnd;

      if (start === end && !dedent) {
        const caretAfter = start + INDENT.length;
        applyKeyEdit(element, { from: start, to: end, insert: INDENT, selectionStart: caretAfter, selectionEnd: caretAfter });
        return;
      }

      const blockStart = lineStartBefore(source, start);
      const blockEnd = lineEndAfter(source, end);
      const lines = source.slice(blockStart, blockEnd).split("\n");

      let firstDelta = 0;
      let totalDelta = 0;

      const nextLines = lines.map((line, index) => {
        let delta: number;
        let output: string;

        if (dedent) {
          const leading = /^ {1,4}/.exec(line);
          const removed = leading === null ? 0 : leading[0].length;
          output = line.slice(removed);
          delta = -removed;
        } else {
          output = INDENT + line;
          delta = INDENT.length;
        }

        if (index === 0) firstDelta = delta;
        totalDelta += delta;
        return output;
      });

      applyKeyEdit(element, {
        from: blockStart,
        to: blockEnd,
        insert: nextLines.join("\n"),
        selectionStart: Math.max(blockStart, start + firstDelta),
        selectionEnd: Math.max(blockStart, end + totalDelta),
      });
    },
    [applyKeyEdit],
  );

  /**
   * Enter keeps the current indent, and opens one level after `:` or `{`. The fallback for a
   * language with no smart profile (JavaScript, Go); the engine answers Enter for the rest.
   */
  const autoIndent = useCallback(
    (element: HTMLTextAreaElement) => {
      const source = element.value;
      const start = element.selectionStart;
      const end = element.selectionEnd;

      const currentLine = source.slice(lineStartBefore(source, start), start);
      const leading = /^[ \t]*/.exec(currentLine)?.[0] ?? "";
      const opensBlock = /[:{[(]\s*$/.test(currentLine);
      const insert = `\n${leading}${opensBlock ? INDENT : ""}`;
      const caretAfter = start + insert.length;
      applyKeyEdit(element, { from: start, to: end, insert, selectionStart: caretAfter, selectionEnd: caretAfter });
    },
    [applyKeyEdit],
  );

  // Null for JavaScript and Go, which keep the plain behaviour above.
  const profile = useMemo(() => profileFor(language), [language]);
  const completion = useCompletion(textareaRef, profile, language);
  // Cmd is IntelliJ's modifier on a Mac and Ctrl everywhere else. A lazy initializer for the same
  // reason as `fullscreenAvailable`: the platform cannot change while mounted.
  const [isMac] = useState(
    () => typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent),
  );


  /**
   * Accept the popup's active row. Tab on the FIRST row prefers a live template whose abbreviation
   * is exactly what was typed, because "sout" lists the template among other matches and the
   * student pressing Tab means the template. Returns false when there was nothing to do, so the
   * key falls through to its ordinary meaning.
   */
  const acceptCompletion = useCallback(
    (element: HTMLTextAreaElement, viaTab: boolean): boolean => {
      const popup = completion.popup;
      if (popup === null) return false;
      if (viaTab && popup.activeIndex === 0 && profile !== null) {
        const template = handleKey(editStateOf(element), keyInputOf("Tab", isMac), profile);
        if (template !== null) {
          completion.close();
          applyKeyEdit(element, template);
          return true;
        }
      }
      const edit = completion.editFor(element, popup.activeIndex);
      completion.close();
      if (edit === null) return false;
      applyKeyEdit(element, edit);
      return true;
    },
    [applyKeyEdit, completion, isMac, profile],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const element = event.currentTarget;
      // An IME is mid-composition (Chinese, Japanese, Korean input): every key belongs to it.
      if (event.nativeEvent.isComposing) return;

      const plain = !event.altKey && !event.ctrlKey && !event.metaKey;

      // The open popup takes the keys IntelliJ's lookup takes, and only those.
      if (completion.popup !== null && plain) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          completion.move(event.key === "ArrowDown" ? 1 : -1);
          return;
        }
        if (event.key === "Escape") {
          // Closes the list and nothing else: the next Escape is the one that arms Tab to leave.
          event.preventDefault();
          completion.close();
          return;
        }
        if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey) {
          if (acceptCompletion(element, event.key === "Tab")) {
            event.preventDefault();
            if (tabMovesFocus) setTabMovesFocus(false);
            return;
          }
        }
      }

      if (event.key === "Escape") {
        completion.close();
        setTabMovesFocus(true);
        return;
      }

      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        completion.close();
        onSubmitShortcut?.();
        return;
      }

      if (event.key === "Tab" && tabMovesFocus) {
        // Let the browser move focus, then re-arm indenting for next time.
        setTabMovesFocus(false);
        completion.close();
        return;
      }

      // IntelliJ's keys: pairs, "}" snapping back, Enter inside "{}", comment toggle, duplicate,
      // move line, and live templates on Tab. Null means the key is not the engine's.
      const edit =
        profile === null ? null : handleKey(editStateOf(element), keyInputOf(event.key, isMac, event), profile);
      if (edit !== null) {
        event.preventDefault();
        applyKeyEdit(element, edit);
        if (plain && isCompletionTrigger(event.key)) completion.schedule();
        else completion.close();
        if (tabMovesFocus && event.key !== "Tab" && event.key !== "Enter") setTabMovesFocus(false);
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        completion.close();
        indentSelection(element, event.shiftKey);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        completion.close();
        autoIndent(element);
        return;
      }

      // The browser types this key itself; the popup follows what it typed. Alt alone is allowed
      // through because macOS layouts type some brackets and symbols with Option.
      if (isCompletionTrigger(event.key) && !event.ctrlKey && !event.metaKey) {
        completion.schedule();
      } else if (event.key === "Backspace" || event.key === "Delete") {
        if (completion.popup !== null) completion.schedule();
      } else if (!MODIFIER_KEYS.has(event.key)) {
        // Arrows, Home, End, Page keys and shortcuts move the caret or act on the text: either
        // way the word the popup was completing is no longer the one under the caret.
        completion.close();
      }

      if (tabMovesFocus) setTabMovesFocus(false);
    },
    [
      acceptCompletion,
      applyKeyEdit,
      autoIndent,
      completion,
      indentSelection,
      isMac,
      onSubmitShortcut,
      profile,
      tabMovesFocus,
    ],
  );

  return { handleKeyDown, completion, profile, isMac, applyKeyEdit, tabMovesFocus };
}
