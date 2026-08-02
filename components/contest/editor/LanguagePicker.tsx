"use client";

import { useId } from "react";

import { Select } from "@/components/ui/Select";
import { LanguageSchema, type Language } from "@/lib/schemas/judge";

import { LANGUAGE_LABEL } from "./types";

/**
 * The one dropdown a student touches, and the reason `components/ui/Select` grew a real popup.
 *
 * It used to be a native `<select>` on the argument that the platform control is keyboard
 * complete, screen-reader labelled, and the iOS and Android wheel on a phone. All three of those
 * were true and none of them are given up: `ui/Select` still renders the native element on a
 * coarse pointer and through hydration, and implements the full APG combobox keyboard on a fine
 * one. What the native control could not do was be SEEN. Its open list is an operating-system
 * window: not in the document, not styleable, not screenshottable, not visible to axe, and not
 * assertable — a pixel diff of the 700px below an open one differs from the closed capture in
 * exactly zero pixels. So the control a student uses ten times a night was the one surface of
 * this product that no gate had ever executed and no reviewer had ever looked at.
 *
 * Nothing about THIS file's contract changed in that move: same props, same `onChange`, same
 * `<option>` children. The trigger's metrics are the same measurements too.
 *
 * The rationale used to read "it is two languages". It is ten — five runtimes and their compile
 * variants (`VARIANTS` in lib/judge/runtimes.ts), six human languages: Python, Java 8/11/17/21,
 * C, C++11/17, JavaScript, Go. A native select handles ten fine; the stale count is fixed here
 * because a comment that miscounts the thing the file exists for invites someone to "simplify"
 * the control on a premise that has not been true for months.
 *
 * **The option list is `allowed` and nothing else.** It arrives as `ProblemDetail.allowedLanguages`
 * — the problem's own column, straight off the server — and the label for each id comes from
 * `LANGUAGE_LABEL`, which is built from the registry. Neither the ids nor the labels are restated
 * anywhere in this file: a hardcoded list here would silently disagree with what the judge will
 * actually accept, and the student would find out by having a submission refused.
 *
 * **The control is `components/ui/Select` and no longer drawn here.** It used to be `rounded`
 * (4px) on `border-ink/25` — neither of which is a token: DESIGN.md §5a has three radii and
 * §5b replaced eleven hand-picked `border-ink/N` alphas with three rule weights, and this
 * control was off both scales. Measured against the admin selects on the same commit it was
 * 34px tall at a 4px corner where they were 42px and flat, which is how one product ends up
 * with four dropdowns that look like four products.
 *
 * It stays `size="sm"`: this one lives in the editor's header strip beside `Button size="sm"`
 * and a `--text-xs` caption, and a 42px form-row control in that bar would tower over both.
 */

export interface LanguagePickerProps {
  value: Language;
  allowed: readonly Language[];
  onChange: (next: Language) => void;
  disabled?: boolean;
}

export function LanguagePicker({ value, allowed, onChange, disabled = false }: LanguagePickerProps) {
  const id = useId();

  return (
    <div className="flex min-w-0 items-center gap-2">
      <label htmlFor={id} className="shrink-0 text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
        Language
      </label>
      <Select
        id={id}
        size="sm"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          // The DOM hands back a string; narrow it rather than casting it.
          const parsed = LanguageSchema.safeParse(event.target.value);
          if (parsed.success) onChange(parsed.data);
        }}
        // Roomy like HackerRank's, which is a wide control rather than a squeezed one — but
        // `max-w-full` so it shrinks instead of pushing the header bar past 360px.
        shellClassName="w-52 max-w-full"
      >
        {allowed.map((language) => (
          <option key={language} value={language}>
            {LANGUAGE_LABEL[language]}
          </option>
        ))}
      </Select>
    </div>
  );
}
