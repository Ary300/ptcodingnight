import type { TokenKind } from "../highlight";
import type { IndentGuide } from "./indent-guides";
import type { MarkedSegment, MarkKind } from "./marks";

/**
 * What the overlay `<pre>` holds: the coloured code with its marks, and two layers behind it.
 *
 * Every mark is a background, an inset shadow or an underline, so no mark changes a glyph's
 * advance and the textarea's caret stays over the character it belongs to. The caret row and the
 * indent guides are absolutely positioned children of the `<pre>`, which is the scroll container,
 * so they scroll with the code for free; they sit at `z-index: -1` inside the `<pre>`'s own
 * stacking context (`isolate` on the `<pre>`), which paints them over its transparent background
 * and under its text.
 *
 * ## Contrast
 *
 * The tints are paper over `--ink` at 6% (caret row) and 14% (usages). Paper text stays above
 * 12:1 on the usage tint and the 65% comment colour above 6:1, so every token keeps AA where a
 * mark lands on it. The error colour is `--fall`, which is 9.60:1 on ink (DESIGN.md §2).
 */

/** Positions in the `<pre>`'s own metrics: `p-3` padding, `1.3` line height, monospace columns. */
const PAD = "0.75rem";
const LINE = 1.3;

export const MARK_CLASS: Readonly<Record<MarkKind, string>> = {
  usage: "rounded-[2px] bg-paper/[0.14]",
  diagnostic: "underline decoration-wavy decoration-fall underline-offset-[3px]",
  "bracket-match":
    "rounded-[2px] bg-paper/[0.18] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-gold)_70%,transparent)]",
  "bracket-error": "rounded-[2px] bg-fall/25 text-fall! underline decoration-wavy decoration-fall",
};

export interface OverlayContentProps {
  readonly segments: readonly MarkedSegment[];
  readonly tokenClass: Readonly<Record<TokenKind, string>>;
  readonly guides: readonly IndentGuide[];
  /** 1-based; null hides the row tint (a selection is showing). */
  readonly caretLine: number | null;
}

function rowTop(line: number): string {
  return `calc(${PAD} + ${(line - 1) * LINE}em)`;
}

export function OverlayContent({ segments, tokenClass, guides, caretLine }: OverlayContentProps) {
  return (
    <>
      {caretLine !== null && (
        <span
          data-caret-row={caretLine}
          className="pointer-events-none absolute left-0 -z-10 block w-[1000ch] bg-paper/[0.06]"
          style={{ top: rowTop(caretLine), height: `${LINE}em` }}
        />
      )}
      {guides.map((guide) => (
        <span
          key={`${guide.column}-${guide.fromLine}`}
          data-indent-guide={guide.column}
          className="pointer-events-none absolute -z-10 block w-px bg-paper/[0.12]"
          style={{
            top: rowTop(guide.fromLine),
            left: `calc(${PAD} + ${guide.column}ch)`,
            height: `${(guide.toLine - guide.fromLine + 1) * LINE}em`,
          }}
        />
      ))}
      {segments.map((segment, index) =>
        segment.marks.length === 0 ? (
          <span key={index} className={tokenClass[segment.kind]}>
            {segment.value}
          </span>
        ) : (
          <span
            key={index}
            data-mark={segment.marks.join(" ")}
            className={`${tokenClass[segment.kind]} ${segment.marks.map((mark) => MARK_CLASS[mark]).join(" ")}`}
          >
            {segment.value}
          </span>
        ),
      )}
    </>
  );
}
