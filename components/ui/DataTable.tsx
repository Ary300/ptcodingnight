import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

/**
 * The shared data table — the Codeforces grid, extracted once.
 *
 * ## Why this exists
 *
 * Seven files in this codebase contain a `<table>` and each restyled it from scratch;
 * `<th className="py-2 pr-3 font-semibold">` appears verbatim in several of them. The result
 * is that the lobby standings card and the team board — two boards showing the same contest,
 * ten seconds apart on a student's screen — look like they came from different products.
 *
 * `TeamStandingsBoard` is a careful copy of the Codeforces standings page and is the thing this
 * primitive was extracted *from*, not a thing to be rewritten by it: its projector sizing and
 * column-width logic are load-bearing. What is encoded here is the grammar that made it read as
 * built rather than emitted, measured off the reference screenshot:
 *
 *  - a **vertical hairline between every column**, not only between rows. This is the single
 *    biggest difference between the reference and what we had, and no table outside the team
 *    board drew one.
 *  - a **tinted header** in small uppercase — a header that is a different *ground*, not just
 *    bolder text.
 *  - **~44px rows** and zebra striping, so the eye tracks across a wide row without a ruler.
 *  - **square cells inside a rounded outer edge** (`--radius-panel` on the table, nothing on the
 *    cells). That contrast is what separates the data from the panel holding it, and it is most
 *    of what we were getting for free from nothing.
 *  - a **two-line cell** (`Stacked`), because Codeforces' cell is a quantity over its
 *    qualifier — score over solve time, points over penalty — and a single line cannot say that.
 *
 * ## Contrast, measured before it was written
 *
 * A table introduces three grounds where §7's floors were measured against one, so all three were
 * measured (the full table is in DESIGN.md §5d):
 *
 *   ground                     full ink   text-ink/60   --panther
 *   --paper                      18.65        5.15         5.08
 *   + 2% zebra                   17.89        5.08         4.87
 *   + 8% highlight               16.59        4.95         4.52
 *   9% highlight                 16.34        4.92         4.45  ✗
 *   zebra AND highlight            —            —          fails
 *
 * So 8% is the CEILING on the highlight, not a preference, and the zebra skips the highlighted
 * row rather than compositing under it. **Do not deepen the zebra past 3%** without re-measuring.
 *
 * ## What this does NOT do
 *
 * It does not scroll for you. A wide table must sit inside a container that does — and that
 * container must be `min-w-0` if it is a flex child, which is exactly the bug that made `/team`
 * drag the whole document sideways at 360px while the board's own `overflow-x-auto` sat there
 * doing nothing.
 */

export interface TableProps {
  readonly children: ReactNode;
  /** Names the table for assistive technology. Rendered as a visually-hidden `<caption>`. */
  readonly caption?: string;
  readonly className?: string;
}

/*
 * `border-separate` with zero spacing, not `border-collapse`, and it is not a preference.
 *
 * The collapsing algorithm merges cell borders into the table's own, and browsers then decline to
 * paint `border-radius` on the result — so a collapsed table cannot have the rounded outer edge
 * that §5a's rule asks for. `overflow-hidden` does not rescue it either: `overflow` is not
 * defined to apply to table boxes at all, so clipping the corners that way works in some engines
 * and silently does nothing in others.
 *
 * Separate borders mean every rule is drawn by a CELL — `border-l` between columns, `border-t`
 * between rows — and the four corner cells round themselves to match the outer edge. A `<tr>`
 * border would be ignored in this mode, which is why the row divider lives on `td` below.
 */
const CORNERS = [
  "[&>thead>tr:first-child>*:first-child]:rounded-tl-panel",
  "[&>thead>tr:first-child>*:last-child]:rounded-tr-panel",
  "[&>tbody>tr:last-child>*:first-child]:rounded-bl-panel",
  "[&>tbody>tr:last-child>*:last-child]:rounded-br-panel",
].join(" ");

export function Table({ children, caption, className }: TableProps) {
  return (
    <table
      className={[
        "w-full border-separate border-spacing-0 rounded-panel border border-rule-edge text-left",
        CORNERS,
        className ?? "",
      ].join(" ")}
      style={{ fontSize: "var(--text-sm)" }}
    >
      {caption !== undefined && <caption className="sr-only">{caption}</caption>}
      {children}
    </table>
  );
}

