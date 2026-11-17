"use client";

import { useId, useRef, type KeyboardEvent, type RefObject } from "react";

/**
 * IntelliJ's find bar, above the code: Find (Mod+F) and, with Replace (Cmd+R, Ctrl+R), a second
 * row. Enter and Shift+Enter step through matches, F3 and Mod+G do too, and Escape closes the bar
 * and puts focus back in the editor. The count is a polite live region ("3 of 12").
 */

export interface FindBarProps {
  readonly query: string;
  readonly replacement: string;
  readonly showReplace: boolean;
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  readonly countLabel: string;
  readonly hasMatches: boolean;
  readonly isMac: boolean;
  readonly findInputRef: RefObject<HTMLInputElement | null>;
  readonly onQuery: (query: string) => void;
  readonly onReplacement: (replacement: string) => void;
  readonly onToggleCase: () => void;
  readonly onToggleWord: () => void;
  readonly onStep: (delta: 1 | -1) => void;
  readonly onReplace: () => void;
  readonly onReplaceAll: () => void;
  readonly onClose: () => void;
}

const FIELD =
  "h-7 min-w-0 flex-1 rounded-chip border border-rule-edge bg-paper px-2 font-mono text-ink outline-none focus-visible:border-gold focus-visible:outline-2 focus-visible:outline-gold/45";
const BUTTON =
  "inline-flex h-7 items-center justify-center rounded-chip px-2 text-ink/80 transition-[color,background-color] duration-[var(--motion-press)] hover:bg-ink/10 hover:text-ink disabled:cursor-not-allowed disabled:text-ink/40 disabled:hover:bg-transparent";

function Toggle({ pressed, label, short, onToggle }: { pressed: boolean; label: string; short: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={onToggle}
      className={`${BUTTON} font-mono ${pressed ? "bg-ink/15 text-ink" : ""}`}
    >
      {short}
    </button>
  );
}

export function FindBar({ findInputRef, ...props }: FindBarProps) {
  const findId = useId();
  const replaceId = useId();
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const { isMac } = props;

  const onFieldKey = (event: KeyboardEvent<HTMLInputElement>, replaceField: boolean) => {
    const mod = isMac ? event.metaKey : event.ctrlKey;
    // IntelliJ's Tab goes from Find straight to Replace and Shift+Tab back, past the toggles, so
    // a replacement typed after Tab lands in the Replace field.
    if (event.key === "Tab" && !mod && !event.altKey && props.showReplace && event.shiftKey === replaceField) {
      const target = replaceField ? findInputRef.current : replaceInputRef.current;
      if (target !== null) {
        event.preventDefault();
        target.focus();
        target.select();
        return;
      }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      props.onClose();
      return;
    }
    if (event.key === "Enter" && !mod) {
      event.preventDefault();
      if (replaceField) props.onReplace();
      else props.onStep(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === "Enter" && mod && replaceField) {
      event.preventDefault();
      props.onReplaceAll();
      return;
    }
    if (event.key === "F3" || (mod && event.code === "KeyG" && isMac)) {
      event.preventDefault();
      props.onStep(event.shiftKey ? -1 : 1);
      return;
    }
    // IntelliJ's toggles on Windows and Linux: Alt+C match case, Alt+W words.
    if (event.altKey && !event.ctrlKey && !event.metaKey && (event.code === "KeyC" || event.code === "KeyW")) {
      event.preventDefault();
      if (event.code === "KeyC") props.onToggleCase();
      else props.onToggleWord();
    }
  };

  return (
    <div
      role="search"
      aria-label="Find in code"
      className="flex flex-col gap-1 border-b border-rule-edge bg-ink/[0.05] px-2 py-1"
      style={{ fontSize: "var(--text-xs)" }}
    >
      <div className="flex items-center gap-1">
        <label htmlFor={findId} className="sr-only">
          Find
        </label>
        <input
          id={findId}
          ref={findInputRef}
          type="text"
          value={props.query}
          placeholder="Find"
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => props.onQuery(event.target.value)}
          onKeyDown={(event) => onFieldKey(event, false)}
          className={FIELD}
        />
        <Toggle pressed={props.caseSensitive} label="Match case" short="Cc" onToggle={props.onToggleCase} />
        <Toggle pressed={props.wholeWord} label="Words" short="W" onToggle={props.onToggleWord} />
        <span role="status" aria-live="polite" className="numeric min-w-[5.5rem] text-center text-ink/70">
          {props.countLabel}
        </span>
        <button type="button" className={BUTTON} aria-label="Previous match" title="Previous match" disabled={!props.hasMatches} onClick={() => props.onStep(-1)}>
          <span aria-hidden="true">&uarr;</span>
        </button>
        <button type="button" className={BUTTON} aria-label="Next match" title="Next match" disabled={!props.hasMatches} onClick={() => props.onStep(1)}>
          <span aria-hidden="true">&darr;</span>
        </button>
        <button type="button" className={BUTTON} aria-label="Close find" title="Close" onClick={props.onClose}>
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      {props.showReplace && (
        <div className="flex items-center gap-1">
          <label htmlFor={replaceId} className="sr-only">
            Replace with
          </label>
          <input
            id={replaceId}
            ref={replaceInputRef}
            type="text"
            value={props.replacement}
            placeholder="Replace"
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => props.onReplacement(event.target.value)}
            onKeyDown={(event) => onFieldKey(event, true)}
            className={FIELD}
          />
          <button type="button" className={BUTTON} disabled={!props.hasMatches} onClick={props.onReplace}>
            Replace
          </button>
          <button type="button" className={BUTTON} disabled={!props.hasMatches} onClick={props.onReplaceAll}>
            Replace all
          </button>
        </div>
      )}
    </div>
  );
}
