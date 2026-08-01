"use client";

import { useId } from "react";

import { LanguageSchema, type Language } from "@/lib/schemas/judge";

import { LANGUAGE_LABEL } from "./types";

/**
 * A native `<select>`, on purpose: it must work on a phone, and the platform control is already
 * keyboard-complete and screen-reader-labelled — a custom listbox here would be more code and
 * less accessible.
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
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          // The DOM hands back a string; narrow it rather than casting it.
          const parsed = LanguageSchema.safeParse(event.target.value);
          if (parsed.success) onChange(parsed.data);
        }}
        // Roomy like HackerRank's, which is a wide control rather than a squeezed one — but
        // `max-w-full` so it shrinks instead of pushing the header bar past 360px.
        className="w-52 max-w-full rounded border border-ink/25 bg-paper px-2 py-1.5 text-ink disabled:opacity-50"
        style={{ fontSize: "var(--text-xs)" }}
      >
        {allowed.map((language) => (
          <option key={language} value={language}>
            {LANGUAGE_LABEL[language]}
          </option>
        ))}
      </select>
    </div>
  );
}
