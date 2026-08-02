"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type UIEvent,
} from "react";

import { Button } from "@/components/ui";

import { tokenize, type TokenKind } from "./highlight";
import { LANGUAGE_LABEL, LANGUAGE_TEMPLATE, type CodeEditorProps } from "./types";

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
 * The resolution is the established one: **Tab indents while typing; Escape then Tab moves
 * focus.** The current mode is announced in a live region and stated visibly under the
 * editor, because an escape hatch nobody knows about is not an escape hatch.
 *
 * ## The toolbar strip
 *
 * HackerRank draws a thin tinted bar directly above the code (hr-challenge-live.png): the
 * language dropdown on the left, small icon actions — reset and full screen — on the right.
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

const INDENT = "    ";

/**
 * Every metric the two layers must agree on, in one object so they cannot drift apart.
 *
 * `--text-sm` (16px), not `--text-xs`: the editor is the product's primary work surface, and
 * 12.8px there put our code two sizes under HackerRank's ~15.3px. The 1.3 line height keeps the
 * row pitch at ~20.8px, within a pixel of their 20px, so density stays theirs while the glyphs
 * stop being metadata-sized.
 */
const SHARED_TEXT = {
  fontSize: "var(--text-sm)",
  lineHeight: "1.3",
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
  string: "text-rise",
  number: "text-fall",
  comment: "text-paper/65 italic",
  punctuation: "text-paper/75",
};

function lineStartBefore(value: string, index: number): number {
  return value.lastIndexOf("\n", index - 1) + 1;
}

function lineEndAfter(value: string, index: number): number {
  const found = value.indexOf("\n", index);
  return found === -1 ? value.length : found;
}

/**
 * The surface's own props: the shared contract plus the toolbar's left-hand seat.
 *
 * Optional and additive, so every existing caller of `CodeEditorProps` still typechecks.
 * Wiring it up is two edits outside this file: `CodeEditor.tsx` widens its prop type to this
 * interface (the dynamic import already forwards everything), and the workspace moves its
 * `LanguagePicker` out of the header bar into `toolbarStart`.
 */
export interface CodeEditorSurfaceProps extends CodeEditorProps {
  /** Rendered on the toolbar's left, where HackerRank keeps its language dropdown. */
  readonly toolbarStart?: ReactNode;
}

