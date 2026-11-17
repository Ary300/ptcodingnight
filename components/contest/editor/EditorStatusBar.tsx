"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * The slim strip under the editor when it fills a pane: HackerRank's status bar, `Ln 17, Col 22`
 * on the right and nothing else in view, with the keyboard contract one click away in a popover.
 *
 * The stacked page keeps its full sentence of help under the editor. Side by side, that sentence
 * took three rows of the pane and the organizers asked for it to go. What it said still matters,
 * Esc, Esc, Tab above all, because it is how a keyboard user leaves a textarea that keeps Tab for
 * itself. So it moves to two places: the textarea's `aria-describedby` (owned by the surface,
 * read on focus) and this popover, where it is listed first.
 *
 * The popover is a disclosure, not a dialog: the button says whether it is open, focus stays on
 * the button, and Escape or a click anywhere else closes it.
 */

export interface EditorShortcut {
  readonly keys: readonly string[];
  readonly action: string;
}

export interface EditorStatusBarProps {
  readonly line: number;
  readonly column: number;
  readonly shortcuts: readonly EditorShortcut[];
}

function KeyboardIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    >
      <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" />
      <path d="M4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M4 9h.01M11.5 9h.01M6 9.5h4" />
    </svg>
  );
}

export function EditorStatusBar({ line, column, shortcuts }: EditorStatusBarProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root !== null && event.target instanceof Node && !root.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative flex shrink-0 items-center justify-end gap-3 border-t border-rule-edge bg-ink/[0.03] px-3 py-0.5"
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts"
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-chip transition-[color,background-color] duration-[var(--motion-press)] hover:bg-ink/10 hover:text-ink ${
          open ? "bg-ink/10 text-ink" : "text-ink/70"
        }`}
      >
        <KeyboardIcon />
      </button>
      {/* `aria-hidden`: it changes on every keystroke, and a screen reader announcing the column
          as you type is hostile. The caret position is the textarea's own to report. */}
      <p aria-hidden="true" className="numeric text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
        Ln {line}, Col {column}
      </p>

      <section
        id={panelId}
        aria-label="Keyboard shortcuts"
        hidden={!open}
        className="motion-swap-in absolute right-2 bottom-full z-30 mb-1 w-[27rem] max-w-[calc(100%-1rem)] rounded-panel border border-rule-edge bg-paper p-3 shadow-lg"
      >
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1.5" style={{ fontSize: "var(--text-xs)" }}>
          {shortcuts.map((shortcut) => (
            <div key={shortcut.action} className="contents">
              <dt className="whitespace-nowrap">
                {shortcut.keys.map((key, index) => (
                  // By position: a key can repeat (Esc, Esc, Tab).
                  <span key={index}>
                    {index > 0 && <span className="text-ink/70">, then </span>}
                    <kbd className="rounded-flat border border-rule-edge bg-ink/[0.04] px-1 font-mono">
                      {key}
                    </kbd>
                  </span>
                ))}
              </dt>
              <dd className="text-ink/80">{shortcut.action}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
