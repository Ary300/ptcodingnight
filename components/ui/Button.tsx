import type { ButtonHTMLAttributes, Ref } from "react";

/**
 * Shared button. Orchestrator-owned so three frontend scopes do not each grow their own.
 *
 * Focus is never removed — G9 requires the whole submit flow to complete keyboard-only, and
 * the ring is defined globally in app/globals.css.
 *
 * ## Why there is a `quiet` variant and a `size`
 *
 * Every button in this product used to be `px-4 py-2` at body size, which meant a row action
 * and a page action were the same object. `/admin/console` rendered a full-size `Rejudge` and a
 * red-outlined `Override` on each of fourteen rows: twenty-eight controls all shouting at once,
 * with nothing to say which one the organizer came for. Both references solve this the same way
 * — an in-row action is TEXT, and only the page's one primary action is a filled button.
 *
 * So: `quiet` for anything that lives inside a row, `size="sm"` for anything inside dense
 * chrome, and `primary` for the one thing a screen exists to do.
 *
 * ## Why `disabled` is a skin and not an opacity
 *
 * `disabled:opacity-50` over a solid `--panther` fill renders a washed pink button that reads as
 * enabled-and-somehow-broken rather than as off — measured on `/sign-in`, where the Sign in
 * button sits disabled until the passcode is typed. DESIGN.md §7 exempts disabled controls from
 * the contrast floor, and axe agrees, but it never exempted them from being legible. Disabled is
 * a different KIND of object — a drained fill and muted ink — instead of a faded live one.
 *
 * The FILL is what carries the state, and it has to be dark enough to still read as a button.
 * Measured on HackerRank's disabled Sign up (`12.20.45`): fill `#C1C2D4` on a white page, a 24%
 * step down from the ground, with the label left white. Ours was `bg-ink/8`, which composites to
 * `#E9E6E5` on paper — a 7% step, so the button stopped being a box at all and a form with a
 * disabled submit looked like a form with no submit. `bg-ink/20` is an 18% step, close to the
 * reference. The label goes the other way from HackerRank's, to `text-ink/60` (the documented
 * muted floor), because white on that fill measures 1.5:1 and their own white-on-`#C1C2D4` is
 * 1.79:1 — legible is the half of this we are not copying.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
export type ButtonSize = "sm" | "md";

/*
 * Weight lives here and NOT in the shared base string. Two `font-*` utilities on one element
 * are resolved by the order Tailwind emits them, not by the order they appear in the class
 * list, so a base `font-semibold` that a variant tries to override is a coin flip.
 */
/*
 * The corner is raw `rounded` (4px), not `--radius-chip` (3px): every button in the reference
 * screenshots measures ~4-6px, and 4px is what `components/ui/Select.tsx` now gives every
 * control for the same reason, so a button beside an input shares one corner. 4px is off the
 * three-radius token scale; globals.css is orchestrator-owned, so promoting it to a
 * `--radius-control` token is requested in the Group C report rather than done here. If the
 * radius here changes, change CONTROL_SURFACE in Select.tsx with it.
 *
 * Every boxed variant carries a 1px border (transparent where it has no colour) so that a
 * primary next to a secondary is the same height to the pixel, and both match the 42px md
 * control box from Select.tsx.
 */
