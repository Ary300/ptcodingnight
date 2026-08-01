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
  return invalid ? "border-panther" : "border-rule-edge";
}

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: (ids: {
    controlId: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => ReactNode;
}

export function Field({ label, hint, error, required = false, children }: FieldShellProps) {
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
    <div className="flex flex-col gap-tight">
      <label htmlFor={controlId} className="font-semibold" style={{ fontSize: "var(--text-sm)" }}>
        {label}
        {required && (
          <span className="text-panther" aria-hidden="true">
            {" *"}
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {hint !== undefined && (
        <p id={hintId} className="max-w-[70ch] text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          {hint}
        </p>
      )}
      {children({ controlId, describedBy, invalid })}
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
    <Field label={label} hint={hint} error={error} required={required}>
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
