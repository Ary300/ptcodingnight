"use client";

import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type UIEvent,
} from "react";

import { Button } from "@/components/ui";

import { MatchLayer } from "./commands/MatchLayer";
import { editorShortcutGroups } from "./commands/shortcuts";
import { useEditorCommands } from "./commands/useEditorCommands";
import { CompletionPopup } from "./CompletionPopup";
import type { DiagnosticsInput, EditorDiagnostic } from "./decorations/diagnostics";
import { offsetOfLineColumn, type EditorHandle } from "./decorations/goto";
import { OverlayContent } from "./decorations/OverlayContent";
import { LINE_HEIGHT_RATIO, rowPitchPx } from "./decorations/row-metrics";
import { useDecorations } from "./decorations/useDecorations";
import { EditorGutter } from "./gutter";
import { EditorStatusBar } from "./EditorStatusBar";
import { tokenizeCached, type TokenKind } from "./highlight";
import { applyNativeEdit, keepTypingUndoable } from "./native-edit";
import { profileFor, type Edit } from "./smart";
import { engineShortcuts } from "./smart/shortcuts";
import { LANGUAGE_LABEL, LANGUAGE_TEMPLATE, type CodeEditorProps } from "./types";
import { useEditorKeys } from "./useEditorKeys";

/**
 * Keeps Grammarly, similar writing assistants and page translation out of the code. They attach
 * to any textarea and rewrite what they think is prose; translation rewrites the overlay.
 */
const NO_WRITING_ASSISTANTS = {
  "data-gramm": "false",
  "data-gramm_editor": "false",
  "data-enable-grammarly": "false",
  translate: "no",
} as const;

/**
 * The editing surface, loaded as its own chunk (see `CodeEditor.tsx`).
 *
 * **This is not Monaco.** `monaco-editor` / `@monaco-editor/react` are not installed and
 * `package.json` is orchestrator-owned (docs/PLAN.md §3), so this scope cannot add them.
 * The dependency request is in the report. What is here is a real, keyboard-complete code
 * editor — line numbers, Tab-to-indent, block indent/dedent, auto-indent, and syntax
 * highlighting through a transparent-text textarea over a coloured layer.
 *
 * ## The overlay, and the one invariant it has
 *
 * A `<pre>` sits exactly under the textarea; the textarea paints its text transparent and keeps
 * only its caret and its selection. So the two layers must agree on **every** metric that moves
 * a glyph: family, size, line height, padding, tab size, and wrapping. They are set together
 * below and in `SHARED_TEXT`, and `tokenize()` guarantees the other half — concatenating its
 * tokens reproduces the source byte for byte. Drop one character there and every line after it
 * slides out from under the caret.
 *
 * `wrap="off"` is part of that agreement rather than a style choice. A soft-wrapped line
 * occupies two rows in the textarea and one row in the gutter, so line 40 stops being the
 * fortieth row the moment anybody writes a long line — which is exactly when they need the
 * number, because the compiler just quoted it. HackerRank scrolls sideways for the same reason.
 *
 * ## Colour on a dark ground, not HackerRank's white one
 *
 * The one place this deliberately departs from the reference screenshots. `--gold`, `--rise`
 * and `--fall` all FAIL AA on `--paper` and are AAA on `--ink` (DESIGN.md §2), so a light code
 * surface leaves exactly two usable hues — and the verdict panel below the editor is dark for
 * that same unavoidable reason. This rationale is about SYNTAX COLOUR, so it covers exactly the
 * two dark surfaces: the statement's code and sample blocks carry no colour and sit pale on the
 * paper statement, the way HackerRank's do.
 *
 * ## Tab, and why it is not simply trapped
 *
 * Tab-to-indent is required (PRD §9.1). Swallowing Tab inside a focusable control is also a
 * classic keyboard trap: a student navigating by keyboard reaches the editor and can never
 * leave it, which fails G9 and, more to the point, means they cannot reach the Submit
 * button.
 *
 * The resolution is the established one, with one change for IntelliJ users: **Tab indents while
 * typing; Escape twice, then Tab, moves focus.** A single Escape is a reflex in IntelliJ (it
 * dismisses things), and when one Escape armed the exit, the next Tab left the editor instead of
 * indenting. The current mode is announced in a live region and is the textarea's description,
 * stated visibly under the editor when stacked and in the shortcuts popover side by side, because
 * an escape hatch nobody knows about is not an escape hatch.
 *
 * ## IntelliJ's keys, and the completion popup
 *
 * Students write Java in IntelliJ, so the editor answers the keys they already use there: pairs
 * that close themselves, "}" snapping to its block, Enter inside "{}" opening a three-line block,
 * Cmd/Ctrl + / and Cmd/Ctrl + D, live templates such as sout and psvm on Tab, and a completion
 * list that opens while a name is typed and after "." or "::". Python gets PyCharm's version and
 * C and C++ get CLion's. The rules are pure functions in `smart/`; `useEditorKeys` decides which
 * of them a key press reaches, and every edit is applied through the browser's own insertText so
 * Ctrl/Cmd + Z undoes it. The popup never takes focus: the textarea keeps it and names the active
 * row with `aria-activedescendant`.
 *
 * ## The toolbar strip
 *
 * HackerRank draws a thin tinted bar directly above the code (hr-challenge-live.png): the
 * language choice on the left (tabs here since 2026-11-16, a dropdown there), small icon
 * actions, reset and full screen, on the right.
 * That strip lives HERE rather than in the workspace, because both of its actions are
 * properties of the editor: reset needs the starter template and the caret, and full screen
 * has to take the toolbar and the status strip with it or the student loses Line/Col and the
 * keyboard hint exactly when the editor fills the monitor.
 *
 * `toolbarStart` is the language picker's seat. The picker belongs to the workspace (it also
 * gates on the problem's allowed languages), so it arrives as a node rather than being
 * imported — and once it sits inside this strip it survives full screen too, which a bar
 * outside this component never can.
 *
 * Reset is destructive and cannot be undone, so a single click never performs it: the icon
 * arms an inline confirm in the same strip, and the safe choice takes focus. `window.confirm`
 * would be simpler and is also a modal the student cannot style, cannot reach reliably from
 * a screen reader in every browser, and looks like a system fault mid-contest.
 */