export function CodeEditorSurface({
  value,
  onChange,
  language,
  template: templateProp,
  disabled = false,
  onSubmitShortcut,
  label,
  toolbarStart,
}: CodeEditorSurfaceProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLPreElement | null>(null);
  const [tabMovesFocus, setTabMovesFocus] = useState(false);
  const hintId = useId();

  const lineCount = useMemo(() => value.split("\n").length, [value]);

  // Memoised on the two things it depends on: a scan of every character runs on each keystroke
  // otherwise, and a 200 000-character source is a legal submission (SubmitRequestSchema).
  const tokens = useMemo(() => tokenize(value, language), [value, language]);

  /**
   * Where the caret is, as a 1-based line and column.
   *
   * Derived from `selectionStart` on every event that can move it — typing, clicking, arrowing,
   * and the programmatic edits Tab and Enter make. Kept as state rather than read during render
   * because a textarea's selection is not a React input: nothing re-renders when the caret moves
   * on its own.
   */
  const [caret, setCaret] = useState({ line: 1, column: 1 });
  const syncCaret = useCallback((element: HTMLTextAreaElement | null) => {
    if (element === null) return;
    const upTo = element.value.slice(0, element.selectionStart);
    const lines = upTo.split("\n");
    setCaret({ line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 });
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
  }, [value, caret]);

  const indentSelection = useCallback(
    (element: HTMLTextAreaElement, dedent: boolean) => {
      const source = element.value;
      const start = element.selectionStart;
      const end = element.selectionEnd;

      if (start === end && !dedent) {
        const next = source.slice(0, start) + INDENT + source.slice(end);
        applyEdit(next, start + INDENT.length, start + INDENT.length);
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

      const next = source.slice(0, blockStart) + nextLines.join("\n") + source.slice(blockEnd);
      applyEdit(
        next,
        Math.max(blockStart, start + firstDelta),
        Math.max(blockStart, end + totalDelta),
      );
    },
    [applyEdit],
  );

  /** Enter keeps the current indent, and opens one level after `:` or `{`. */
  const autoIndent = useCallback(
    (element: HTMLTextAreaElement) => {
      const source = element.value;
      const start = element.selectionStart;
      const end = element.selectionEnd;

      const currentLine = source.slice(lineStartBefore(source, start), start);
      const leading = /^[ \t]*/.exec(currentLine)?.[0] ?? "";
      const opensBlock = /[:{[(]\s*$/.test(currentLine);
      const insert = `\n${leading}${opensBlock ? INDENT : ""}`;

      const next = source.slice(0, start) + insert + source.slice(end);
      applyEdit(next, start + insert.length, start + insert.length);
    },
    [applyEdit],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const element = event.currentTarget;

      if (event.key === "Escape") {
        setTabMovesFocus(true);
        return;
      }

      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onSubmitShortcut?.();
        return;
      }

      if (event.key === "Tab") {
        if (tabMovesFocus) {
          // Let the browser move focus, then re-arm indenting for next time.
          setTabMovesFocus(false);
          return;
        }
        event.preventDefault();
        indentSelection(element, event.shiftKey);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        autoIndent(element);
        return;
      }

      if (tabMovesFocus) setTabMovesFocus(false);
    },
    [autoIndent, indentSelection, onSubmitShortcut, tabMovesFocus],
  );

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
    applyEdit(template, 0, 0);
    // `setSelectionRange` on a collapsed caret fires no `select` event, so the derived caret
    // state has to be moved by hand or Line/Col keeps showing where the old code ended.
    setCaret({ line: 1, column: 1 });
    setConfirmingReset(false);
  }, [applyEdit, template]);

  /* ---- toolbar: full screen ---- */

  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
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
  }, []);

  return (
    // `bg-paper` matters only in full screen: a fullscreened element with no background is
    // painted over the UA's black backdrop, and the status strip's ink text vanishes into it.
    <div ref={rootRef} className={isFullscreen ? "flex h-full flex-col bg-paper" : "flex flex-col"}>
      {/*
        The thin toolbar HackerRank draws directly above its editor (hr-challenge-live.png): a
        tinted strip, the language dropdown on the left, small icon actions on the right. Same
        tint as the workspace's header bar so the two read as one piece of chrome, and no bottom
        border — the dark band underneath is its own edge.

        Icon buttons are 28px squares: the glyph is quiet but the target is not, and each one
        carries an aria-label AND a title, because an unlabelled icon is a riddle in both senses.
      */}
      <div className="flex items-center gap-1 bg-ink/[0.03] px-2 py-1">
        <div className="min-w-0 flex-1">{toolbarStart}</div>

        {confirmingReset ? (
          <span className="flex flex-wrap items-center justify-end gap-2" role="group" aria-label="Confirm reset">
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
            className="inline-flex h-7 w-7 items-center justify-center rounded text-ink/70 hover:bg-ink/10 hover:text-ink disabled:cursor-not-allowed disabled:text-ink/30 disabled:hover:bg-transparent"
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
            className="inline-flex h-7 w-7 items-center justify-center rounded text-ink/70 hover:bg-ink/10 hover:text-ink disabled:cursor-not-allowed disabled:text-ink/30 disabled:hover:bg-transparent"
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

      {/*
        The code area itself: gutter, coloured layer, and the textarea over both. No border and
        no radius — it is one band inside the panel the workspace draws around it, which is how
        HackerRank's editor sits inside its challenge card.

        In full screen the band takes every row the toolbar and status strip leave (`flex-1`),
        with `min-h-0` so it can also SHRINK below its content and scroll instead of pushing the
        status strip off the bottom of the monitor.
      */}
      <div className={isFullscreen ? "flex min-h-0 flex-1 bg-ink" : "flex bg-ink"}>
        <div
          ref={gutterRef}
          aria-hidden="true"
          className="numeric shrink-0 overflow-hidden border-r border-paper/10 bg-paper/5 py-3 pr-2 pl-3 text-right select-none"
          // `height` pins the gutter to the textarea's measured height so its per-line divs can
          // never stretch the band past the box the student actually types in. Null only before
          // the first layout-effect measurement, which runs before paint.
          style={{ ...SHARED_TEXT, height: gutterHeight ?? undefined }}
        >
          {Array.from({ length: lineCount }, (_unused, index) => (
            <div
              key={index}
              // The caret's own row, marked the way HackerRank marks it — but in the gutter
              // rather than as a band across the code, because a band would have to be redrawn
              // on every keystroke and horizontal scroll to stay under the right characters.
              className={index + 1 === caret.line ? "text-paper" : "text-paper/55"}
            >
              {index + 1}
            </div>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <pre
            ref={overlayRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden p-3 font-mono whitespace-pre"
            style={{ ...SHARED_TEXT }}
          >
            {tokens.map((token, index) => (
              <span key={index} className={TOKEN_CLASS[token.kind]}>
                {token.value}
              </span>
            ))}
            {/* A trailing newline leaves the last row blank; this keeps the layer as tall as the
                textarea so the final line never sits over nothing. */}
            {"\n"}
          </pre>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={syncScroll}
            disabled={disabled}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            wrap="off"
            aria-label={`${label}, ${LANGUAGE_LABEL[language]}`}
            aria-describedby={hintId}
            onSelect={(event) => syncCaret(event.currentTarget)}
            onKeyUp={(event) => syncCaret(event.currentTarget)}
            onClick={(event) => syncCaret(event.currentTarget)}
            // `text-transparent` hands the glyphs to the layer underneath and keeps the caret and
            // the selection, which are the two things only a real textarea can draw. The
            // selection therefore needs its own colour: without it, selected text is an invisible
            // block on a dark ground.
            // Shorter on a phone: 22rem of editor plus the statement above it is a lot of
            // scrolling to reach Submit, and the box is resizable anyway. In full screen the
            // band's height is the layout's decision, so the resize handle and the caps go.
            className={`relative block w-full overflow-auto bg-transparent p-3 font-mono text-transparent caret-gold outline-none selection:bg-paper/25 disabled:cursor-not-allowed ${
              isFullscreen ? "h-full" : "max-h-[70vh] min-h-[16rem] resize-y sm:min-h-[22rem]"
            }`}
            style={{ ...SHARED_TEXT }}
          />
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
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-ink/15 px-3 py-2">
        <p id={hintId} className="text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
          Tab indents. Press <kbd className="font-mono">Esc</kbd> then{" "}
          <kbd className="font-mono">Tab</kbd> to move on. <kbd className="font-mono">Ctrl</kbd>
          {" / "}
          <kbd className="font-mono">Cmd</kbd> + <kbd className="font-mono">Enter</kbd> submits.
        </p>
        <p
          aria-hidden="true"
          className="numeric shrink-0 text-ink/60"
          style={{ fontSize: "var(--text-xs)" }}
        >
          Line: {caret.line} Col: {caret.column}
        </p>
      </div>

      <p aria-live="polite" className="sr-only">
        {tabMovesFocus ? "Tab will now move focus out of the editor." : "Tab will insert an indent."}
      </p>
    </div>
  );
}
