"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { docFor } from "../smart/docs";
import { importFixFor, type ContextAction } from "../smart/import-fix";
import { reindentPaste } from "../smart/paste";
import { signaturesFor } from "../smart/signatures";
import { surround, surroundChoicesFor, type SurroundChoice } from "../smart/surround";
import type { CompletionItem, EditState, LanguageProfile } from "../smart/types";

import { CommandMenu } from "./CommandMenu";
import { applyInEditor, belowCaret, revealOffset, selectInEditor } from "./editor-dom";
import { caretKey, clampFontSize, readCaret, readFontSize, writeCaret, writeFontSize } from "./editor-memory";
import { offsetOf, type MatchRange } from "./find";
import { FindBar } from "./FindBar";
import { GoToLineBar } from "./GoToLineBar";
import { InfoPopup, type InfoContent } from "./InfoPopup";
import type { CommandId } from "./keymap";
import {
  addAllOccurrences,
  addNextOccurrence,
  moveInOccurrences,
  removeOccurrence,
  secondaryCarets,
  startOccurrences,
  typeInOccurrences,
  type OccurrenceKey,
  type OccurrenceSession,
  type SessionStep,
} from "./occurrences";
import { useFind } from "./useFind";

/**
 * The editor's commands: Find and Replace, Go to Line, Surround With, Parameter Info, Quick
 * Documentation, Show Context Actions, multiple occurrences, Save, Run, font size, paste cleanup
 * and the remembered caret. `useEditorKeys` decides WHEN a key is a command (see `keymap.ts`);
 * this hook performs it and owns the bars and popups it opens.
 */

export interface EditorCommandHooks {
  /** Performs a command. True when the key was used, so the caller prevents the browser's action. */
  readonly run: (id: CommandId, element: HTMLTextAreaElement, activeItem?: CompletionItem) => boolean;
  /** Keys an occurrence session owns. True when consumed. Runs before every other key rule. */
  readonly interceptKey: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  /** Escape after the popup and the template: closes the topmost bar or popup. True when it did. */
  readonly escape: () => boolean;
}

export interface EditorCommandsOptions {
  readonly textareaRef: RefObject<HTMLTextAreaElement | null>;
  readonly value: string;
  readonly language: string;
  readonly profile: LanguageProfile | null;
  readonly isMac: boolean;
  readonly caretLine: number;
  readonly caretColumn: number;
  readonly lineCount: number;
  readonly syncCaret: (element: HTMLTextAreaElement | null) => void;
  readonly onSaveShortcut?: () => void;
  readonly onRunShortcut?: () => void;
}

export interface EditorCommands {
  readonly hooks: EditorCommandHooks;
  /** The find and go-to-line strips, rendered between the toolbar and the code. */
  readonly bars: ReactNode;
  /** Menus and info panels, rendered inside the code's positioned wrapper. */
  readonly popups: ReactNode;
  readonly highlights: { readonly matches: readonly MatchRange[]; readonly current: number; readonly carets: readonly number[] };
  /** The editor's font size in px, or null for the stylesheet's default. */
  readonly fontPx: number | null;
  /** A brief status word ("Saved"), or null. */
  readonly notice: string | null;
  /** The textarea's paste handler. */
  readonly onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  /** A click in the code: ends occurrences and closes info panels. */
  readonly onPointerDown: () => void;
  /** Remember the caret and scroll for this problem and language (debounced). */
  readonly rememberCaret: () => void;
  /** Describes the info panel to assistive tech while it is open. */
  readonly describedBy: string | undefined;
}

const NOTICE_MS = 1500;
const REMEMBER_MS = 300;

type MenuState =
  | { readonly kind: "surround"; readonly choices: readonly SurroundChoice[]; readonly top: number; readonly left: number }
  | { readonly kind: "actions"; readonly actions: readonly ContextAction[]; readonly top: number; readonly left: number };

interface InfoState {
  readonly content: InfoContent;
  readonly top: number;
  readonly left: number;
}

function stateOf(element: HTMLTextAreaElement): EditState {
  return { text: element.value, selectionStart: element.selectionStart, selectionEnd: element.selectionEnd };
}

