"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import type { Language } from "@/lib/schemas/judge";

import { caretPosition } from "./caret-position";
import { insideStringOrComment, isNoOpEdit, stepIndex } from "./completion-session";
import { tokenizeCached } from "./highlight";
import { applyNativeEdit } from "./native-edit";
import {
  acceptsOnCharacter,
  applyCompletion,
  autoPopupSuppressed,
  completionContext,
  completionsFor,
  inDeclarationName,
  insertsSingleSuggestion,
  typedInFull,
} from "./smart/completion";
import type { CompletionContext, CompletionItem, Edit, LanguageProfile } from "./smart/types";

/**
 * The completion popup's state, and the few verbs the surface needs to drive it.
 *
 * Opening is debounced, so a run of fast keystrokes does one lookup instead of one per letter.
 * The wait is short enough that IntelliJ's own popup, which also waits a beat, feels the same.
 * Everything the lookup reads (text, caret, focus) is read from the textarea when the timer
 * fires, never from the keystroke that armed it, so a key that lands in between is never lost.
 */

const DEBOUNCE_MS = 40;

/** Rows the popup shows before it scrolls, and their height, for deciding above or below. */
const VISIBLE_ROWS = 8;
const ROW_PX = 28;
/** Fewer rows than this and the list is a slot, so it may overlap what is under the editor. */
const MIN_ROWS = 3;
const LIST_PADDING_PX = 10;

export interface CompletionPopupState {
  readonly items: readonly CompletionItem[];
  readonly activeIndex: number;
  /** Below the caret's line, or null when the popup sits above it. */
  readonly top: number | null;
  /** Above the caret's line, or null when the popup sits below it. */
  readonly bottom: number | null;
  readonly left: number;
  /** Pixels, so the list scrolls inside the room the editor has rather than spilling past it. */
  readonly maxHeight: number;
}

export interface Completion {
  readonly popup: CompletionPopupState | null;
  /**
   * Look again shortly, after the keystroke in flight has landed. `explicit` is Ctrl+Space: it
   * shows the list even for a name typed in full, and inserts a lone suggestion straight away.
   */
  readonly schedule: (explicit?: boolean) => void;
  readonly close: () => void;
  readonly move: (delta: number) => void;
  readonly setActive: (index: number) => void;
  /**
   * The edit that accepting row `index` performs against the textarea as it is NOW, or null when
   * there is nothing to complete there any more or the accept would change nothing.
   */
  readonly editFor: (element: HTMLTextAreaElement, index: number) => Edit | null;
  /** Whether row `index` is the name the student already typed in full, so Enter is a newline. */
  readonly typedInFull: (element: HTMLTextAreaElement, index: number) => boolean;
  /**
   * The accept that typing `ch` ("(" or ".") performs first, as IntelliJ's lookup does for
   * `printl(` and `Sys.`, or null when the character is only typed.
   */
  readonly acceptOnCharacter: (element: HTMLTextAreaElement, ch: string) => Edit | null;
  /** PageDown and PageUp: a screenful of rows at a time, stopping at either end. */
  readonly page: (direction: 1 | -1) => void;
}

function contextAt(element: HTMLTextAreaElement, profile: LanguageProfile): CompletionContext | null {
  if (element.selectionStart !== element.selectionEnd) return null;
  return completionContext(element.value, element.selectionStart, profile.lineComment);
}

function sameItem(a: CompletionItem, b: CompletionItem): boolean {
  return a.kind === b.kind && a.label === b.label && a.insertText === b.insertText;
}

