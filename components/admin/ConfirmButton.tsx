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
  /**
   * The resting button's accessible name, when the visible `label` alone is ambiguous: a list of
   * rows that each have a "Remove" needs every one to say what it removes.
   */
  accessibleName?: string;
  /** The same, for the armed confirm button. */
  confirmAccessibleName?: string;
  /**
   * What pressing the confirm button will do, in a sentence, shown beside it once armed and read
   * out with it. For an action whose effect is not obvious from its name: End contest on a frozen
   * board closes submissions and does NOT reveal, and the organizer has to know which happens.
   */
  description?: string;
}

export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  variant = "danger",
  size = "md",
  disabled = false,
  className,
  accessibleName,
  confirmAccessibleName,
  description,
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
        aria-label={accessibleName}
        onClick={() => setArmed(true)}
      >
        {label}
      </Button>
    );
  }

  return (
    // `motion-swap-in`: arming swaps the label for a confirm cluster in the same frame, and a
    // 3px transform-only rise makes that swap followable. Disarming is deliberately instant — a
    // control returning to rest should just return. The rise does not disturb the focus move in
    // the effect above, and the Buttons inside carry full-strength text on their own ground.
    <span
      ref={armedRef}
      className="motion-swap-in inline-flex flex-wrap items-center gap-2"
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
        aria-label={confirmAccessibleName}
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
      {description !== undefined && (
        <span
          aria-hidden="true"
          data-confirm-description
          className="basis-full font-semibold text-ink"
          style={{ fontSize: "var(--text-sm)" }}
        >
          {description}
        </span>
      )}
      <span role="status" className="sr-only">
        {description === undefined
          ? `${confirmLabel}. Press Escape to cancel.`
          : `${confirmLabel}. ${description} Press Escape to cancel.`}
      </span>
    </span>
  );
}
