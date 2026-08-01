import type { ReactNode, Ref, SelectHTMLAttributes } from "react";

/**
 * The one dropdown trigger in this product.
 *
 * ## Still a native `<select>`, and the measurement that decided it stands
 *
 * A previous study measured HackerRank's own dropdown and concluded we keep the platform
 * control rather than build a listbox. Its reasons hold and are not re-litigated here: their
 * popup has no focus indicator at all (border, outline and box-shadow measured identical
 * focused and unfocused), its hover and selected rows render identically at 2.9:1, our longest
 * list is ten items and never scrolls, and on the phones half the room is using the native
 * control IS the iOS and Android wheel.
 *
 * What that study did not settle is the TRIGGER, and the trigger is the whole complaint. Four
 * screens drew one, all four differently. Measured on this machine at 1440, same commit:
 *
 * | | height | radius | border | font |
 * |---|---|---|---|---|
 * | the editor's language picker | 34px | 4px (raw `rounded`) | `ink/25` | 12.8px |
 * | every admin select | 42px | 0px (`--radius-flat`) | `--rule-edge` (ink/18) | 16px |
 * | the admin TEXT input beside it | 42px | 0px | `--rule-edge` | 16px |
 *
 * Neither `4px` nor `ink/25` is a token. DESIGN.md §5a has three radii and §5b has three rule
 * weights, and the language picker was off both scales — it is one of the eleven hand-picked
 * `border-ink/N` alphas §5b exists to have deleted.
 *
 * ## `appearance: none` does not cost us the native popup
 *
 * It styles the CLOSED control only; the open list is still the platform's, so the wheel on a
 * phone is untouched and none of the study's reasons are spent. What it buys is the chevron:
 * the browser default is a small stacked double-triangle, it differs per platform and per
 * browser, and the control reserved no room for it. Measured at 360px with a long team name,
 * the label ran to 13px from the right edge and the arrow sits inside that, so the text was
 * clipped hard against the glyph with no gutter at all — screenshot `compare-overlap.png`.
 * Ours is one thin stroke like HackerRank's (measured on their Create Contest form: single
 * chevron, ~10px wide, centred ~19px in from the right edge), and `CHEVRON_CLEARANCE` stops
 * the text 37px in, so no label can reach it.
 *
 * ## Why the surface is exported rather than copied
 *
 * `components/admin/Field.tsx` puts `CONTROL_SURFACE` on its text input and textarea too. A
 * select four pixels shorter than the input beside it in the same grid row is precisely the
 * defect this file exists to end, and two hand-maintained copies of `px-3 py-2 border …` is how
 * it comes back six weeks later.
 *
 * ## Disabled is a skin, not an opacity
 *
 * The same rule `components/ui/Button.tsx` already states: `opacity` over a live-looking control
 * reads as enabled-and-broken, and it MULTIPLIES with the child alpha, so `disabled:opacity-60`
 * over `placeholder:text-ink/60` landed placeholder text at 0.36. Disabled is a different kind
 * of object here (flat fill, hairline rule, muted ink, no pointer) rather than a faded live one.
 */

/** `sm` for dense chrome (the editor header bar), `md` for a form row. Defaults to `md`. */
export type SelectSize = "sm" | "md";

/**
 * Surface, corner, rule weight and the disabled skin: everything a control's box has that is
 * not its padding or its type face. Shared with `components/admin/Field.tsx`.
 *
 * `--radius-flat` and not `--radius-chip`, even though a select is arguably a control rather
 * than a thing you type into: it stands in a grid beside text inputs that are flat, and a 3px
 * corner next to a 0px corner in one form row reads as a mistake rather than as a taxonomy.
 */
export const CONTROL_SURFACE =
  // `transition-[border-color]` and NOT `transition-colors`: in Tailwind v4 that shorthand
  // includes `outline-color`, and the focus ring is an outline. Measured with it on, tabbing
  // into a select FADED the ring up from ink to `--panther` over 150ms — the one indicator a
  // keyboard-only user has, arriving late and washed out. The border is the only colour here
  // that has any business animating.
  "w-full rounded-flat border bg-paper text-ink transition-[border-color] " +
  "disabled:cursor-not-allowed disabled:border-rule-hair disabled:bg-ink/5 disabled:text-ink/40";

/** Padding by size. The select adds its own right padding to clear the chevron. */
export const CONTROL_PAD: Record<SelectSize, string> = {
  sm: "px-2.5 py-1.5",
  md: "px-3 py-2",
};

