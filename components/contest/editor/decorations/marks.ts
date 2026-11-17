import type { Token, TokenKind } from "../highlight";

/**
 * Laying marks over the coloured tokens without moving a glyph.
 *
 * A mark is a range of the source and a set of classes (a background, an outline drawn as a
 * shadow, a wavy underline), never anything that changes a glyph's advance. The tokens are cut at
 * every mark boundary and each piece carries the classes of every mark that covers it. The pieces
 * concatenate back to the source exactly, which is the overlay's one invariant
 * (CodeEditorSurface.tsx).
 */

export type MarkKind =
  | "usage"
  | "bracket-match"
  | "bracket-error"
  | "diagnostic";

export interface Mark {
  readonly from: number;
  readonly to: number;
  readonly kind: MarkKind;
}

export interface MarkedSegment {
  readonly kind: TokenKind;
  readonly value: string;
  /** The mark kinds covering this piece, in a fixed order; empty for most of the file. */
  readonly marks: readonly MarkKind[];
}

const MARK_ORDER: readonly MarkKind[] = ["usage", "diagnostic", "bracket-match", "bracket-error"];

interface Boundary {
  readonly at: number;
  readonly mark: number;
  readonly opens: boolean;
}

export function segmentTokens(tokens: readonly Token[], marks: readonly Mark[]): readonly MarkedSegment[] {
  const live = marks.filter((mark) => mark.to > mark.from);
  if (live.length === 0) return tokens.map((token) => ({ kind: token.kind, value: token.value, marks: [] }));

  const boundaries: Boundary[] = [];
  live.forEach((mark, index) => {
    boundaries.push({ at: mark.from, mark: index, opens: true });
    boundaries.push({ at: mark.to, mark: index, opens: false });
  });
  boundaries.sort((a, b) => a.at - b.at);

  const active = new Map<number, MarkKind>();
  const activeKinds = (): readonly MarkKind[] => {
    const present = new Set(active.values());
    return MARK_ORDER.filter((kind) => present.has(kind));
  };

  const segments: MarkedSegment[] = [];
  let next = 0;
  let offset = 0;
  for (const token of tokens) {
    const end = offset + token.value.length;
    let cut = offset;
    while (cut < end) {
      while (next < boundaries.length && (boundaries[next]?.at ?? Infinity) <= cut) {
        const boundary = boundaries[next];
        if (boundary !== undefined) {
          if (boundary.opens) active.set(boundary.mark, live[boundary.mark]?.kind ?? "usage");
          else active.delete(boundary.mark);
        }
        next += 1;
      }
      const stop = Math.min(end, boundaries[next]?.at ?? Infinity);
      segments.push({ kind: token.kind, value: token.value.slice(cut - offset, stop - offset), marks: activeKinds() });
      cut = stop;
    }
    offset = end;
  }
  return segments;
}
