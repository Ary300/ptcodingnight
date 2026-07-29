import type { ButtonHTMLAttributes } from "react";

/**
 * Shared button. Orchestrator-owned so three frontend scopes do not each grow their own.
 *
 * Focus is never removed — G9 requires the whole submit flow to complete keyboard-only, and
 * the ring is defined globally in app/globals.css.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-panther text-paper hover:bg-panther-deep",
  secondary: "border border-ink/20 bg-transparent text-ink hover:bg-ink/5",
  ghost: "bg-transparent text-ink/70 hover:text-ink hover:bg-ink/5",
  // Destructive and audit-logged actions (verdict override, rejudge).
  danger: "border border-panther text-panther hover:bg-panther hover:text-paper",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = "primary", className, ...rest }: ButtonProps) {
  return (
    <button
      className={[
        "inline-flex items-center justify-center gap-2 rounded px-4 py-2",
        "font-semibold transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT[variant],
        className ?? "",
      ].join(" ")}
      {...rest}
    />
  );
}