function occurrenceKeyOf(event: KeyboardEvent<HTMLTextAreaElement>): OccurrenceKey | null {
  if (event.ctrlKey || event.metaKey) return null;
  if (event.key === "Backspace" && !event.altKey && !event.shiftKey) return { kind: "backspace" };
  if (event.key === "Delete" && !event.altKey && !event.shiftKey) return { kind: "delete" };
  if (event.key.length === 1) return { kind: "insert", text: event.key };
  return null;
}

const MODIFIER_KEYS: ReadonlySet<string> = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph"]);

export function useEditorCommands(options: EditorCommandsOptions): EditorCommands {
  const { textareaRef, value, language, profile, isMac, syncCaret, onSaveShortcut, onRunShortcut } = options;
  const find = useFind(textareaRef, value, syncCaret);
  const infoId = useId();

  const [gotoOpen, setGotoOpen] = useState(false);
  const gotoInputRef = useRef<HTMLInputElement | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [info, setInfo] = useState<InfoState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const [fontPx, setFontPx] = useState<number | null>(() => (typeof window === "undefined" ? null : readFontSize()));
  const [session, setSessionState] = useState<OccurrenceSession | null>(null);
  const sessionRef = useRef<OccurrenceSession | null>(null);
  const rawPaste = useRef(false);

  const setSession = useCallback((next: OccurrenceSession | null) => {
    sessionRef.current = next;
    setSessionState(next);
  }, []);

  useEffect(() => {
    if (gotoOpen) gotoInputRef.current?.focus();
  }, [gotoOpen]);

  useEffect(
    () => () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  const flash = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  /* ---- the remembered caret, per problem page and language ---- */

  const memoryKey = typeof window === "undefined" ? null : caretKey(window.location.pathname, language);
  // The key whose caret is still to be put back. Set when the problem or language changes, and
  // dropped as soon as the student types or clicks, so a late draft never moves a live caret.
  const pendingRestore = useRef<string | null>(null);
  const restoredFor = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (restoredFor.current !== memoryKey) {
      restoredFor.current = memoryKey;
      pendingRestore.current = memoryKey;
    }
    const key = pendingRestore.current;
    const element = textareaRef.current;
    if (key === null || element === null) return;
    const memory = readCaret(key);
    if (memory === null) {
      pendingRestore.current = null;
      return;
    }
    // The draft or the last submission may still be arriving; wait until the text is long enough.
    if (memory.selectionEnd > element.value.length) return;
    pendingRestore.current = null;
    element.setSelectionRange(memory.selectionStart, memory.selectionEnd);
    element.scrollTop = memory.scrollTop;
    element.scrollLeft = memory.scrollLeft;
    syncCaret(element);
  }, [memoryKey, syncCaret, textareaRef, value]);

  const rememberTimer = useRef<number | null>(null);
  const rememberCaret = useCallback(() => {
    const element = textareaRef.current;
    if (element === null || memoryKey === null) return;
    if (rememberTimer.current !== null) window.clearTimeout(rememberTimer.current);
    const key = memoryKey;
    rememberTimer.current = window.setTimeout(() => {
      writeCaret(key, {
        selectionStart: element.selectionStart,
        selectionEnd: element.selectionEnd,
        scrollTop: Math.round(element.scrollTop),
        scrollLeft: Math.round(element.scrollLeft),
      });
    }, REMEMBER_MS);
  }, [memoryKey, textareaRef]);

  /* ---- multiple occurrences ---- */

  const showStep = useCallback(
    (element: HTMLTextAreaElement, step: SessionStep) => {
      setSession(step.session);
      selectInEditor(element, step.selectionStart, step.selectionEnd);
      syncCaret(element);
    },
    [setSession, syncCaret],
  );

  const endSession = useCallback(() => {
    if (sessionRef.current !== null) setSession(null);
  }, [setSession]);

  const occurrenceCommand = useCallback(
    (id: CommandId, element: HTMLTextAreaElement): boolean => {
      const current = sessionRef.current;
      if (id === "unselectOccurrence") {
        if (current === null) return true;
        const step = removeOccurrence(current);
        if (step === null) setSession(null);
        else showStep(element, step);
        return true;
      }
      const started = current === null ? startOccurrences(element.value, element.selectionStart, element.selectionEnd) : null;
      const base = current ?? started?.session ?? null;
      if (base === null) return true;
      if (id === "selectAllOccurrences") showStep(element, addAllOccurrences(element.value, base));
      else if (started !== null) showStep(element, started);
      else showStep(element, addNextOccurrence(element.value, base));
      return true;
    },
    [setSession, showStep],
  );

  /* ---- popups ---- */

  const showInfo = useCallback((element: HTMLTextAreaElement, content: InfoContent) => {
    setInfo({ content, ...belowCaret(element) });
  }, []);

  const parameterInfo = useCallback(
    (element: HTMLTextAreaElement, quietWhenNone: boolean) => {
      const help = profile === null ? null : signaturesFor(stateOf(element), profile);
      if (help === null) {
        if (quietWhenNone) setInfo(null);
        else showInfo(element, { kind: "none", message: "No parameters" });
        return;
      }
      showInfo(element, { kind: "parameters", signatures: help.signatures, activeParameter: help.activeParameter });
    },
    [profile, showInfo],
  );

  const run = useCallback(
    (id: CommandId, element: HTMLTextAreaElement, activeItem?: CompletionItem): boolean => {
      switch (id) {
        case "save":
          onSaveShortcut?.();
          flash("Saved");
          return true;
        case "run":
          onRunShortcut?.();
          return true;
        case "find":
        case "replace":
          endSession();
          find.openBar(id === "replace");
          return true;
        case "findNext":
        case "findPrevious":
          find.step(id === "findNext" ? 1 : -1);
          return true;
        case "goToLine":
          setGotoOpen(true);
          return true;
        case "fontBigger":
        case "fontSmaller": {
          const base = fontPx ?? Number.parseFloat(window.getComputedStyle(element).fontSize);
          const next = clampFontSize((Number.isFinite(base) ? base : 14) + (id === "fontBigger" ? 1 : -1));
          setFontPx(next);
          writeFontSize(next);
          return true;
        }
        case "selectNextOccurrence":
        case "selectAllOccurrences":
        case "unselectOccurrence":
          return occurrenceCommand(id, element);
        case "parameterInfo":
          parameterInfo(element, false);
          return true;
        case "quickDoc": {
          const doc = profile === null ? null : docFor(stateOf(element), profile, activeItem);
          showInfo(element, doc === null ? { kind: "none", message: "No documentation" } : { kind: "doc", ...doc });
          return true;
        }
        case "surround": {
          if (profile === null) return true;
          setMenu({ kind: "surround", choices: surroundChoicesFor(profile), ...belowCaret(element) });
          return true;
        }
        case "contextActions": {
          const actions = profile === null ? [] : importFixFor(stateOf(element), profile);
          if (actions.length === 0) showInfo(element, { kind: "none", message: "No suggestions" });
          else setMenu({ kind: "actions", actions, ...belowCaret(element) });
          return true;
        }
        default:
          return false;
      }
    },
    [endSession, find, flash, fontPx, occurrenceCommand, onRunShortcut, onSaveShortcut, parameterInfo, profile, showInfo],
  );

  const interceptKey = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
      const element = event.currentTarget;
      if (MODIFIER_KEYS.has(event.key)) return false;
      pendingRestore.current = null;
      const mod = isMac ? event.metaKey : event.ctrlKey;
      // Paste as Plain Text (Mod+Alt+Shift+V) skips the cleanup on the paste that follows.
      rawPaste.current = mod && event.altKey && event.shiftKey && event.code === "KeyV";

      if (info !== null) {
        if (info.content.kind === "parameters" && event.key !== "Escape") {
          window.setTimeout(() => parameterInfo(element, true), 0);
        } else if (event.key !== "Escape") {
          setInfo(null);
        }
      }

      const current = sessionRef.current;
      if (current === null) return false;
      if (event.key === "Escape") {
        event.preventDefault();
        setSession(null);
        const range = current.ranges[current.primary];
        const caret = range === undefined ? element.selectionStart : range[0] + (current.offset ?? range[1] - range[0]);
        element.setSelectionRange(caret, caret);
        syncCaret(element);
        return true;
      }
      if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
        const step = moveInOccurrences(current, event.key === "ArrowLeft" ? -1 : 1);
        if (step === null) {
          setSession(null);
          return false;
        }
        event.preventDefault();
        showStep(element, step);
        return true;
      }
      const key = occurrenceKeyOf(event);
      if (key === null) {
        // Occurrence chords keep the session; everything else ends it and acts as usual.
        const keepsSession =
          (isMac && event.ctrlKey && event.code === "KeyG") || (!isMac && event.altKey && event.code === "KeyJ");
        if (!keepsSession) setSession(null);
        return false;
      }
      event.preventDefault();
      const result = typeInOccurrences(element.value, current, key);
      if (result === null) return true;
      applyInEditor(element, result.edit);
      setSession(result.session);
      syncCaret(element);
      return true;
    },
    [info, isMac, parameterInfo, setSession, showStep, syncCaret],
  );

  const escape = useCallback((): boolean => {
    if (info !== null) {
      setInfo(null);
      return true;
    }
    if (menu !== null) {
      setMenu(null);
      return true;
    }
    if (gotoOpen) {
      setGotoOpen(false);
      return true;
    }
    if (find.open) {
      find.close(false);
      return true;
    }
    return false;
  }, [find, gotoOpen, info, menu]);

  const onPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      endSession();
      if (rawPaste.current || profile === null) {
        rawPaste.current = false;
        return;
      }
      const element = event.currentTarget;
      const edit = reindentPaste(stateOf(element), event.clipboardData.getData("text/plain"), profile);
      if (edit === null) return;
      event.preventDefault();
      applyInEditor(element, edit);
      syncCaret(element);
    },
    [endSession, profile, syncCaret],
  );

  const onPointerDown = useCallback(() => {
    endSession();
    setInfo(null);
    pendingRestore.current = null;
  }, [endSession]);

  const closeMenu = useCallback(() => {
    setMenu(null);
    textareaRef.current?.focus();
  }, [textareaRef]);

  const chooseMenu = useCallback(
    (index: number) => {
      const element = textareaRef.current;
      const current = menu;
      setMenu(null);
      if (element === null || current === null) return;
      element.focus();
      if (current.kind === "surround") {
        const choice = current.choices[index];
        const edit = choice === undefined || profile === null ? null : surround(stateOf(element), choice.kind, profile);
        if (edit !== null) applyInEditor(element, edit);
      } else {
        const action = current.actions[index];
        if (action !== undefined) applyInEditor(element, action.edit);
      }
      syncCaret(element);
    },
    [menu, profile, syncCaret, textareaRef],
  );

  const bars = (
    <>
      {find.open && (
        <FindBar
          query={find.query}
          replacement={find.replacement}
          showReplace={find.showReplace}
          caseSensitive={find.caseSensitive}
          wholeWord={find.wholeWord}
          countLabel={find.countLabel}
          hasMatches={find.matches.length > 0}
          isMac={isMac}
          findInputRef={find.findInputRef}
          onQuery={find.setQuery}
          onReplacement={find.setReplacement}
          onToggleCase={find.toggleCase}
          onToggleWord={find.toggleWord}
          onStep={find.step}
          onReplace={find.replaceCurrent}
          onReplaceAll={find.replaceEvery}
          onClose={() => find.close(true)}
        />
      )}
      {gotoOpen && (
        <GoToLineBar
          inputRef={gotoInputRef}
          currentLine={options.caretLine}
          currentColumn={options.caretColumn}
          lineCount={options.lineCount}
          onClose={() => {
            setGotoOpen(false);
            textareaRef.current?.focus();
          }}
          onGo={(line, column) => {
            setGotoOpen(false);
            const element = textareaRef.current;
            if (element === null) return;
            element.focus();
            const offset = offsetOf(element.value, line, column);
            element.setSelectionRange(offset, offset);
            revealOffset(element, offset);
            syncCaret(element);
          }}
        />
      )}
    </>
  );

  const popups = (
    <>
      {menu !== null && (
        <CommandMenu
          title={menu.kind === "surround" ? "Surround with" : "Context actions"}
          items={menu.kind === "surround" ? menu.choices : menu.actions}
          top={menu.top}
          left={menu.left}
          onChoose={chooseMenu}
          onClose={closeMenu}
        />
      )}
      {info !== null && <InfoPopup id={infoId} content={info.content} top={info.top} left={info.left} />}
    </>
  );

  const highlights =
    session !== null
      ? { matches: session.ranges, current: session.offset === null ? session.primary : -1, carets: secondaryCarets(session) }
      : { matches: find.matches, current: find.current, carets: [] };

  return {
    hooks: { run, interceptKey, escape },
    bars,
    popups,
    highlights,
    fontPx,
    notice,
    onPaste,
    onPointerDown,
    rememberCaret,
    describedBy: info === null ? undefined : infoId,
  };
}
