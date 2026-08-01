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
 * now a different KIND of object — no fill, no border, muted ink — instead of a faded live one.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
export type ButtonSize = "sm" | "md";

/*
 * Weight lives here and NOT in the shared base string. Two `font-*` utilities on one element
 * are resolved by the order Tailwind emits them, not by the order they appear in the class
 * list, so a base `font-semibold` that a variant tries to override is a coin flip.
 */
const VARIANT: Record<ButtonVariant, string> = {
  primary: "rounded-chip bg-panther font-semibold text-paper hover:bg-panther-deep",
  secondary:
    "rounded-chip border border-rule-edge bg-transparent font-semibold text-ink hover:bg-ink/5",
  ghost: "rounded-chip bg-transparent font-medium text-ink/70 hover:bg-ink/5 hover:text-ink",
  /*
   * Destructive and audit-logged actions (verdict override, rejudge). The one use of the accent
   * outside identity and the primary action, and it is stated as an exception in DESIGN.md §2
   * rather than left to be inferred: a red button for a destructive act is a convention old
   * enough that removing it would cost more than it saved.
   */
  danger: "rounded-chip border border-panther font-semibold text-panther hover:bg-panther hover:text-paper",
  /*
   * A row action. Text, not a box. `text-ink/60` is the documented AA floor on paper (5.15:1),
   * and it darkens to full ink on hover rather than changing colour, so the affordance is weight
   * and underline — never colour alone.
   */
  quiet: "font-medium text-ink/60 underline-offset-4 hover:text-ink hover:underline",
};

/** Padding for the variants that are boxes. `quiet` is text and takes none. */
const PAD: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1",
  md: "px-4 py-2",
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
        quiet ? "min-h-8" : PAD[size],
        VARIANT[variant],
        "disabled:cursor-not-allowed",
        // Tailwind emits `disabled:` after `hover:`, so a disabled control cannot be hovered
        // back into looking live.
        quiet
          ? "disabled:text-ink/40 disabled:no-underline"
          : "disabled:border-transparent disabled:bg-ink/8 disabled:text-ink/40",
        className ?? "",
      ].join(" ")}
      style={{ fontSize: FONT_SIZE[size], ...style }}
      {...rest}
    />
  );
}
