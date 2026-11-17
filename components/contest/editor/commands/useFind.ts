"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { applyInEditor, selectInEditor } from "./editor-dom";
import {
  findAll,
  initialQuery,
  matchAtOrAfter,
  matchCountLabel,
  replaceAll,
  replaceOne,
  stepMatch,
  type MatchRange,
} from "./find";

/**
 * The find bar's state: what is searched for, which match is current, and the verbs the bar and
 * the editor's keys call. Matches are recomputed from the editor's value on every render, so an
 * edit, an undo or a replace is reflected at once.
 */

export interface FindState {
  readonly open: boolean;
  readonly showReplace: boolean;
  readonly query: string;
  readonly replacement: string;
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  readonly matches: readonly MatchRange[];
  /** Index into `matches`, or -1. */
  readonly current: number;
  readonly countLabel: string;
  readonly findInputRef: RefObject<HTMLInputElement | null>;
  readonly openBar: (withReplace: boolean) => void;
  readonly close: (refocus: boolean) => void;
  readonly step: (delta: 1 | -1) => void;
  readonly setQuery: (query: string) => void;
  readonly setReplacement: (replacement: string) => void;
  readonly toggleCase: () => void;
  readonly toggleWord: () => void;
  readonly replaceCurrent: () => void;
  readonly replaceEvery: () => void;
}

export function useFind(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  value: string,
  syncCaret: (element: HTMLTextAreaElement | null) => void,
): FindState {
  const [open, setOpen] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [query, setQueryState] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [currentRaw, setCurrent] = useState(-1);
  const [focusTick, setFocusTick] = useState(0);
  const findInputRef = useRef<HTMLInputElement | null>(null);

  const matches = useMemo(
    () => (open ? findAll(value, query, { caseSensitive, wholeWord }) : []),
    [caseSensitive, open, query, value, wholeWord],
  );
  const current = matches.length === 0 ? -1 : Math.min(Math.max(currentRaw, 0), matches.length - 1);

  useEffect(() => {
    if (focusTick === 0) return;
    const input = findInputRef.current;
    input?.focus();
    input?.select();
  }, [focusTick]);

  const show = useCallback(
    (index: number, list: readonly MatchRange[]) => {
      const element = textareaRef.current;
      const match = list[index];
      setCurrent(index);
      if (element === null || match === undefined) return;
      selectInEditor(element, match[0], match[1]);
      syncCaret(element);
    },
    [syncCaret, textareaRef],
  );

  const openBar = useCallback(
    (withReplace: boolean) => {
      const element = textareaRef.current;
      const seed = element === null ? "" : initialQuery(element.value, element.selectionStart, element.selectionEnd);
      const nextQuery = seed === "" ? query : seed;
      setQueryState(nextQuery);
      setOpen(true);
      setShowReplace((was) => withReplace || (open && was));
      if (element !== null) {
        const list = findAll(element.value, nextQuery, { caseSensitive, wholeWord });
        setCurrent(matchAtOrAfter(list, element.selectionStart));
      }
      setFocusTick((tick) => tick + 1);
    },
    [caseSensitive, open, query, textareaRef, wholeWord],
  );

  const close = useCallback(
    (refocus: boolean) => {
      setOpen(false);
      setShowReplace(false);
      if (refocus) textareaRef.current?.focus();
    },
    [textareaRef],
  );

  const step = useCallback(
    (delta: 1 | -1) => {
      const element = textareaRef.current;
      if (!open) {
        if (query === "" || element === null) {
          openBar(false);
          return;
        }
        // F3 with the bar closed repeats the last search, as IntelliJ does.
        const list = findAll(element.value, query, { caseSensitive, wholeWord });
        const caret = delta === 1 ? element.selectionEnd : element.selectionStart - 1;
        const index = delta === 1 ? matchAtOrAfter(list, caret) : stepMatch(list.length, matchAtOrAfter(list, caret + 1), -1);
        show(index, list);
        return;
      }
      show(stepMatch(matches.length, current, delta), matches);
    },
    [caseSensitive, current, matches, open, openBar, query, show, textareaRef, wholeWord],
  );

  const setQuery = useCallback(
    (next: string) => {
      setQueryState(next);
      const element = textareaRef.current;
      if (element === null) return;
      const list = findAll(element.value, next, { caseSensitive, wholeWord });
      setCurrent(matchAtOrAfter(list, element.selectionStart));
    },
    [caseSensitive, textareaRef, wholeWord],
  );

  const replaceCurrent = useCallback(() => {
    const element = textareaRef.current;
    const match = matches[current];
    if (element === null || match === undefined) return;
    applyInEditor(element, replaceOne(match, replacement), document.activeElement instanceof HTMLElement ? document.activeElement : null);
    syncCaret(element);
    // The next match slides into this index once the value re-renders.
    setCurrent(current);
  }, [current, matches, replacement, syncCaret, textareaRef]);

  const replaceEvery = useCallback(() => {
    const element = textareaRef.current;
    if (element === null) return;
    const edit = replaceAll(element.value, matches, replacement);
    if (edit === null) return;
    applyInEditor(element, edit, document.activeElement instanceof HTMLElement ? document.activeElement : null);
    syncCaret(element);
  }, [matches, replacement, syncCaret, textareaRef]);

  return {
    open,
    showReplace,
    query,
    replacement,
    caseSensitive,
    wholeWord,
    matches,
    current,
    countLabel: matchCountLabel(matches.length, current),
    findInputRef,
    openBar,
    close,
    step,
    setQuery,
    setReplacement,
    toggleCase: () => setCaseSensitive((was) => !was),
    toggleWord: () => setWholeWord((was) => !was),
    replaceCurrent,
    replaceEvery,
  };
}
