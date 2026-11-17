"use client";

import { useId, useState, type RefObject } from "react";

import { parseLineColumn } from "./find";

/**
 * Go to Line:Column (Cmd+L on a Mac, Ctrl+G elsewhere): a one-field strip above the code. Enter
 * moves the caret there and centres it, Escape cancels; both put focus back in the editor.
 */

export interface GoToLineBarProps {
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly currentLine: number;
  readonly currentColumn: number;
  readonly lineCount: number;
  readonly onGo: (line: number, column: number) => void;
  readonly onClose: () => void;
}

export function GoToLineBar({ inputRef, currentLine, currentColumn, lineCount, onGo, onClose }: GoToLineBarProps) {
  const id = useId();
  const [text, setText] = useState(`${currentLine}:${currentColumn}`);
  const parsed = parseLineColumn(text);

  return (
    <div
      role="group"
      aria-label="Go to line"
      className="flex items-center gap-2 border-b border-rule-edge bg-ink/[0.05] px-2 py-1"
      style={{ fontSize: "var(--text-xs)" }}
    >
      <label htmlFor={id} className="text-ink/80">
        Line:Column (1 to {lineCount})
      </label>
      <input
        id={id}
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={text}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={parsed === null}
        onChange={(event) => setText(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (parsed !== null) onGo(parsed.line, parsed.column);
          }
        }}
        className="h-7 w-28 rounded-chip border border-rule-edge bg-paper px-2 font-mono text-ink outline-none focus-visible:border-gold focus-visible:outline-2 focus-visible:outline-gold/45 aria-[invalid=true]:border-fall"
      />
    </div>
  );
}