/**
 * Every metric the two layers must agree on, in one object so they cannot drift apart.
 *
 * `--text-sm` (16px), not `--text-xs`: the editor is the product's primary work surface, and
 * 12.8px there put our code two sizes under HackerRank's ~15.3px. The 1.3 line height keeps the
 * row pitch at 21px, within a pixel of their 20px, so density stays theirs while the glyphs
 * stop being metadata-sized.
 *
 * `lineHeight` here is only the first layout's value. Once the font size is measured the line
 * height becomes a whole number of px (`rowPitchPx`), because the caret-row tint and the indent
 * guides are positioned by arithmetic, and a fractional pitch is rounded one way by the browser's
 * line layout and another by `calc()`. See decorations/row-metrics.ts.
 */
const SHARED_TEXT = {
  fontSize: "var(--text-sm)",
  lineHeight: String(LINE_HEIGHT_RATIO),
  tabSize: 4,
} as const;

/**
 * Token colours. All four accents are AAA on `--ink` (DESIGN.md §2's measured table:
 * gold 13.44, fall 9.60, rise 9.23, paper 18.65), and comments sit at 65% — above the 47%
 * floor for paper on ink with room to spare.
 *
 * Weight and slant carry the same distinctions as the hue does, so the surface still reads
 * with the colour removed (DESIGN.md §3).
 */
const TOKEN_CLASS: Readonly<Record<TokenKind, string>> = {
  plain: "text-paper",
  keyword: "font-semibold text-gold",
  // Weight only, no new hue: types and builtins must stand out from the student's own
  // identifiers in keyword-sparse code (C, Go), and DESIGN.md §3 says distinctions carry in
  // weight before they carry in colour. Paper at 600 next to paper at 400 does exactly that.
  type: "font-semibold text-paper",
  string: "text-rise",
  number: "text-fall",
  comment: "text-paper/65 italic",
  punctuation: "text-paper/75",
};


/**
 * The surface's own props: the shared contract plus the toolbar's left-hand seat.
 *
 * Optional and additive, so every existing caller of `CodeEditorProps` still typechecks.
 * Wiring it up is two edits outside this file: `CodeEditor.tsx` widens its prop type to this
 * interface (the dynamic import already forwards everything), and the workspace moves its
 * `LanguagePicker` out of the header bar into `toolbarStart`.
 */
export interface CodeEditorSurfaceProps extends CodeEditorProps {
  /** Rendered on the toolbar's left, where HackerRank keeps its language dropdown and we keep the language tabs. */
  readonly toolbarStart?: ReactNode;
  /**
   * Fill the parent's height instead of sizing to the textarea, the way full screen does. The
   * problem page's side-by-side layout sets it so the editor takes its pane; omitted, the editor
   * keeps its own floor, cap and resize handle.
   */
  readonly fill?: boolean;
  /** The last run's compile or runtime error lines, marked in the gutter and underlined. */
  readonly diagnostics?: DiagnosticsInput | null;
  /** Lets the Results drawer move the caret to a line the compiler named. */
  readonly handleRef?: Ref<EditorHandle>;
}

