"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";

import type { Language } from "@/lib/schemas/judge";

import { commandFor, isGuardedChord, type Chord } from "./commands/keymap";
import type { EditorCommandHooks } from "./commands/useEditorCommands";
import { isCompletionTrigger } from "./completion-session";
import { applyNativeEdit } from "./native-edit";
import { handleKey, profileFor, type Edit, type EditState, type KeyInput, type LanguageProfile } from "./smart";
import { nextTemplateStop, startTemplateSession, type TemplateSession } from "./smart/template-session";
import { useCompletion, type Completion } from "./useCompletion";

/**
 * Everything a key press in the editor does, as one hook the surface wires to its textarea.
 *
 * The order of the checks is the contract, and it is the order a student meets them in:
 *
 *   1. An IME composition owns every key until it ends, including the key that ends it.
 *   2. The completion popup, when open, takes the arrows, Escape, Enter and Tab.
 *   3. A live template being filled in takes Tab and Enter, to move to its next field.
 *   3a. Commands (commands/keymap.ts): Find, Replace, Go to Line, Surround With, Parameter
 *      Info, Quick Documentation, Context Actions, Save, Run, font size, occurrences. An open
 *      bar or info panel is closed by Escape here, before Escape counts toward leaving.
 *   4. Escape twice arms "Tab leaves the editor" (one Escape is an IntelliJ reflex and must not
 *      change what Tab does); plain Ctrl/Cmd + Enter submits, and with Shift it never does;
 *      Ctrl + Space opens completion; an armed Tab leaves.
 *   5. The smart engine (smart/engine.ts) answers IntelliJ's keys for Java, Python and C++.
 *   5a. Browser chords IntelliJ habits press (print, reload, bookmark, Back) that nothing above
 *      answered are prevented, so the page never prints or navigates away from the editor.
 *   6. What is left keeps the editor's original behaviour: Tab and Shift+Tab indent and dedent the
 *      selected lines, Enter keeps the indent. JavaScript and Go, which have no profile, live here.
 *
 * A soft keyboard (Android's Gboard) sends every key as "Unidentified" and the text through input
 * events, so the same engine is also driven from `beforeinput` for those keys.
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

/**
 * The keyCode a browser reports for a key the IME or a soft keyboard owns. Safari fires the key
 * that ends a composition after `compositionend`, with `isComposing` false and this keyCode, so
 * `isComposing` alone lets that Enter through to the engine.
 */
const IME_KEY_CODE = 229;

/** Keys that change nothing on their own, so pressing one leaves the popup as it is. */
const MODIFIER_KEYS: ReadonlySet<string> = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph"]);

function editStateOf(element: HTMLTextAreaElement): EditState {
  return {
    text: element.value,
    selectionStart: element.selectionStart,
    selectionEnd: element.selectionEnd,
    selectionDirection: element.selectionDirection,
  };
}

/** The engine's view of a key. `modifiers` omitted means a bare press, as for an accepted Tab. */
function keyInputOf(
  key: string,
  isMac: boolean,
  modifiers?: Pick<KeyboardEvent<HTMLTextAreaElement>, "shiftKey" | "altKey" | "ctrlKey" | "metaKey" | "code">,
): KeyInput {
  return {
    key,
    isMac,
    shiftKey: modifiers?.shiftKey ?? false,
    altKey: modifiers?.altKey ?? false,
    ctrlKey: modifiers?.ctrlKey ?? false,
    metaKey: modifiers?.metaKey ?? false,
    // The physical key, so Option chords on a Mac match on "Slash" rather than on "\u00f7".
    ...(modifiers?.code === undefined || modifiers.code === "" ? {} : { code: modifiers.code }),
  };
}

function chordOf(event: KeyboardEvent<HTMLTextAreaElement>, isMac: boolean): Chord {
  return {
    key: event.key,
    code: event.code,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    isMac,
  };
}

