"use client";

import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

import {
  CONTROL_LEADING,
  CONTROL_PAD,
  CONTROL_SURFACE,
  Select as SelectTrigger,
  type SelectProps as SelectTriggerProps,
} from "@/components/ui/Select";

/**
 * Admin form controls.
 *
 * These are not a second `Button` — `components/ui/Button` is imported for every action in
 * this surface. What is local here is the label/hint/error wiring, which nothing outside
 * the admin forms uses.
 *
 * Every control ties its own label, hint and error together with generated ids, because the
 * failure mode this prevents — an error message that is visible but not announced — is
 * exactly the kind of thing that passes a glance and fails a screen reader.
 *
 * **This is where a rejected field is answered**, and the reason that matters is in
 * `components/admin/Panel.tsx`: a validation refusal rendered as a black `AlertPlate` at the top
 * of the page reads as a judge failure, and it puts the answer somewhere other than the field
 * the organizer was typing in.
 *
 * ## Tokens
 *
 * Controls are `--radius-flat`: DESIGN.md §5a's rule is that a rectangle you type into or read
 * data out of has square corners, and only a control or a section is rounded. The hint is muted
 * by its own colour alpha (`text-ink/60`, the documented AA floor) and never by a wrapper
 * `opacity`, which multiplies with child alpha — `tests/a11y/team-screens.spec.ts` fails this
 * surface by name for it.
 *
 * ## The box comes from `components/ui/Select`
 *
 * Surface, corner, rule weight, padding and the disabled skin are imported rather than written
 * here, so a select and the text input beside it in the same grid row cannot drift apart. They
 * had: the editor's language picker was 34px at a 4px corner on an `ink/25` rule while these
 * were 42px, flat, on `--rule-edge`.
 *
 * The disabled skin moved with them, and that was a bug fix, not a reshuffle. It used to be
 * `disabled:opacity-60` on the control, and `opacity` MULTIPLIES with child alpha — so the
 * placeholder, already `text-ink/60`, landed at 0.36 on a disabled field. It is a flat fill and
 * muted ink now, the same way `components/ui/Button.tsx` does it.
 */

const CONTROL = `${CONTROL_SURFACE} ${CONTROL_PAD.md} ${CONTROL_LEADING.md} placeholder:text-ink/60`;

function borderFor(invalid: boolean): string {
  // `--panther` is 5.08 on paper: AA, and the only palette colour that may carry meaning
  // as text on this surface (DESIGN.md §2).
  //
  // `focus:border-ink` is the reference's darkened focus border (see the rationale on
  // CONTROL_SURFACE in components/ui/Select.tsx); invalid keeps panther even focused, so the
  // error signal is never repainted away by the caret arriving to fix it.
  return invalid ? "border-panther" : "border-rule-edge focus:border-ink";
}

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  /**
   * Lets the control run the full column when the two-column layout engages. Single-line
   * controls stop at `max-w-md`, because in the reference (`12.23.42`) the Organization Name
   * input is ~310px in a page-wide column while the Tagline TEXTAREA runs the whole width.
   * Set by `TextArea`; everything single-line leaves it false.
   */
  wide?: boolean;
  children: (ids: {
    controlId: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => ReactNode;
}

/**
 * ## The label sits BESIDE the control, as in every reference admin form
 *
 * HackerRank's admin forms (`12.23.42`, `12.24.35`) are two-column: label in a left column,
 * control in the right, red asterisk on the label, hints and errors under the control. Ours
 * stacked the label above, which the inventory lists as C5's layout defect.
 *
 * The switch is a CONTAINER query, not a viewport one, because these fields also render
 * inside narrow inline panels (the move-participant form in a team card, for one) where a
 * 12rem label column would crush the control on a wide monitor. Below a 36rem-wide
 * container (`@xl`) the field stacks exactly as before; at or above it, the reference's
 * two-column grid engages. The `@container` wrapper is the field's own width, so each field
 * decides for itself.
 *
 * `@xl:pt-2.5` on the label centres its 20px line against the 42px md control box; on a
 * textarea it reads as first-line alignment, which is what the reference does with Tagline.
 */
export function Field({ label, hint, error, required = false, wide = false, children }: FieldShellProps) {
  const base = useId();
  const controlId = `${base}-control`;
  const hintId = `${base}-hint`;
  const errorId = `${base}-error`;
  const invalid = typeof error === "string" && error.length > 0;

  const describedBy =
    [hint !== undefined ? hintId : null, invalid ? errorId : null]
      .filter((v) => v !== null)
      .join(" ") || undefined;

  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-tight @xl:grid-cols-[12rem_minmax(0,1fr)] @xl:gap-x-group">
        <label
          htmlFor={controlId}
          className="font-semibold @xl:pt-2.5"
          style={{ fontSize: "var(--text-sm)" }}
        >
          {label}
          {required && (
            <span className="text-panther" aria-hidden="true">
              {" *"}
            </span>
          )}
          {required && <span className="sr-only"> (required)</span>}
        </label>
        <div className={`flex min-w-0 flex-col gap-tight ${wide ? "" : "@xl:max-w-md"}`}>
          {children({ controlId, describedBy, invalid })}
          {/* Hint BELOW the control: the reference puts helper text under the box
              ("Characters left: 100" beneath the Tagline textarea in 12.23.42), and the
              error already lives there, so a field's answers all arrive in one place. */}
          {hint !== undefined && (
            <p
              id={hintId}
              className="max-w-[70ch] text-ink/60"
              style={{ fontSize: "var(--text-xs)" }}
            >
              {hint}
            </p>
          )}
          {invalid && (
            <p
              id={errorId}
              role="alert"
              className="font-semibold text-panther"
              style={{ fontSize: "var(--text-xs)" }}
            >
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className"> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Quantities use the mono face so columns do not jitter (DESIGN.md §4). */
  numeric?: boolean;
};

export function TextInput({
  label,
  hint,
  error,
  numeric = false,
  required,
  ...rest
}: TextInputProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {({ controlId, describedBy, invalid }) => (
        <input
          {...rest}
          id={controlId}
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={`${CONTROL} ${borderFor(invalid)} ${numeric ? "numeric" : ""}`}
        />
      )}
    </Field>
  );
}

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "className"> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  mono?: boolean;
};

export function TextArea({ label, hint, error, mono = false, required, ...rest }: TextAreaProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required} wide>
      {({ controlId, describedBy, invalid }) => (
        <textarea
          {...rest}
          id={controlId}
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={`${CONTROL} ${borderFor(invalid)} ${mono ? "numeric" : ""}`}
        />
      )}
    </Field>
  );
}

type SelectProps = Omit<
  SelectTriggerProps,
  "id" | "invalid" | "shellClassName" | "size" | "aria-invalid"
> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
};

export function Select({ label, hint, error, required, children, ...rest }: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {({ controlId, describedBy, invalid }) => (
        // The trigger is `components/ui/Select`; what this adds is the label, hint and error
        // wiring that every control on this surface shares. `size` is fixed at `md` because an
        // admin form row is the only place these appear, and a form that mixed two trigger
        // heights down one column would be the drift this consolidation just removed.
        <SelectTrigger
          {...rest}
          id={controlId}
          required={required}
          invalid={invalid}
          aria-describedby={describedBy}
        >
          {children}
        </SelectTrigger>
      )}
    </Field>
  );
}
