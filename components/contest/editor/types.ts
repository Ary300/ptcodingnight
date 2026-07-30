import { LANGUAGE_IDS, VARIANTS } from "@/lib/judge/runtimes";

import type { Language } from "@/lib/schemas/judge";

/**
 * The editor's public surface — the one thing that must not change when the engine behind
 * it does. See `CodeEditor.tsx` for the Monaco seam.
 */
export interface CodeEditorProps {
  value: string;
  onChange: (next: string) => void;
  language: Language;
  disabled?: boolean;
  /** Ctrl/Cmd+Enter. Judged submit is a deliberate action, so this confirms nothing. */
  onSubmitShortcut?: () => void;
  /** Accessible name for the editing surface. */
  label: string;
}

/**
 * Both derived from the registry rather than restated here.
 *
 * A hardcoded map would mean adding a language is two edits and one of them is easy to forget —
 * and a missing entry here is a `Record` type error at best, an empty editor at worst.
 */
export const LANGUAGE_LABEL: Readonly<Record<Language, string>> = Object.fromEntries(
  LANGUAGE_IDS.map((id) => [id, VARIANTS[id].label]),
) as Readonly<Record<Language, string>>;

/** Starter files, so the first thing a student sees is not an empty box. */
export const LANGUAGE_TEMPLATE: Readonly<Record<Language, string>> = Object.fromEntries(
  LANGUAGE_IDS.map((id) => [id, VARIANTS[id].starter]),
) as Readonly<Record<Language, string>>;
