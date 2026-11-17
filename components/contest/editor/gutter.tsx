import { useMemo, type CSSProperties, type Ref } from "react";

import type { EditorDiagnostic } from "./decorations/diagnostics";

/**
 * The line-number gutter, with the run's error lines marked.
 *
 * A line the compiler or a traceback named gets a `--fall` dot left of its number and its number
 * in `--fall`, and hovering the row shows the message, as IntelliJ's gutter icon does. The dot is
 * absolutely positioned inside the row's left padding, so a marker appearing never widens the
 * gutter and never moves the code.
 *
 * The gutter stays `aria-hidden`: the same messages are in the Results drawer as text, with each
 * line reference a button that moves the caret there.
 */

export interface EditorGutterProps {
  readonly gutterRef: Ref<HTMLDivElement>;
  readonly lineCount: number;
  readonly caretLine: number;
  readonly diagnostics: readonly EditorDiagnostic[];
  readonly style: CSSProperties;
}

export function EditorGutter({ gutterRef, lineCount, caretLine, diagnostics, style }: EditorGutterProps) {
  const messageByLine = useMemo(() => {
    const byLine = new Map<number, string>();
    for (const item of diagnostics) {
      const earlier = byLine.get(item.line);
      byLine.set(item.line, earlier === undefined ? item.message : `${earlier}\n${item.message}`);
    }
    return byLine;
  }, [diagnostics]);

  return (
    <div
      ref={gutterRef}
      aria-hidden="true"
      className="numeric shrink-0 overflow-hidden border-r border-rule-hair-inverse bg-paper/5 py-3 pr-2 pl-3 text-right select-none"
      style={style}
    >
      {Array.from({ length: lineCount }, (_unused, index) => {
        const line = index + 1;
        const message = messageByLine.get(line);
        const tone = message !== undefined ? "text-fall" : line === caretLine ? "text-paper" : "text-paper/55";
        return (
          <div
            key={index}
            // The caret's own row is brighter here as well as tinted across the code.
            className={message === undefined ? tone : `relative ${tone}`}
            title={message}
            data-diagnostic-line={message === undefined ? undefined : line}
          >
            {message !== undefined && (
              <span className="absolute top-1/2 -left-[0.55rem] h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-fall" />
            )}
            {line}
          </div>
        );
      })}
    </div>
  );
}