export interface EditorKeysOptions {
  readonly textareaRef: RefObject<HTMLTextAreaElement | null>;
  readonly language: Language;
  readonly onSubmitShortcut?: () => void;
  /** Moves Line/Col; a programmatic selection fires no `select` event of its own. */
  readonly syncCaret: (element: HTMLTextAreaElement | null) => void;
  /** The editor's commands (find, go to line, surround ...). Absent, only the guards apply. */
  readonly commands?: EditorCommandHooks;
}

export interface EditorKeys {
  readonly handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly completion: Completion;
  /** Null for a language with no smart profile (JavaScript, Go). */
  readonly profile: LanguageProfile | null;
  readonly isMac: boolean;
  readonly applyKeyEdit: (element: HTMLTextAreaElement, edit: Edit) => void;
  /** Escape was pressed twice, so the next Tab moves focus out instead of indenting. */
  readonly tabMovesFocus: boolean;
  /** Ends a live template being filled in: the caret was moved by a click, or focus left. */
  readonly endTemplate: () => void;
}

export function useEditorKeys({
  textareaRef,
  language,
  onSubmitShortcut,
  syncCaret,
  commands,
}: EditorKeysOptions): EditorKeys {
  const [tabMovesFocus, setTabMovesFocus] = useState(false);
  // One Escape seen with nothing to dismiss; a second in a row arms Tab to leave.
  const escapeOnce = useRef(false);
  // The live template being filled in, whose next field Tab and Enter move to.
  const template = useRef<TemplateSession | null>(null);
  // The last keydown came from a soft keyboard ("Unidentified", keyCode 229), not an IME.
  const softKey = useRef(false);

  const endTemplate = useCallback(() => {
    template.current = null;
  }, []);

  /**
   * Apply an edit the way typing would, so Ctrl/Cmd + Z takes it back in one step (see
   * `native-edit.ts`), and move Line/Col with it: a programmatic selection fires no `select`.
   */
  const applyKeyEdit = useCallback(
    (element: HTMLTextAreaElement, edit: Edit) => {
      applyNativeEdit(element, edit);
      syncCaret(element);
      // A template with fields starts a session; an edit inside the field being filled (a pair,
      // an accepted name) keeps the one already running.
      if (edit.tabStops !== undefined) template.current = startTemplateSession(element.value, edit);
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
          // One tab or up to four spaces, so code pasted with tab indents can be outdented.
          const leading = /^(?:\t| {1,4})/.exec(line);
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
        // A selection that starts at column 0 keeps its whole lines selected, as IntelliJ's does.
        selectionStart: start === blockStart && start !== end ? blockStart : Math.max(blockStart, start + firstDelta),
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
      const edit = completion.editFor(element, popup.activeIndex, viaTab);
      completion.close();
      if (edit === null) return false;
      applyKeyEdit(element, edit);
      return true;
    },
    [applyKeyEdit, completion, isMac, profile],
  );

  /** Moves to the active template's next field. True when it did, so the key is consumed. */
  const nextTemplateField = useCallback(
    (element: HTMLTextAreaElement): boolean => {
      const session = template.current;
      if (session === null) return false;
      const step = nextTemplateStop(session, editStateOf(element));
      template.current = step?.session ?? null;
      if (step === null) return false;
      completion.close();
      applyNativeEdit(element, step.edit);
      syncCaret(element);
      return true;
    },
    [completion, syncCaret],
  );

  /** Escape with nothing else to dismiss: the second in a row arms Tab to leave the editor. */
  const pressEscape = useCallback(() => {
    completion.close();
    if (template.current !== null) {
      // IntelliJ's Escape ends the template and leaves the caret where it is. It counts as the first
      // of the two Escapes, so Esc, Esc, Tab leaves from inside a template too.
      template.current = null;
      escapeOnce.current = true;
      return;
    }
    if (escapeOnce.current) {
      escapeOnce.current = false;
      setTabMovesFocus(true);
      return;
    }
    escapeOnce.current = true;
  }, [completion]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const element = event.currentTarget;
      const native = event.nativeEvent;
      // An IME is mid-composition (Chinese, Japanese, Korean input), or this key ends one, or a
      // soft keyboard sent it: every such key belongs to the IME or arrives as input instead.
      if (native.isComposing || native.keyCode === IME_KEY_CODE) {
        softKey.current = event.key === "Unidentified";
        return;
      }
      softKey.current = false;

      // An occurrence session (several copies of a name picked) owns the keys that edit them.
      if (commands?.interceptKey(event) === true) return;

      const plain = !event.altKey && !event.ctrlKey && !event.metaKey;
      if (event.key !== "Escape" && !MODIFIER_KEYS.has(event.key)) escapeOnce.current = false;

      // The open popup takes the keys IntelliJ's lookup takes, and only those.
      if (completion.popup !== null && plain) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          completion.move(event.key === "ArrowDown" ? 1 : -1);
          return;
        }
        if (event.key === "PageDown" || event.key === "PageUp") {
          event.preventDefault();
          completion.page(event.key === "PageDown" ? 1 : -1);
          return;
        }
        if (event.key === "Escape") {
          // Closes the list, and counts as the first of the two Escapes that arm "Tab leaves", so
          // the documented Esc, Esc, Tab still leaves while the list is open.
          event.preventDefault();
          completion.close();
          escapeOnce.current = true;
          return;
        }
        // In a template field, Tab moves to the next field unless the student picked a row with the
        // arrows: `fori`, Tab, `n`, Tab must not turn the bound into `not` or `new`.
        if (
          event.key === "Tab" &&
          !event.shiftKey &&
          completion.popup.activeIndex === 0 &&
          template.current !== null &&
          nextTemplateField(element)
        ) {
          event.preventDefault();
          if (tabMovesFocus) setTabMovesFocus(false);
          return;
        }
        // A name typed in full (`sys.stdin.readline`) keeps Enter a newline: the popup never eats one.
        const keepsNewline =
          event.key === "Enter" && completion.typedInFull(element, completion.popup.activeIndex);
        if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey && !keepsNewline) {
          if (acceptCompletion(element, event.key === "Tab")) {
            event.preventDefault();
            if (tabMovesFocus) setTabMovesFocus(false);
            return;
          }
        }
        // "(" and "." accept the row they continue: `printl(` is `println(|)`, `Sys.` is `System.`.
        if (event.key === "(" || event.key === ".") {
          const accepted = completion.acceptOnCharacter(element, event.key);
          if (accepted !== null) {
            completion.close();
            applyKeyEdit(element, accepted);
            if (event.key === "(" && accepted.insert.includes("(")) {
              // The accept already wrote the call's parentheses with the caret inside them.
              event.preventDefault();
              commands?.callOpened(element);
              return;
            }
          }
        }
      }

      // A live template being filled in: Tab or Enter moves to its next field.
      if ((event.key === "Tab" || event.key === "Enter") && plain && !event.shiftKey && nextTemplateField(element)) {
        event.preventDefault();
        if (tabMovesFocus) setTabMovesFocus(false);
        return;
      }

      if (event.key === "Escape") {
        // An open bar or info panel closes first, and closing it is not a step toward leaving.
        if (template.current === null && commands?.escape() === true) {
          event.preventDefault();
          escapeOnce.current = false;
          completion.close();
          return;
        }
        pressEscape();
        return;
      }

      const command = commandFor(chordOf(event, isMac));
      if (command === "completion") {
        // IntelliJ's basic completion: open the list for the word at the caret, on demand. Asked
        // for explicitly, so a name typed in full still lists and a lone suggestion goes straight in.
        event.preventDefault();
        completion.schedule(true);
        return;
      }
      if (command !== null && commands !== undefined) {
        const active = completion.popup?.items[completion.popup.activeIndex];
        if (commands.run(command, element, active)) {
          event.preventDefault();
          if (command !== "quickDoc") completion.close();
          return;
        }
      }

      // Ctrl or Cmd + Enter submits on every platform, as the hint under the editor promises. This is
      // the organizers' settled submit key, so a Mac's Ctrl+Enter submits too.
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.altKey) {
        if (!event.shiftKey) {
          event.preventDefault();
          completion.close();
          onSubmitShortcut?.();
          return;
        }
        // With the popup open, the row is accepted first, then the statement is completed.
        if (completion.popup !== null && profile !== null) acceptCompletion(element, false);
        // Ctrl/Cmd + Shift + Enter is IntelliJ's Complete Current Statement, a reflex in the middle
        // of a line, so it must never submit. The engine completes the statement; with no
        // profile it does nothing at all.
        if (profile === null) {
          event.preventDefault();
          return;
        }
      }

      if (event.key === "Tab" && tabMovesFocus) {
        // Let the browser move focus, then re-arm indenting for next time.
        setTabMovesFocus(false);
        completion.close();
        template.current = null;
        return;
      }

      // IntelliJ's keys: pairs, "}" snapping back, Enter inside "{}", comment toggle, duplicate,
      // move line, and live templates on Tab. Null means the key is not the engine's.
      const edit =
        profile === null ? null : handleKey(editStateOf(element), keyInputOf(event.key, isMac, event), profile);
      if (edit !== null) {
        event.preventDefault();
        applyKeyEdit(element, edit);
        if (event.key === "(" && plain) commands?.callOpened(element);
        if (plain && isCompletionTrigger(event.key)) completion.schedule();
        else completion.close();
        if (tabMovesFocus && event.key !== "Tab" && event.key !== "Enter") setTabMovesFocus(false);
        return;
      }

      // A browser chord nobody above answered: print, reload, bookmark, Back. Nothing happens.
      if (isGuardedChord(chordOf(event, isMac))) {
        event.preventDefault();
        completion.close();
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
        // A modified Enter nobody answered (Ctrl+Shift+Enter on a Mac) does nothing, rather than
        // a newline the student did not ask for.
        if (plain) autoIndent(element);
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
        if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key.startsWith("Page")) {
          template.current = null;
        }
      }

      // A modifier on its own (the Shift of Shift+Tab) keeps "Tab leaves" armed.
      if (tabMovesFocus && !MODIFIER_KEYS.has(event.key)) setTabMovesFocus(false);
    },
    [
      acceptCompletion,
      applyKeyEdit,
      autoIndent,
      commands,
      completion,
      indentSelection,
      isMac,
      nextTemplateField,
      onSubmitShortcut,
      pressEscape,
      profile,
      tabMovesFocus,
    ],
  );

  /*
    A soft keyboard (Gboard on Android) reports every key as "Unidentified" with keyCode 229, and
    the character only arrives as input. The keydown handler cannot see which key it was, so the
    engine answers the character here instead, before the browser inserts it: `(` still pairs and
    the popup still opens on a phone.
  */
  const onSoftInput = useRef<(event: InputEvent) => void>(() => undefined);
  useEffect(() => {
    onSoftInput.current = (event: InputEvent) => {
      const element = textareaRef.current;
      if (!softKey.current || element === null || event.isComposing) return;
      if (event.inputType === "insertCompositionText") {
        completion.schedule();
        return;
      }
      if (event.inputType !== "insertText" || event.data === null) return;
      const typed = event.data;
      const edit =
        typed.length === 1 && profile !== null
          ? handleKey(editStateOf(element), keyInputOf(typed, isMac), profile)
          : null;
      if (edit !== null) {
        event.preventDefault();
        // The edit inserts through insertText too; it must not be answered a second time.
        softKey.current = false;
        applyKeyEdit(element, edit);
      }
      if (typed.length > 0 && [...typed].every((ch) => isCompletionTrigger(ch))) completion.schedule();
      else completion.close();
    };
  }, [applyKeyEdit, completion, isMac, profile, textareaRef]);

  useEffect(() => {
    const element = textareaRef.current;
    if (element === null) return;
    const listener = (event: InputEvent) => onSoftInput.current(event);
    element.addEventListener("beforeinput", listener);
    return () => element.removeEventListener("beforeinput", listener);
  }, [textareaRef]);

  return { handleKeyDown, completion, profile, isMac, applyKeyEdit, tabMovesFocus, endTemplate };
}