export function CodeEditorSurface({
  value,
  onChange,
  language,
  template: templateProp,
  disabled = false,
  onSubmitShortcut,
  onSaveShortcut,
  onRunShortcut,
  label,
  toolbarStart,
  fill = false,
  diagnostics = null,
  handleRef,
}: CodeEditorSurfaceProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLPreElement | null>(null);
  const matchLayerRef = useRef<HTMLPreElement | null>(null);
  const hintId = useId();

  const lineCount = useMemo(() => value.split("\n").length, [value]);

  // Memoised on the two things it depends on: a scan of every character runs on each keystroke
  // otherwise, and a 200 000-character source is a legal submission (SubmitRequestSchema).
  const tokens = useMemo(() => tokenizeCached(value, language), [value, language]);

  /**
   * Where the caret is, as a 1-based line and column.
   *
   * Derived from `selectionStart` on every event that can move it — typing, clicking, arrowing,
   * and the programmatic edits Tab and Enter make. Kept as state rather than read during render
   * because a textarea's selection is not a React input: nothing re-renders when the caret moves
   * on its own.
   */
  const [caret, setCaret] = useState({ line: 1, column: 1 });
  // The selection as offsets, for the on-screen marks (decorations/).
  const [selection, setSelection] = useState<readonly [number, number]>([0, 0]);
  const syncCaret = useCallback((element: HTMLTextAreaElement | null) => {
    if (element === null) return;
    const upTo = element.value.slice(0, element.selectionStart);
    const lines = upTo.split("\n");
    setCaret({ line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 });
    setSelection([element.selectionStart, element.selectionEnd]);
  }, []);

  /**
   * Where the caret belongs after the pending edit commits.
   *
   * A controlled textarea loses its caret on every re-render, so an edit that rewrites `value` —
   * auto-indent, Tab, block dedent — has to put it back.
   */
  const pendingSelection = useRef<readonly [number, number] | null>(null);

  /** Apply an edit and remember where the caret should land. */
  const applyEdit = useCallback(
    (next: string, selectionStart: number, selectionEnd: number) => {
      pendingSelection.current = [selectionStart, selectionEnd];
      onChange(next);
    },
    [onChange],
  );

  /**
   * Restore the caret in a LAYOUT effect, not a `requestAnimationFrame`.
   *
   * rAF runs *after* the frame is committed, and the browser will happily deliver more keystrokes
   * in the meantime — those land wherever the re-render left the caret, which is not where the
   * student is typing. The symptom is scrambled text under fast input, and it is worst after
   * Enter, because auto-indent is the edit that rewrites the value on the most common keystroke:
   *
   *     import sys
   *     ys.stdin.read().split()
   *     (int(a) + int(b))a, b = sprint
   *
   * That is measured output from G9's keyboard spec, not a hypothetical. It went unseen because
   * the suite ran against a stub backend whose editor started empty and whose typing was slower
   * than a real student's.
   *
   * `useLayoutEffect` runs synchronously after the DOM is mutated and before paint, so the caret
   * is correct before the next key is processed.
   */
  useLayoutEffect(() => {
    // A typed run is one undo step, as in a plain textarea (see native-edit.ts). Idempotent.
    if (textareaRef.current !== null) keepTypingUndoable(textareaRef.current);
    const pending = pendingSelection.current;
    if (pending === null) return;
    pendingSelection.current = null;

    const element = textareaRef.current;
    if (element === null) return;
    element.setSelectionRange(pending[0], pending[1]);
  });

  /**
   * Re-align the overlay after any edit, not only after a scroll.
   *
   * Typing past the right edge scrolls the textarea without firing `scroll` in every browser,
   * and the layer underneath would be left a few columns behind — which looks like the colours
   * belong to the wrong characters.
   */
  useLayoutEffect(() => {
    const element = textareaRef.current;
    const overlay = overlayRef.current;
    const gutter = gutterRef.current;
    if (element === null) return;
    if (overlay !== null) {
      overlay.scrollTop = element.scrollTop;
      overlay.scrollLeft = element.scrollLeft;
    }
    if (gutter !== null) gutter.scrollTop = element.scrollTop;
    const marks = matchLayerRef.current;
    if (marks !== null) {
      marks.scrollTop = element.scrollTop;
      marks.scrollLeft = element.scrollLeft;
    }
  });

  /* ---- commands: find, go to line, surround, info popups, save, run, font size ---- */

  const commandProfile = useMemo(() => profileFor(language), [language]);
  // The marks are computed below the commands; F2 reads the latest through this ref.
  const diagnosticsRef = useRef<readonly EditorDiagnostic[]>([]);
  const currentDiagnostics = useCallback(() => diagnosticsRef.current, []);
  // The key hook is created after the commands (it needs their hooks), so a command's edit reaches
  // its `applyKeyEdit` through this ref: Surround With's Tab stops then start a template session.
  const applyKeyEditRef = useRef<((element: HTMLTextAreaElement, edit: Edit) => void) | null>(null);
  const applyCommandEdit = useCallback((element: HTMLTextAreaElement, edit: Edit) => {
    const apply = applyKeyEditRef.current;
    if (apply === null) applyNativeEdit(element, edit);
    else apply(element, edit);
  }, []);
  const [commandIsMac] = useState(
    () => typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent),
  );
  const commands = useEditorCommands({
    textareaRef,
    value,
    language,
    profile: commandProfile,
    isMac: commandIsMac,
    caretLine: caret.line,
    caretColumn: caret.column,
    lineCount,
    syncCaret,
    onSaveShortcut,
    onRunShortcut,
    applyEdit: applyCommandEdit,
    diagnostics: currentDiagnostics,
  });
  /*
    The default size is a token (`--text-sm`), so its px value is read from the textarea once it
    is laid out; Mod+= and Mod+- set px directly. A layout effect, so the px line height lands
    before the first paint and the tint is never drawn at the fractional pitch.
  */
  const [measuredFontPx, setMeasuredFontPx] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (commands.fontPx !== null) return;
    const element = textareaRef.current;
    if (element === null) return;
    const measured = Number.parseFloat(getComputedStyle(element).fontSize);
    if (Number.isFinite(measured) && measured > 0) setMeasuredFontPx(measured);
  }, [commands.fontPx]);
  const fontSizePx = commands.fontPx ?? measuredFontPx;
  const rowPx = fontSizePx === null ? null : rowPitchPx(fontSizePx);
  // Every layer that draws glyphs takes the same size and the same whole-pixel row pitch, or the
  // overlay slides off the caret and the row tint slides off its row.
  const textStyle = useMemo(
    () => ({
      ...SHARED_TEXT,
      ...(commands.fontPx === null ? {} : { fontSize: `${commands.fontPx}px` }),
      ...(rowPx === null ? {} : { lineHeight: `${rowPx}px` }),
    }),
    [commands.fontPx, rowPx],
  );

  /*
    The editor is disabled while a submission is sent, and a disabled textarea loses focus, so the
    student who pressed Mod+Enter found every key after it going nowhere. A submission sent from
    the keyboard gives the focus back once the editor is enabled again.
  */
  const refocusAfterSubmit = useRef(false);
  const submitFromKeys = useMemo(
    () =>
      onSubmitShortcut === undefined
        ? undefined
        : () => {
            refocusAfterSubmit.current = true;
            onSubmitShortcut();
          },
    [onSubmitShortcut],
  );
  useEffect(() => {
    if (disabled || !refocusAfterSubmit.current) return;
    refocusAfterSubmit.current = false;
    textareaRef.current?.focus();
  }, [disabled]);

  const { handleKeyDown, completion, profile, isMac, applyKeyEdit, tabMovesFocus, endTemplate, notePairCaret } =
    useEditorKeys({
    textareaRef,
    language,
    onSubmitShortcut: submitFromKeys,
    syncCaret,
    commands: commands.hooks,
  });
  useEffect(() => {
    applyKeyEditRef.current = applyKeyEdit;
  }, [applyKeyEdit]);

  /* ---- on-screen marks: brackets, usages, caret row, indent guides, error lines ---- */

  // Offsets past the end mean the value changed under a stale selection; clamp rather than mark.
  const decorations = useDecorations({
    value,
    tokens,
    selectionStart: Math.min(selection[0], value.length),
    selectionEnd: Math.min(selection[1], value.length),
    diagnostics,
    indentUnit: profile?.indentUnit.length ?? 4,
  });
  useEffect(() => {
    diagnosticsRef.current = decorations.diagnostics;
  }, [decorations.diagnostics]);

  useImperativeHandle(
    handleRef,
    (): EditorHandle => ({
      focus: () => textareaRef.current?.focus(),
      goTo: (line, column) => {
        const element = textareaRef.current;
        if (element === null) return;
        const offset = offsetOfLineColumn(element.value, line, column);
        completion.close();
        element.focus();
        element.setSelectionRange(offset, offset);
        // Centre the line when it is off screen, as IntelliJ's navigation does.
        const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight) || 20;
        const row = element.value.slice(0, offset).split("\n").length - 1;
        const top = row * lineHeight;
        if (top < element.scrollTop || top + lineHeight > element.scrollTop + element.clientHeight) {
          element.scrollTop = Math.max(0, top - element.clientHeight / 2);
        }
        syncCaret(element);
      },
    }),
    [completion, syncCaret],
  );

  const listboxId = useId();
  const optionId = useCallback((index: number) => `${listboxId}-option-${index}`, [listboxId]);
  // The help line names the modifier this keyboard actually has, and a template this language has.
  const modLabel = isMac ? "Cmd" : "Ctrl";
  const templateExample = profile?.templates[0]?.abbreviation ?? "";

  /* ---- toolbar: reset to the starter template ---- */

  // The problem's own starter when the caller has one, the generic language stub otherwise.
  // Byte equality is the "has the student edited it" predicate: the seeded value IS the
  // template, so any keystroke breaks equality and any reset restores it.
  const template = templateProp ?? LANGUAGE_TEMPLATE[language];
  const pristine = value === template;
  const [confirmingReset, setConfirmingReset] = useState(false);
  const keepButtonRef = useRef<HTMLButtonElement | null>(null);
  const resetButtonRef = useRef<HTMLButtonElement | null>(null);
  const wasConfirming = useRef(false);

  /**
   * Arming swaps the icon for the confirm prompt, which removes the focused element from the
   * DOM — and focus that falls to `<body>` strands a keyboard user. So the prompt's SAFE
   * button takes it on the way in, and on the way out the icon takes it back — unless the
   * reset was CONFIRMED, in which case the value is pristine again, the icon is disabled, and
   * a disabled button ignores `focus()`. Then the editor takes it, which is where the student
   * is headed anyway. In an effect rather than the click handlers, because on the way out the
   * icon is not mounted yet when the handler runs.
   */
  useEffect(() => {
    if (confirmingReset && !wasConfirming.current) keepButtonRef.current?.focus();
    if (!confirmingReset && wasConfirming.current) {
      const icon = resetButtonRef.current;
      if (icon !== null && !icon.disabled) icon.focus();
      else textareaRef.current?.focus();
    }
    wasConfirming.current = confirmingReset;
  }, [confirmingReset]);

  const resetToTemplate = useCallback(() => {
    completion.close();
    applyEdit(template, 0, 0);
    // `setSelectionRange` on a collapsed caret fires no `select` event, so the derived caret
    // state has to be moved by hand or Line/Col keeps showing where the old code ended.
    setCaret({ line: 1, column: 1 });
    setSelection([0, 0]);
    setConfirmingReset(false);
  }, [applyEdit, completion, template]);

  /* ---- toolbar: full screen ---- */

  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Full screen and `fill` size the band the same way: the box decides the height, not the code.
  const fillsBox = isFullscreen || fill;
  // A lazy initializer, not an effect: whether the API exists is a fact about the environment
  // that cannot change while mounted, and the `typeof` guard keeps the read legal if this
  // surface is ever rendered outside its `ssr: false` wrapper. Where it is unavailable
  // (iPhone Safari) the button is hidden entirely rather than rendered to fail.
  const [fullscreenAvailable] = useState(
    () => typeof document !== "undefined" && document.fullscreenEnabled,
  );

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === rootRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const root = rootRef.current;
    if (root === null) return;
    if (document.fullscreenElement === root) {
      void document.exitFullscreen();
      return;
    }
    // A rejection here means the permissions policy forbids it, which `fullscreenEnabled`
    // already reported as false and hid the button — nothing useful to tell the student.
    void root.requestFullscreen().catch(() => undefined);
  }, []);

  /**
   * The band's height comes from the TEXTAREA, never from the gutter.
   *
   * The gutter renders one div per line with nothing constraining it, so on a 46-line file its
   * intrinsic height (~966px) used to stretch the whole flex band while the textarea stayed at
   * its floor (352px). The overlay is `inset-0` of a wrapper that stretches with the band, so
   * everything below the textarea's real bottom was painted code that no click could reach —
   * a click there focused `<body>` — and a forced scroll left the overlay pinned at the top,
   * drawing the caret hundreds of pixels from its glyphs.
   *
   * Pinning the gutter's height to the textarea's measured height makes the textarea the band's
   * only driver: the gutter clips and follows `scrollTop` like the overlay always has. A
   * ResizeObserver rather than a render-time value because the textarea is user-resizable
   * (`resize-y`) and nothing re-renders when the student drags the handle.
   */
  const [gutterHeight, setGutterHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (element === null) return;
    const measure = () => setGutterHeight(element.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /* ---- the language swap ---- */

  /**
   * Choosing a different language re-seeds the whole editor in one frame.
   *
   * The workspace hands down that language's stored draft, or that language's starter when the
   * student has never typed in it — so every glyph in the band, and usually the line count with
   * them, is replaced between two paints of a control that is nowhere near the code. Measured on
   * the practice arena before this: switching Python to Go replaced 89 characters with a Go
   * starter, and the only animation running anywhere in the document during that swap was the
   * dropdown's own chevron rotating back. The band read as a glitch rather than as a swap.
   *
   * `--motion-swap` is the token for content replacing content, and the band is what got
   * replaced, so the band rises.
   *
   * ## Why a class that toggles, and not `key={language}`
   *
   * A keyed wrapper is how the rest of this codebase restarts an entrance, and here it would be
   * wrong: the wrapper contains the TEXTAREA, and remounting a textarea throws away its focus,
   * its selection, its scroll position, and the height the student dragged the resize handle to.
   * Nothing about marking a swap is worth any of those. So the element stays mounted and only the
   * class comes and goes — added in the same commit that carries the new source (a render-phase
   * adjustment, not an effect, so there is no painted frame of the new code sitting still first),
   * removed again when the animation reports itself finished.
   *
   * The animation is transform-only and rides on the wrapper, so it delays nothing: the textarea
   * accepts keystrokes throughout, and a transformed element is hit-tested where it is drawn.
   *
   * A second switch inside 200ms rides the run already in flight rather than restarting it, which
   * is the right answer anyway — the eye is already following one arrival.
   */
  const [shownLanguage, setShownLanguage] = useState(language);
  const [swappingLanguage, setSwappingLanguage] = useState(false);
  if (shownLanguage !== language) {
    setShownLanguage(language);
    setSwappingLanguage(true);
  }

  /** One handler for both followers: the gutter tracks rows, the overlay tracks rows and columns. */
  const syncScroll = useCallback((event: UIEvent<HTMLTextAreaElement>) => {
    const source = event.currentTarget;
    const gutter = gutterRef.current;
    const overlay = overlayRef.current;
    if (gutter !== null) gutter.scrollTop = source.scrollTop;
    if (overlay !== null) {
      overlay.scrollTop = source.scrollTop;
      overlay.scrollLeft = source.scrollLeft;
    }
    const marks = matchLayerRef.current;
    if (marks !== null) {
      marks.scrollTop = source.scrollTop;
      marks.scrollLeft = source.scrollLeft;
    }
  }, []);

  return (
    // `bg-paper` matters only in full screen: a fullscreened element with no background is
    // painted over the UA's black backdrop, and the status strip's ink text vanishes into it.
    <div ref={rootRef} className={fillsBox ? "flex h-full flex-col bg-paper" : "flex flex-col"}>
      {/*
        The thin toolbar HackerRank draws directly above its editor (hr-challenge-live.png): a
        tinted strip, the language tabs on the left, small icon actions on the right. Same
        tint as the workspace's header bar so the two read as one piece of chrome, and no bottom
        border — the dark band underneath is its own edge.

        Icon buttons are 28px squares: the glyph is quiet but the target is not, and each one
        carries an aria-label AND a title, because an unlabelled icon is a riddle in both senses.
      */}
      <div className="flex items-center gap-1 bg-ink/[0.03] px-2 py-1">
        <div className="min-w-0 flex-1">{toolbarStart}</div>

        {confirmingReset ? (
          /*
            The confirm strip replaces the icon in one keystroke, so it rises in over
            --motion-swap. An animation delays paint, never mount: "Keep my code" receives
            focus in the same frame it always did, the entrance just makes the swap readable.
          */
          <span className="motion-swap-in flex flex-wrap items-center justify-end gap-2" role="group" aria-label="Confirm reset">
            <span className="text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
              Replace your code with the starter template?
            </span>
            {/* `danger`, because this is the one click on the page that destroys work. */}
            <Button type="button" variant="danger" size="sm" onClick={resetToTemplate}>
              Reset
            </Button>
            <Button
              ref={keepButtonRef}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setConfirmingReset(false)}
            >
              Keep my code
            </Button>
          </span>
        ) : (
          <button
            ref={resetButtonRef}
            type="button"
            // Disabled while pristine: resetting a template to itself is a no-op button, and a
            // live-looking control that does nothing teaches the student to distrust the rest.
            disabled={disabled || pristine}
            onClick={() => setConfirmingReset(true)}
            aria-label="Reset the editor to the starter template"
            title="Reset to the starter template"
            // The same press grammar as ui/Button: colours and the 3% dip ride one 100ms
            // transition, so the icon buttons stop being the only controls on the page that
            // change state in the same frame as the click.
            className="inline-flex h-7 w-7 items-center justify-center rounded-chip text-ink/70 transition-[color,background-color,transform] duration-[var(--motion-press)] hover:bg-ink/10 hover:text-ink active:scale-[0.97] disabled:cursor-not-allowed disabled:text-ink/30 disabled:hover:bg-transparent disabled:active:scale-100"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2.5 2.5v4H6" />
              <path d="M2.9 6.4a5.5 5.5 0 1 1-.4 2.6" />
            </svg>
          </button>
        )}

        {fullscreenAvailable && (
          <button
            type="button"
            disabled={disabled}
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
            title={isFullscreen ? "Exit full screen" : "Full screen"}
            className="inline-flex h-7 w-7 items-center justify-center rounded-chip text-ink/70 transition-[color,background-color,transform] duration-[var(--motion-press)] hover:bg-ink/10 hover:text-ink active:scale-[0.97] disabled:cursor-not-allowed disabled:text-ink/30 disabled:hover:bg-transparent disabled:active:scale-100"
          >
            {isFullscreen ? (
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 2v4H2" />
                <path d="M10 2v4h4" />
                <path d="M6 14v-4H2" />
                <path d="M10 14v-4h4" />
              </svg>
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2 6V2h4" />
                <path d="M14 6V2h-4" />
                <path d="M2 10v4h4" />
                <path d="M14 10v4h-4" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Find and Replace, and Go to Line: strips between the toolbar and the code. */}
      {commands.bars}

      {/*
        The code area itself: gutter, coloured layer, and the textarea over both. No border and
        no radius — it is one band inside the panel the workspace draws around it, which is how
        HackerRank's editor sits inside its challenge card.

        In full screen the band takes every row the toolbar and status strip leave (`flex-1`),
        with `min-h-0` so it can also SHRINK below its content and scroll instead of pushing the
        status strip off the bottom of the monitor.
      */}
      <div
        // `motion-swap-in` only while a language swap is in flight; see `swappingLanguage`.
        // `animationend` bubbles, so the guard keeps the toolbar's confirm strip — or anything
        // else that grows an entrance inside this band later — from clearing the flag early.
        className={`${swappingLanguage ? "motion-swap-in " : ""}${
          fillsBox ? "flex min-h-0 flex-1 bg-ink" : "flex bg-ink"
        }`}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) setSwappingLanguage(false);
        }}
      >
        {/*
          `height` pins the gutter to the textarea's measured height so its per-line divs can
          never stretch the band past the box the student actually types in. Null only before
          the first layout-effect measurement, which runs before paint.
        */}
        <EditorGutter
          gutterRef={gutterRef}
          lineCount={lineCount}
          caretLine={caret.line}
          diagnostics={decorations.diagnostics}
          style={{ ...textStyle, height: gutterHeight ?? undefined }}
        />

        <div className="relative min-w-0 flex-1">
          {(commands.highlights.matches.length > 0 || commands.highlights.carets.length > 0) && (
            <MatchLayer
              ref={matchLayerRef}
              text={value}
              matches={commands.highlights.matches}
              current={commands.highlights.current}
              carets={commands.highlights.carets}
              style={textStyle}
            />
          )}
          <pre
            ref={overlayRef}
            aria-hidden="true"
            translate="no"
            // `isolate`: the caret row and indent guides paint under the text (decorations/).
            className="notranslate pointer-events-none absolute inset-0 isolate overflow-hidden p-3 font-mono whitespace-pre"
            style={textStyle}
          >
            <OverlayContent
              segments={decorations.segments}
              tokenClass={TOKEN_CLASS}
              guides={decorations.guides}
              caretLine={decorations.collapsed ? caret.line : null}
              rowPx={rowPx}
            />
            {/* A trailing newline leaves the last row blank; this keeps the layer as tall as the
                textarea so the final line never sits over nothing. */}
            {"\n"}
          </pre>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={(event) => {
              syncScroll(event);
              commands.rememberCaret();
              // Typing past the edge scrolls the box; the open popup follows its word.
              if (completion.popup !== null) completion.schedule();
            }}
            // A click puts the caret somewhere else, which ends the lookup and any template being
            // filled in; leaving the editor ends the lookup.
            onMouseDown={(event) => {
              completion.close();
              endTemplate();
              commands.onPointerDown(event);
            }}
            onPaste={commands.onPaste}
            onCopy={commands.onCopy}
            onCut={commands.onCut}
            onBlur={completion.close}
            disabled={disabled}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            wrap="off"
            {...NO_WRITING_ASSISTANTS}
            aria-label={`${label}, ${LANGUAGE_LABEL[language]}`}
            aria-describedby={commands.describedBy === undefined ? hintId : `${hintId} ${commands.describedBy}`}
            // The list is announced through the textarea, which never gives up focus to it.
            aria-autocomplete="list"
            aria-controls={completion.popup === null ? undefined : listboxId}
            aria-activedescendant={
              completion.popup === null ? undefined : optionId(completion.popup.activeIndex)
            }
            onSelect={(event) => {
              syncCaret(event.currentTarget);
              notePairCaret(event.currentTarget);
              commands.rememberCaret();
            }}
            onKeyUp={(event) => {
              syncCaret(event.currentTarget);
              notePairCaret(event.currentTarget);
              commands.rememberCaret();
            }}
            onClick={(event) => {
              syncCaret(event.currentTarget);
              commands.rememberCaret();
            }}
            // `text-transparent` hands the glyphs to the layer underneath and keeps the caret and
            // the selection, which are the two things only a real textarea can draw. The
            // selection therefore needs its own colour: without it, selected text is an invisible
            // block on a dark ground.
            // Shorter on a phone: 22rem of editor plus the statement above it is a lot of
            // scrolling to reach Submit, and the box is resizable anyway. In full screen the
            // band's height is the layout's decision, so the resize handle and the caps go.
            className={`relative block w-full overflow-auto bg-transparent p-3 font-mono text-transparent caret-gold outline-none focus-visible:outline-1! focus-visible:outline-gold/45! focus-visible:outline-offset-[-1px]! selection:bg-paper/25 disabled:cursor-not-allowed ${
              fillsBox ? "h-full resize-none" : "max-h-[70vh] min-h-[16rem] resize-y sm:min-h-[22rem]"
            }`}
            style={textStyle}
          />

          {commands.popups}

          {completion.popup !== null && (
            <CompletionPopup
              id={listboxId}
              items={completion.popup.items}
              activeIndex={completion.popup.activeIndex}
              top={completion.popup.top}
              bottom={completion.popup.bottom}
              left={completion.popup.left}
              maxHeight={completion.popup.maxHeight}
              optionId={optionId}
              onHover={completion.setActive}
              onPick={(index) => {
                const element = textareaRef.current;
                if (element === null) return;
                const edit = completion.editFor(element, index);
                completion.close();
                if (edit !== null) applyKeyEdit(element, edit);
              }}
            />
          )}
        </div>
      </div>

      {/*
        The panel's status strip, inside its border — HackerRank's `Line: 60 Col: 1` footer, with
        the keyboard contract in the space it leaves empty on the left.
        `Line: N Col: M` earns its place on a screen this size: a compiler error names a line, and
        without this a student counts rows with a finger. It is `aria-hidden` because it changes on
        every keystroke, and a live region that announces the column number as you type is
        actively hostile to a screen-reader user.
      */}
      {/*
        Filling a pane (side by side), the sentence goes and HackerRank's slim status bar takes its
        place: `Ln N, Col M` and a shortcuts button. The sentence screen readers need stays, as the
        textarea's description, and the popover lists Esc, Esc, Tab first. See EditorStatusBar.
        The description follows the armed state the way the stacked sentence does, so focusing
        back into the editor reads the mode it is actually in; the live region below announces
        the change as it happens.
      */}
      {fill ? (
        <>
          <p id={hintId} className="sr-only">
            {tabMovesFocus
              ? "Tab now moves to the next control."
              : "Tab indents. Press Escape twice, then Tab, to move focus out of the editor."}{" "}
            Control or Command plus Enter submits.
          </p>
          <EditorStatusBar
            line={caret.line}
            column={caret.column}
            notice={commands.notice}
            groups={editorShortcutGroups({
              isMac,
              smart: profile !== null,
              templateExample,
              engine: profile === null ? [] : engineShortcuts(isMac, profile),
            })}
          />
        </>
      ) : (
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-rule-edge px-3 py-2">
        <p id={hintId} className="text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
          {/* The armed state is shown, not only announced: a sighted keyboard user who pressed
              Escape twice by accident sees why the next Tab will leave the editor. */}
          {tabMovesFocus ? (
            <strong className="font-semibold text-ink" data-testid="tab-leaves-editor">
              <kbd className="font-mono">Tab</kbd> now moves to the next control.
            </strong>
          ) : (
            <>
              Tab indents. Press <kbd className="font-mono">Esc</kbd> twice, then{" "}
              <kbd className="font-mono">Tab</kbd>, to move on.
            </>
          )}{" "}
          <kbd className="font-mono">Ctrl</kbd>
          {" / "}
          <kbd className="font-mono">Cmd</kbd> + <kbd className="font-mono">Enter</kbd> submits.
          {profile !== null && (
            <>
              {" "}
              <kbd className="font-mono">{modLabel}</kbd> + <kbd className="font-mono">/</kbd>{" "}
              comments a line, <kbd className="font-mono">{modLabel}</kbd> +{" "}
              <kbd className="font-mono">D</kbd> duplicates it, and{" "}
              <kbd className="font-mono">{templateExample}</kbd> then{" "}
              <kbd className="font-mono">Tab</kbd> expands a template.
            </>
          )}
        </p>
        <p
          aria-hidden="true"
          className="numeric shrink-0 text-ink/60"
          style={{ fontSize: "var(--text-xs)" }}
        >
          Line: {caret.line} Col: {caret.column}
        </p>
        <p role="status" data-testid="editor-notice" className="text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
          {commands.notice ?? ""}
        </p>
      </div>
      )}

      <p aria-live="polite" className="sr-only">
        {tabMovesFocus ? "Tab will now move focus out of the editor." : "Tab will insert an indent."}
      </p>
    </div>
  );
}
