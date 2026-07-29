"use client";

import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent, type UIEvent } from "react";

import { LANGUAGE_LABEL, type CodeEditorProps } from "./types";

/**
 * The editing surface, loaded as its own chunk (see `CodeEditor.tsx`).
 *
 * **This is not Monaco.** `monaco-editor` / `@monaco-editor/react` are not installed and
 * `package.json` is orchestrator-owned (docs/PLAN.md §3), so this scope cannot add them.
 * The dependency request is in the report. What is here is a real, keyboard-complete code
 * editor — line numbers, Tab-to-indent, block indent/dedent, auto-indent — minus syntax
 * highlighting, which is the one thing that genuinely needs the library.
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
  const [tabMovesFocus, setTabMovesFocus] = useState(false);
  const hintId = useId();

  const lineCount = useMemo(() => value.split("\n").length, [value]);

  /** Apply an edit and restore the caret, since React re-renders a controlled textarea. */
  const applyEdit = useCallback(
    (next: string, selectionStart: number, selectionEnd: number) => {
      onChange(next);
      requestAnimationFrame(() => {
        const element = textareaRef.current;
        if (element === null) return;
        element.setSelectionRange(selectionStart, selectionEnd);
      });
    },
    [onChange],
  );

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

  const syncGutter = useCallback((event: UIEvent<HTMLTextAreaElement>) => {
    const gutter = gutterRef.current;
    if (gutter === null) return;
    gutter.scrollTop = event.currentTarget.scrollTop;
  }, []);

  return (
    <div className="flex flex-col">
      <div className="flex overflow-hidden rounded border border-ink/20 bg-ink focus-within:border-panther">
        <div
          ref={gutterRef}
          aria-hidden="true"
          className="numeric shrink-0 overflow-hidden bg-paper/5 py-3 pr-2 pl-3 text-right text-paper/55 select-none"
          style={{ fontSize: "var(--text-xs)", lineHeight: "1.6" }}
        >
          {Array.from({ length: lineCount }, (_unused, index) => (
            <div key={index}>{index + 1}</div>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={syncGutter}
          disabled={disabled}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          aria-label={`${label} — ${LANGUAGE_LABEL[language]}`}
          aria-describedby={hintId}
          className="min-h-[18rem] flex-1 resize-y bg-transparent p-3 font-mono text-paper caret-gold outline-none disabled:opacity-60"
          style={{ fontSize: "var(--text-xs)", lineHeight: "1.6", tabSize: 4 }}
        />
      </div>

      <p id={hintId} className="mt-2 text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
        Tab indents. Press <kbd className="font-mono">Esc</kbd> then{" "}
        <kbd className="font-mono">Tab</kbd> to move on. <kbd className="font-mono">Ctrl</kbd>
        {" / "}
        <kbd className="font-mono">Cmd</kbd> + <kbd className="font-mono">Enter</kbd> submits.
      </p>

      <p aria-live="polite" className="sr-only">
        {tabMovesFocus ? "Tab will now move focus out of the editor." : "Tab will insert an indent."}
      </p>
    </div>
  );
}
