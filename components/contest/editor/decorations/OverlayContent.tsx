import type { TokenKind } from "../highlight";
import type { IndentGuide } from "./indent-guides";
import type { MarkedSegment, MarkKind } from "./marks";
import { rowsLength } from "./row-metrics";

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

/**
 * Positions in the `<pre>`'s own metrics: `p-3` padding, the shared row pitch, monospace columns.
 * The pitch is the px value the `<pre>` itself is laid out with (row-metrics.ts), never a ratio
 * recomputed here: a ratio and a laid-out line box disagree by a fraction of a pixel a row, and
 * the difference adds up down the file.
 */
const PAD = "0.75rem";

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
  /** The whole-pixel row pitch every layer is laid out with; null before it is measured. */
  readonly rowPx: number | null;
}

function rowTop(line: number, rowPx: number | null): string {
  return `calc(${PAD} + ${rowsLength(line - 1, rowPx)})`;
}

export function OverlayContent({ segments, tokenClass, guides, caretLine, rowPx }: OverlayContentProps) {
  return (
    <>
      {caretLine !== null && (
        <span
          data-caret-row={caretLine}
          className="pointer-events-none absolute left-0 -z-10 block w-[1000ch] bg-paper/[0.06]"
          style={{ top: rowTop(caretLine, rowPx), height: rowsLength(1, rowPx) }}
        />
      )}
      {guides.map((guide) => (
        <span
          key={`${guide.column}-${guide.fromLine}`}
          data-indent-guide={guide.column}
          className="pointer-events-none absolute -z-10 block w-px bg-paper/[0.12]"
          style={{
            top: rowTop(guide.fromLine, rowPx),
            left: `calc(${PAD} + ${guide.column}ch)`,
            height: rowsLength(guide.toLine - guide.fromLine + 1, rowPx),
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
