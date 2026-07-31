"use client";

import { useId } from "react";

import { LanguageSchema, type Language } from "@/lib/schemas/judge";

import { LANGUAGE_LABEL } from "./types";

/**
 * A native `<select>`, on purpose. It is two languages, it must work on a phone, and the
 * platform control is already keyboard-complete and screen-reader-labelled — a custom
 * listbox here would be more code and less accessible.
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