export function useCompletion(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  profile: LanguageProfile | null,
  language: Language,
): Completion {
  const [popup, setPopup] = useState<CompletionPopupState | null>(null);
  const timer = useRef<number | null>(null);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const close = useCallback(() => {
    cancel();
    setPopup(null);
  }, [cancel]);

  const lookup = useCallback((explicit: boolean) => {
    timer.current = null;
    const element = textareaRef.current;
    if (element === null || profile === null || document.activeElement !== element) {
      setPopup(null);
      return;
    }
    const ctx = contextAt(element, profile);
    // An empty prefix only completes after a qualifier: "System.|" lists members, a bare caret
    // at the start of a line lists nothing.
    if (ctx === null || (ctx.qualifier === null && ctx.prefix === "")) {
      setPopup(null);
      return;
    }
    const text = element.value;
    // The overlay has tokenized this exact text already, so this is a cache hit, not a second pass.
    if (insideStringOrComment(tokenizeCached(text, language), ctx)) {
      setPopup(null);
      return;
    }
    // A new variable's name (`int n`, `Scanner sc`) gets no keyword or template list while typing.
    if (!explicit && inDeclarationName(text, ctx, profile)) {
      setPopup(null);
      return;
    }
    const items = completionsFor(ctx, text, profile);
    const state = { text, selectionStart: element.selectionStart, selectionEnd: element.selectionEnd };
    // While typing, a name already typed in full keeps Enter and Tab for the student
    // (`return n` + Enter is a newline). Ctrl+Space with one suggestion inserts it, as IntelliJ does.
    if (!explicit && autoPopupSuppressed(ctx, items)) {
      setPopup(null);
      return;
    }
    const lone = items[0];
    if (explicit && lone !== undefined && insertsSingleSuggestion(items)) {
      const state = { text, selectionStart: element.selectionStart, selectionEnd: element.selectionEnd };
      const edit = applyCompletion(state, ctx, lone, profile);
      if (!isNoOpEdit(text, edit)) applyNativeEdit(element, edit);
      setPopup(null);
      return;
    }
    // IntelliJ hides its lookup when the one thing it would offer is already typed in full.
    const only = items.length === 1 ? items[0] : undefined;
    if (
      items.length === 0 ||
      (only !== undefined && isNoOpEdit(text, applyCompletion(state, ctx, only, profile.indentUnit)))
    ) {
      setPopup(null);
      return;
    }

    // Aligned with the start of the word being completed, as IntelliJ aligns its list.
    const caret = caretPosition(element, ctx.replaceFrom);
    const rowTop = caret.top - element.scrollTop;
    const left = Math.max(0, caret.left - element.scrollLeft);
    const rowBottom = rowTop + caret.lineHeight;
    if (rowBottom < 0 || rowTop > element.clientHeight) {
      // The word is scrolled out of sight; a popup pointing at nothing helps nobody.
      setPopup(null);
      return;
    }
    // Below the line when the list fits there, above it when it fits there instead, and
    // otherwise on the roomier side, shortened to the room so it never spills past the code.
    // The room is measured against the WINDOW as well as the textarea: in the stacked layout the
    // editor often runs below the fold, and a list opened downward there is drawn off-screen.
    const wanted = Math.min(items.length, VISIBLE_ROWS) * ROW_PX + LIST_PADDING_PX;
    const box = element.getBoundingClientRect();
    const roomBelow = Math.min(element.clientHeight - rowBottom, window.innerHeight - (box.top + rowBottom));
    const roomAbove = Math.min(rowTop, box.top + rowTop);
    const above = wanted > roomBelow && (wanted <= roomAbove || roomAbove > roomBelow);
    const room = above ? roomAbove : roomBelow;
    setPopup({
      items,
      activeIndex: 0,
      top: above ? null : rowBottom,
      bottom: above ? element.offsetHeight - rowTop : null,
      left,
      maxHeight: Math.max(MIN_ROWS * ROW_PX + LIST_PADDING_PX, Math.min(wanted, room)),
    });
  }, [language, profile, textareaRef]);

  const schedule = useCallback((explicit = false) => {
    cancel();
    if (profile === null) return;
    timer.current = window.setTimeout(() => lookup(explicit), DEBOUNCE_MS);
  }, [cancel, lookup, profile]);

  // A different language is a different list, and usually a different buffer too.
  useEffect(() => close, [close, language]);

  // The popup is placed in pixels against the textarea as it was. A window resize or a dragged
  // divider moves the caret out from under it, so either one closes it rather than leaving it
  // hanging past the editor's edge.
  const isOpen = popup !== null;
  useEffect(() => {
    const element = textareaRef.current;
    if (!isOpen || element === null) return;
    window.addEventListener("resize", close);
    const initial = { width: element.offsetWidth, height: element.offsetHeight };
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (element.offsetWidth !== initial.width || element.offsetHeight !== initial.height) close();
          });
    observer?.observe(element);
    return () => {
      window.removeEventListener("resize", close);
      observer?.disconnect();
    };
  }, [close, isOpen, textareaRef]);

  const move = useCallback((delta: number) => {
    setPopup((current) =>
      current === null ? null : { ...current, activeIndex: stepIndex(current.activeIndex, delta, current.items.length) },
    );
  }, []);

  const setActive = useCallback((index: number) => {
    setPopup((current) => (current === null ? null : { ...current, activeIndex: index }));
  }, []);

  const editFor = useCallback(
    (element: HTMLTextAreaElement, index: number): Edit | null => {
      if (profile === null || popup === null) return null;
      const shown = popup.items[index];
      const ctx = contextAt(element, profile);
      if (shown === undefined || ctx === null) return null;
      // The list on screen can be one keystroke behind the text: a letter typed less than the
      // debounce ago has landed but not been looked up. So the accept filters again, the way
      // IntelliJ's lookup filters on every key, and keeps the student's row if it still matches.
      const current = completionsFor(ctx, element.value, profile);
      const item = current.find((candidate) => sameItem(candidate, shown)) ?? current[0];
      if (item === undefined) return null;
      const state = {
        text: element.value,
        selectionStart: element.selectionStart,
        selectionEnd: element.selectionEnd,
      };
      // The profile, not just its indent: an accepted class brings its import in the same edit.
      const edit = applyCompletion(state, ctx, item, profile);
      return isNoOpEdit(state.text, edit) ? null : edit;
    },
    [popup, profile],
  );

  const isTypedInFull = useCallback(
    (element: HTMLTextAreaElement, index: number): boolean => {
      if (profile === null || popup === null) return false;
      const shown = popup.items[index];
      const ctx = contextAt(element, profile);
      return shown !== undefined && ctx !== null && typedInFull(ctx, shown);
    },
    [popup, profile],
  );

  const acceptOnCharacter = useCallback(
    (element: HTMLTextAreaElement, ch: string): Edit | null => {
      if (profile === null || popup === null) return null;
      const shown = popup.items[popup.activeIndex];
      const ctx = contextAt(element, profile);
      if (shown === undefined || ctx === null) return null;
      const current = completionsFor(ctx, element.value, profile);
      const item = current.find((candidate) => sameItem(candidate, shown));
      if (item === undefined || !acceptsOnCharacter(ch, ctx, current, item)) return null;
      const state = { text: element.value, selectionStart: element.selectionStart, selectionEnd: element.selectionEnd };
      const edit = applyCompletion(state, ctx, item, profile);
      return isNoOpEdit(state.text, edit) ? null : edit;
    },
    [popup, profile],
  );

  const page = useCallback((direction: 1 | -1) => {
    setPopup((current) => {
      if (current === null) return null;
      const last = current.items.length - 1;
      const next = Math.max(0, Math.min(last, current.activeIndex + direction * VISIBLE_ROWS));
      return { ...current, activeIndex: next };
    });
  }, []);

  return useMemo(
    () => ({ popup, schedule, close, move, setActive, editFor, typedInFull: isTypedInFull, acceptOnCharacter, page }),
    [acceptOnCharacter, close, editFor, isTypedInFull, move, page, popup, schedule, setActive],
  );
}
