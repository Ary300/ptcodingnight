"use client";

import { useEffect, useRef, useState } from "react";

import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui";

/**
 * Two-step confirmation for destructive or audit-logged actions.
 *
 * Not `window.confirm`: a native dialog cannot be styled, cannot be tested by axe, and on
 * the night it steals focus from a room-facing screen. This keeps the confirmation inline,
 * moves focus onto it, announces it, and is dismissible with Escape.
 *
 * Admins use this under time pressure with a room watching. Rejudging the wrong participant
 * or unfreezing the board early are both one misclick away, so both get a second click.
 */

export interface ConfirmButtonProps {
  label: string;
  /** Shown in place of the label once armed. Say what will happen, not "Are you sure?". */
  confirmLabel: string;
  onConfirm: () => void;
  variant?: ButtonVariant;
  /**
   * `sm` for a control that lives inside a row or a card, `md` for a page's own action. Without
   * this a row-level confirmation was the same physical size as the page's primary button, which
   * is the thing that made `/admin/console` twenty-eight controls all shouting at once.
   */
  size?: ButtonSize;
  disabled?: boolean;
  className?: string;
}

export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  variant = "danger",
  size = "md",
  disabled = false,
  className,
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);
  // `components/ui/Button` is frozen and does not forward a ref, so focus is moved through
  // the wrapper rather than by adding a near-duplicate button here.
  const armedRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (armed) armedRef.current?.querySelector("button")?.focus();
  }, [armed]);

  if (!armed) {
    return (
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        className={className}
        onClick={() => setArmed(true)}
      >
        {label}
      </Button>
    );
  }

  return (
    <span
      ref={armedRef}
      className="inline-flex items-center gap-2"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setArmed(false);
        }
      }}
    >
      <Button
        type="button"
        variant="primary"
        size={size}
        className={className}
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button type="button" variant="quiet" size={size} onClick={() => setArmed(false)}>
        Cancel
      </Button>
      <span role="status" className="sr-only">
        {confirmLabel}. Press Escape to cancel.
      </span>
    </span>
  );
}
