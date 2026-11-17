"use client";

import { useMemo } from "react";

import type { Token } from "../highlight";
import { pairBrackets } from "./brackets";
import { buildMarks } from "./build-marks";
import { charKinds } from "./char-kinds";
import { mapDiagnostics, type DiagnosticsInput, type EditorDiagnostic } from "./diagnostics";
import { indentGuides, type IndentGuide } from "./indent-guides";
import { segmentTokens, type MarkedSegment } from "./marks";
import { useSettled } from "./useSettled";

/** IntelliJ waits for a pause before calling a bracket unmatched; this is that pause. */
export const UNMATCHED_DELAY_MS = 500;
/** The caret has to rest this long before usages light up, so arrowing through code stays calm. */
export const USAGE_DELAY_MS = 150;

export interface DecorationsInput {
  readonly value: string;
  readonly tokens: readonly Token[];
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly diagnostics: DiagnosticsInput | null;
  /** One indent level in columns. */
  readonly indentUnit: number;
}

export interface Decorations {
  readonly segments: readonly MarkedSegment[];
  readonly guides: readonly IndentGuide[];
  /** The run's error marks, carried onto the current text. */
  readonly diagnostics: readonly EditorDiagnostic[];
  /** Whether the caret is a plain caret, with no selection drawn over the row. */
  readonly collapsed: boolean;
}

export function useDecorations(input: DecorationsInput): Decorations {
  const { value, tokens, selectionStart, selectionEnd, diagnostics, indentUnit } = input;

  const kinds = useMemo(() => charKinds(tokens, value.length), [tokens, value.length]);
  const pairs = useMemo(() => pairBrackets(value, kinds), [value, kinds]);
  const guides = useMemo(() => indentGuides(value, indentUnit), [value, indentUnit]);
  const mapped = useMemo(
    () => (diagnostics === null ? [] : mapDiagnostics(diagnostics.items, diagnostics.source, value)),
    [diagnostics, value],
  );

  const settledValue = useSettled(value, UNMATCHED_DELAY_MS);
  const selectionKey = `${selectionStart}:${selectionEnd}:${value.length}`;
  const settledSelection = useSettled(selectionKey, USAGE_DELAY_MS);

  const marks = useMemo(
    () =>
      buildMarks({
        source: value,
        kinds,
        pairs,
        selectionStart,
        selectionEnd,
        sourceSettled: settledValue === value,
        selectionSettled: settledSelection === selectionKey,
        diagnostics: mapped,
      }),
    [value, kinds, pairs, selectionStart, selectionEnd, settledValue, settledSelection, selectionKey, mapped],
  );
  const segments = useMemo(() => segmentTokens(tokens, marks), [tokens, marks]);

  return { segments, guides, diagnostics: mapped, collapsed: selectionStart === selectionEnd };
}