const VARIANT: Record<ButtonVariant, string> = {
  /*
   * The border is `--panther-deep`, not transparent. Every filled button in the reference carries
   * a 1px rim one shade darker than its own fill: measured on HackerRank's Save Changes
   * (`12.24.11`), fill `rgb(99,197,112)` with a uniform 1px `rgb(77,165,92)` edge on all four
   * sides, and again on Submit Code and View all received submissions. It is what stops a filled
   * button dissolving into a tinted toolbar or a coloured card. `--panther-deep` is already this
   * button's hover fill, so hover reads as the rim closing over the face.
   */
  primary: "rounded border border-panther-deep bg-panther font-semibold text-paper hover:bg-panther-deep",
  /*
   * `bg-paper`, not transparent: HR's secondary buttons (Run Code, Preview Landing Page,
   * Add Challenge) are a white or near-white FILL with a grey border, so on a tinted row or
   * toolbar the button reads as its own surface rather than a floating outline.
   */
  secondary:
    "rounded border border-rule-edge bg-paper font-semibold text-ink hover:bg-ink/5",
  ghost: "rounded border border-transparent bg-transparent font-medium text-ink/70 hover:bg-ink/5 hover:text-ink",
  /*
   * Destructive and audit-logged actions (verdict override, rejudge). The one use of the accent
   * outside identity and the primary action, and it is stated as an exception in DESIGN.md §2
   * rather than left to be inferred: a red button for a destructive act is a convention old
   * enough that removing it would cost more than it saved.
   */
  danger: "rounded border border-panther font-semibold text-panther hover:bg-panther hover:text-paper",
  /*
   * A row action. Text, not a box. `text-ink/60` is the documented AA floor on paper (5.15:1),
   * and it darkens to full ink on hover rather than changing colour, so the affordance is weight
   * and underline — never colour alone.
   */
  quiet: "font-medium text-ink/60 underline-offset-4 hover:text-ink hover:underline",
};

/**
 * Padding for the variants that are boxes. `quiet` is text and takes none.
 *
 * Sized against the reference, not against what fits: ours measured ~36px, one size class short
 * on every screen. With the pinned line box below, md is now 24 + 16 + 2 = 42px and sm is
 * 20 + 12 + 2 = 34px, which are exactly the md and sm control heights in Select.tsx, so a button
 * sits flush beside a select or an input in the same row.
 *
 * Re-measured against the reference by pixel scan, because the number this comment used to quote
 * ("~20-24px side padding") was not in the screenshots. HackerRank's page CTAs are **40px tall
 * with 16-17px of side padding**, four of them in agreement: Save Changes 133x40 with padL 16.0
 * and padR 16.0 (`12.24.11`), the same button on the profile (`12.22.10`), Create & Publish
 * 166.5x40 padL 17.0 (`12.19.19`), and the modal's Add Challenge 126x40 padL 16.5 (`12.24.25`).
 *
 * `md` stays at 42 / 20px anyway, and both deltas are deliberate:
 *   - the 2px of height is Select.tsx's md control box, and a button that no longer lines up with
 *     the input beside it costs more than it buys;
 *   - HackerRank sets its label at 14px and we set ours at `--text-sm` (16px), so 20px of padding
 *     is 1.25x our type against their 1.14x. Dropping to 16px would make ours proportionally
 *     TIGHTER than the reference while matching it absolutely.
 */
const PAD: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5",
  md: "px-5 py-2",
};

/**
 * The line box, pinned for the same reason Select.tsx pins CONTROL_LEADING: height is
 * padding + border + line box, and leaving the third to the font's `normal` made every
 * button height a per-browser font metric instead of a fact.
 */
const LEADING: Record<ButtonSize, string> = {
  sm: "leading-5",
  md: "leading-6",
};

const FONT_SIZE: Record<ButtonSize, string> = {
  sm: "var(--text-xs)",
  md: "var(--text-sm)",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** `sm` for row and toolbar actions, `md` for a page's own actions. Defaults to `md`. */
  size?: ButtonSize;
  /**
   * React 19 passes `ref` as an ordinary prop to function components, so no `forwardRef` is
   * needed — but it still has to be declared. Needed by anything that must move focus, such
   * as a confirmation dialog focusing its default action, which the keyboard-only
   * requirement in G9 depends on.
   */
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  style,
  ...rest
}: ButtonProps) {
  const quiet = variant === "quiet";

  return (
    <button
      className={[
        "inline-flex items-center justify-center gap-2 transition-colors",
        // A text button still has to be hittable on a phone: 32px of height without a box.
        quiet ? "min-h-8" : `${PAD[size]} ${LEADING[size]}`,
        VARIANT[variant],
        "disabled:cursor-not-allowed",
        // Tailwind emits `disabled:` after `hover:`, so a disabled control cannot be hovered
        // back into looking live.
        quiet
          ? "disabled:text-ink/40 disabled:no-underline"
          : "disabled:border-transparent disabled:bg-ink/20 disabled:text-ink/60",
        className ?? "",
      ].join(" ")}
      style={{ fontSize: FONT_SIZE[size], ...style }}
      {...rest}
    />
  );
}
