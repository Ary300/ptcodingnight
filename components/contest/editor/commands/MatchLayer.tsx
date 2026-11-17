"use client";

import { forwardRef, type CSSProperties } from "react";

import type { MatchRange } from "./find";

/**
 * Find matches and picked occurrences, drawn UNDER the highlighted code.
 *
 * A second transparent-text copy of the source with the same metrics as the overlay, so each mark
 * sits exactly behind its characters, and nothing in the token overlay changes. The current match
 * is stronger; extra carets of an occurrence session are thin gold bars.
 */

export interface MatchLayerProps {
  readonly text: string;
  readonly matches: readonly MatchRange[];
  /** Index into `matches` drawn as the current one, or -1. */
  readonly current: number;
  readonly carets: readonly number[];
  readonly style: CSSProperties;
}

type Piece =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "mark"; readonly value: string; readonly current: boolean }
  | { readonly kind: "caret" };

/** The text cut at every mark and caret, in order. Exported for the unit test. */
export function layerPieces(text: string, matches: readonly MatchRange[], current: number, carets: readonly number[]): readonly Piece[] {
  type Cut = { at: number; end: number; kind: "mark" | "caret"; current: boolean };
  const cuts: Cut[] = [
    ...matches.map(([start, end], index) => ({ at: start, end, kind: "mark" as const, current: index === current })),
    ...carets.map((at) => ({ at, end: at, kind: "caret" as const, current: false })),
  ].sort((a, b) => a.at - b.at || (a.kind === "caret" ? -1 : 1));

  const pieces: Piece[] = [];
  let cursor = 0;
  for (const cut of cuts) {
    if (cut.at < cursor) continue;
    if (cut.at > cursor) pieces.push({ kind: "text", value: text.slice(cursor, cut.at) });
    if (cut.kind === "caret") {
      pieces.push({ kind: "caret" });
      cursor = cut.at;
    } else {
      pieces.push({ kind: "mark", value: text.slice(cut.at, cut.end), current: cut.current });
      cursor = cut.end;
    }
  }
  if (cursor < text.length) pieces.push({ kind: "text", value: text.slice(cursor) });
  return pieces;
}

export const MatchLayer = forwardRef<HTMLPreElement, MatchLayerProps>(function MatchLayer(
  { text, matches, current, carets, style },
  ref,
) {
  return (
    <pre
      ref={ref}
      aria-hidden="true"
      data-testid="editor-match-layer"
      translate="no"
      className="notranslate pointer-events-none absolute inset-0 overflow-hidden p-3 font-mono whitespace-pre text-transparent"
      style={style}
    >
      {layerPieces(text, matches, current, carets).map((piece, index) => {
        if (piece.kind === "text") return <span key={index}>{piece.value}</span>;
        if (piece.kind === "caret") {
          return <span key={index} data-testid="editor-extra-caret" className="relative inline-block h-[1.3em] w-0 border-l-2 border-gold align-top" />;
        }
        return (
          <mark
            key={index}
            data-current={piece.current ? "true" : undefined}
            className={`rounded-[2px] text-transparent ${piece.current ? "bg-gold/55" : "bg-gold/25"}`}
          >
            {piece.value}
          </mark>
        );
      })}
      {"\n"}
    </pre>
  );
});
