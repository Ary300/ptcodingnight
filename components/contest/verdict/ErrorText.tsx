import { useMemo } from "react";

import type { Language } from "@/lib/schemas/judge";

import { errorTextSegments } from "../editor/decorations/diagnostics";

/**
 * Compiler or traceback text with every line reference turned into a button.
 *
 * `Main.java:12`, `main.cpp:12:5` and a traceback's `line 12` each move the caret to that line
 * (and column, when the compiler gave one) and hand the editor focus. The button's text is the
 * reference itself, so what a screen reader hears is what is on screen, with where it goes added.
 * Gold on the panel's ink is 13.44:1 (DESIGN.md §2), and the underline says it is pressable
 * without relying on the hue.
 *
 * Without `onGoToLine`, or for a language whose output is not parsed, the text renders as before.
 */

export interface ErrorTextProps {
  readonly text: string;
  readonly language: Language | null;
  readonly onGoToLine?: ((line: number, column: number | null) => void) | undefined;
}

export function ErrorText({ text, language, onGoToLine }: ErrorTextProps) {
  const segments = useMemo(
    () => (language === null || onGoToLine === undefined ? null : errorTextSegments(language, text)),
    [language, onGoToLine, text],
  );
  if (segments === null || onGoToLine === undefined) return <>{text}</>;

  return (
    <>
      {segments.map((segment, index) =>
        segment.target === null ? (
          <span key={index}>{segment.text}</span>
        ) : (
          <button
            key={index}
            type="button"
            data-error-line={segment.target.line}
            aria-label={`${segment.text}, go to line ${segment.target.line}`}
            onClick={() => onGoToLine(segment.target?.line ?? 1, segment.target?.column ?? null)}
            className="cursor-pointer font-mono text-gold underline decoration-gold/60 underline-offset-2 hover:decoration-gold"
          >
            {segment.text}
          </button>
        ),
      )}
    </>
  );
}