/**
 * The line box, pinned rather than left to the font's `normal`.
 *
 * This is what makes "the select is the same height as the input beside it" a fact instead of a
 * coincidence. Height is padding + border + line box; the first two were already shared, and the
 * third was whatever each browser computes `normal` to be for Libre Baskerville at that size.
 * It happens to be exactly 24px in this Chromium, which is why `md` reads 42px on both today —
 * but `appearance: none` also drops the UA's own minimum height on the select and not on the
 * input, so the two were one font metric away from stepping apart again on somebody's Firefox.
 */
export const CONTROL_LEADING: Record<SelectSize, string> = {
  sm: "leading-5",
  md: "leading-6",
};

/** Type size by size, as a token rather than a Tailwind step. */
export const CONTROL_FONT_SIZE: Record<SelectSize, string> = {
  sm: "var(--text-xs)",
  md: "var(--text-sm)",
};

/**
 * Right padding that clears the chevron, so no option label can ever run under it.
 * `sm` reserves 28px for a 9px glyph inset 8px; `md` reserves 36px for a 10px glyph inset 12px.
 */
const CHEVRON_CLEARANCE: Record<SelectSize, string> = {
  sm: "pr-7",
  md: "pr-9",
};

const CHEVRON_POSITION: Record<SelectSize, string> = {
  sm: "right-2",
  md: "right-3",
};

const CHEVRON_BOX: Record<SelectSize, { width: number; height: number }> = {
  sm: { width: 9, height: 6 },
  md: { width: 10, height: 6 },
};

/**
 * `--rule-edge` at rest, `--rule-firm` on hover. Both are §5b weights; the hover is a real
 * affordance rather than decoration, and it is not colour ALONE because `cursor-pointer`
 * changes at the same moment.
 *
 * `--panther` when invalid. It is 5.08:1 on paper — AA, and the one palette colour DESIGN.md §2
 * lets carry meaning here. Never the only channel: `Field` renders the message in the same red
 * beneath the control and points `aria-describedby` at it.
 */
function borderFor(invalid: boolean): string {
  return invalid ? "border-panther" : "border-rule-edge hover:border-rule-firm";
}

export interface SelectProps
  extends Omit<
    SelectHTMLAttributes<HTMLSelectElement>,
    /* Ours means the trigger's metrics; the native one turns a select into a scrolling listbox. */
    "size" | "className" | "multiple"
  > {
  /** Trigger metrics. `sm` for toolbar chrome, `md` for a form row. */
  size?: SelectSize;
  /** Paints the accent rule. The CALLER owns the message; this only paints the box. */
  invalid?: boolean;
  /**
   * Sizing for the shell, not the control: `w-full`, `w-52 max-w-full`, and so on. The
   * `<select>` always fills the shell, because the chevron is positioned against the shell and
   * a control narrower than its shell would leave the glyph floating beside it.
   */
  shellClassName?: string;
  /** React 19 passes `ref` as an ordinary prop, but it still has to be declared. */
  ref?: Ref<HTMLSelectElement>;
  children: ReactNode;
}

export function Select({
  size = "md",
  invalid = false,
  shellClassName = "w-full",
  style,
  children,
  ...rest
}: SelectProps) {
  const glyph = CHEVRON_BOX[size];

  return (
    <span className={`relative inline-flex min-w-0 items-center ${shellClassName}`}>
      <select
        {...rest}
        aria-invalid={invalid || undefined}
        /*
          `peer` so the chevron can follow the control's disabled state. It cannot inherit it:
          the glyph is a SIBLING, because a child of `<select>` may only be `<option>` or
          `<optgroup>` and anything else is dropped by the parser.
        */
        className={[
          "peer appearance-none cursor-pointer disabled:cursor-not-allowed",
          CONTROL_SURFACE,
          CONTROL_PAD[size],
          CONTROL_LEADING[size],
          CHEVRON_CLEARANCE[size],
          borderFor(invalid),
        ].join(" ")}
        style={{ fontSize: CONTROL_FONT_SIZE[size], ...style }}
      >
        {children}
      </select>

      {/*
        Decorative: the accessible name is the label, and the fact that this is a dropdown is
        already in the control's role. Announcing "chevron" here would be noise.

        `pointer-events-none` so the glyph is not a dead zone — clicking the arrow is how most
        people open a select, and an interactive-looking span that swallows the click is worse
        than no arrow at all.
      */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute ${CHEVRON_POSITION[size]} text-ink/70 peer-disabled:text-ink/40`}
      >
        <svg
          width={glyph.width}
          height={glyph.height}
          viewBox="0 0 10 6"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
        >
          <path d="M1 1L5 5L9 1" />
        </svg>
      </span>
    </span>
  );
}