export interface TableSectionProps {
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * The header is a different ground, not merely bolder text. `bg-ink/[0.04]` measures 17.15:1
 * against full-strength ink and 5.01:1 against the `/60` muted floor.
 */
export function THead({ children, className }: TableSectionProps) {
  return (
    <thead
      className={[
        "bg-ink/[0.04] text-ink",
        // On the cells, not the row: see the note on `border-separate` above.
        "[&>tr>th]:border-b [&>tr>th]:border-rule-edge",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </thead>
  );
}

/**
 * `[&>tr:nth-child(odd)]` rather than a prop on every row: zebra is a property of the body, and
 * a caller that has to remember to alternate will eventually forget on the one screen that
 * matters. Rows are also separated by a hairline, so the stripe is reinforcement and never the
 * only channel — the same rule §3 states for rank change.
 *
 * ## Why the highlighted row is excluded rather than layered over
 *
 * Two tints stack multiplicatively on the ground beneath the text, and the floors are measured
 * against ONE ground. `--panther` reads 5.08:1 on paper, 4.87 on the zebra and 4.58 on the
 * viewer's-own-row highlight — all AA. Stack the highlight ON the zebra and it is **4.40:1,
 * which fails**, on the one row a student is guaranteed to look at. So the zebra skips the
 * highlighted row by selector instead of being painted under it; the alternative is trusting
 * that no caller ever puts an accent-coloured number in their own row, which is not a thing to
 * trust.
 */
export function TBody({ children, className }: TableSectionProps) {
  return (
    <tbody
      className={[
        "[&>tr:nth-child(odd):not([data-highlighted])]:bg-ink/[0.02]",
        // `tr+tr` so the divider falls BETWEEN rows and never doubles up against the header rule.
        "[&>tr+tr>td]:border-t [&>tr+tr>td]:border-rule-hair",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </tbody>
  );
}

export interface TRProps {
  readonly children: ReactNode;
  /**
   * Marks the viewer's own row.
   *
   * The tint is ONE channel and it is not enough on its own (§3). The caller supplies the second
   * — a `you` label in the name cell, the way the lobby standings card already does — because
   * only the caller knows what the row is a row of.
   */
  readonly highlighted?: boolean;
  readonly className?: string;
}

export function TR({ children, highlighted = false, className }: TRProps) {
  return (
    <tr
      // Read by TBody's zebra selector so the two tints can never stack — see the note there.
      data-highlighted={highlighted ? "" : undefined}
      className={[
        // The row height floor. `h-11` is 44px, the reference's row, and also the touch-target
        // size a student on a phone needs to hit a row action.
        "h-11",
        // 8% is the ceiling, not a preference: `--panther` text measures 4.52:1 on it and 4.45:1
        // at 9%, and a student's own row is exactly where an accent-coloured number turns up.
        highlighted ? "bg-panther/[0.08]" : "",
        className ?? "",
      ].join(" ")}
      /*
       * The rail (§5), as an inset shadow rather than a border so it adds no width and cannot
       * collide with the cell borders that draw this table's grid.
       *
       * It is here because the tint alone reads WRONG, not merely weak: capped at 8% it is lighter
       * than the 2%-ink zebra beside it, so the emphasized row looks like the quiet one. That is a
       * worse failure than being subtle, and it is the same reason §3 refuses to let colour be the
       * only channel anywhere else on a board.
       */
      style={
        highlighted
          ? { boxShadow: "inset var(--rail-width) 0 0 0 var(--color-panther)" }
          : undefined
      }
    >
      {children}
    </tr>
  );
}

/** Cell alignment. `numeric` also switches the face — see DESIGN.md §4 on jittering digits. */
export type CellAlign = "start" | "end" | "center";

const ALIGN: Record<CellAlign, string> = {
  start: "text-left",
  end: "text-right",
  center: "text-center",
};

/*
 * The vertical rule. `border-l` on every cell except the first draws a line BETWEEN columns
 * without drawing one down the outside of the table, which the outer `border-rule-edge`
 * already does. Done with a sibling selector so no caller has to know which cell is first.
 */
const CELL_BASE = "px-3 py-2 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-rule-hair";

/*
 * `align` is omitted from the underlying element's props on purpose. HTML has its own presentational
 * `align` attribute on `<th>`/`<td>` — deprecated since HTML 4, still in the React typings — and
 * leaving it in place would let a caller pass `align="char"` to a prop that only understands three
 * logical values, with the type checker agreeing.
 */
export interface THProps extends Omit<ThHTMLAttributes<HTMLTableCellElement>, "align"> {
  readonly align?: CellAlign;
  readonly numeric?: boolean;
}

export function TH({ align = "start", numeric = false, className, style, ...rest }: THProps) {
  return (
    <th
      scope="col"
      className={[
        CELL_BASE,
        "font-semibold uppercase",
        numeric ? "numeric" : "",
        ALIGN[numeric && align === "start" ? "end" : align],
        className ?? "",
      ].join(" ")}
      style={{ fontSize: "var(--text-xs)", letterSpacing: "0.06em", ...style }}
      {...rest}
    />
  );
}

export interface TDProps extends Omit<TdHTMLAttributes<HTMLTableCellElement>, "align"> {
  readonly align?: CellAlign;
  /** Quantities: mono, tabular figures, right-aligned. Names stay in the body face. */
  readonly numeric?: boolean;
}

export function TD({ align = "start", numeric = false, className, ...rest }: TDProps) {
  return (
    <td
      className={[
        CELL_BASE,
        numeric ? "numeric" : "",
        ALIGN[numeric && align === "start" ? "end" : align],
        className ?? "",
      ].join(" ")}
      {...rest}
    />
  );
}

export interface StackedProps {
  /** The quantity. Carries the weight. */
  readonly value: ReactNode;
  /** What qualifies it — a solve time, a penalty, a set label. Muted, at the `/60` floor. */
  readonly detail?: ReactNode;
  readonly className?: string;
}

/**
 * Codeforces' two-line cell: the number, and underneath it the thing that qualifies the number.
 *
 * `detail` is optional and renders nothing when absent — deliberately NOT a blank line held
 * open, because a column of cells that are sometimes two lines and sometimes one is the honest
 * rendering of data that is sometimes qualified and sometimes not.
 */
export function Stacked({ value, detail, className }: StackedProps) {
  return (
    <span className={["flex flex-col leading-tight", className ?? ""].join(" ")}>
      <span className="font-semibold">{value}</span>
      {detail !== undefined && (
        <span className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          {detail}
        </span>
      )}
    </span>
  );
}
