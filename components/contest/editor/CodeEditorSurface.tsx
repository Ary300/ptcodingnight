"use client";

import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type UIEvent,
} from "react";

import { tokenize, type TokenKind } from "./highlight";
import { LANGUAGE_LABEL, type CodeEditorProps } from "./types";

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
 * that same unavoidable reason. A light editor above a dark verdict panel above dark statement
 * code blocks would be the odd one out on its own page.
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
 */

const INDENT = "    ";

/** Every metric the two layers must agree on, in one object so they cannot drift apart. */
const SHARED_TEXT = {
  fontSize: "var(--text-xs)",
  lineHeight: "1.6",
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

export function CodeEditorSurface({
  value,
  onChange,
  language,
  disabled = false,
  onSubmitShortcut,
  label,
}: CodeEditorProps) {
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
    <div className="flex flex-col">
      {/*
        The code area itself: gutter, coloured layer, and the textarea over both. No border and
        no radius — it is one band inside the panel the workspace draws around it, which is how
        HackerRank's editor sits inside its challenge card.
      */}
      <div className="flex bg-ink">
        <div
          ref={gutterRef}
          aria-hidden="true"
          className="numeric shrink-0 overflow-hidden border-r border-paper/10 bg-paper/5 py-3 pr-2 pl-3 text-right select-none"
          style={{ ...SHARED_TEXT }}
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
            aria-label={`${label} — ${LANGUAGE_LABEL[language]}`}
            aria-describedby={hintId}
            onSelect={(event) => syncCaret(event.currentTarget)}
            onKeyUp={(event) => syncCaret(event.currentTarget)}
            onClick={(event) => syncCaret(event.currentTarget)}
            // `text-transparent` hands the glyphs to the layer underneath and keeps the caret and
            // the selection, which are the two things only a real textarea can draw. The
            // selection therefore needs its own colour: without it, selected text is an invisible
            // block on a dark ground.
            // Shorter on a phone: 22rem of editor plus the statement above it is a lot of
            // scrolling to reach Submit, and the box is resizable anyway.
            className="relative block max-h-[70vh] min-h-[16rem] w-full resize-y overflow-auto bg-transparent p-3 font-mono text-transparent caret-gold outline-none selection:bg-paper/25 disabled:cursor-not-allowed sm:min-h-[22rem]"
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
