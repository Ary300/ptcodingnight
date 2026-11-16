import type { Language } from "@/lib/schemas/judge";

/**
 * The language the editor opens in when the student has not picked one.
 *
 * Java 21, the organizers' choice on 2026-11-16: about nine in ten students on the night write
 * Java, so opening in Python made almost everyone switch first. A problem that does not offer
 * Java falls back to its first allowed language, and a problem with none loaded yet to Java.
 */
export const PREFERRED_DEFAULT_LANGUAGE: Language = "JAVA_21";

export function defaultLanguageFor(allowed: readonly Language[] | undefined): Language {
  if (allowed === undefined || allowed.length === 0) return PREFERRED_DEFAULT_LANGUAGE;
  if (allowed.includes(PREFERRED_DEFAULT_LANGUAGE)) return PREFERRED_DEFAULT_LANGUAGE;
  return allowed[0] ?? PREFERRED_DEFAULT_LANGUAGE;
}

const STORAGE_KEY = "ptcn.language.v1";
const listeners = new Set<() => void>();

function readStoredLanguage(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Remember the language a student picked, so a reload or the next problem opens in it instead of
 * snapping back to Java and hiding their Python or C++ draft. A preference, not a secret: it is
 * one language name, shared by whoever uses this browser.
 */
export function rememberLanguage(language: Language): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Storage blocked or full: the choice still holds for this page, it just is not remembered.
  }
  for (const listener of listeners) listener();
}

/** For `useSyncExternalStore`: the stored language name, or null on the server or when unset. */
export const rememberedLanguageStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: (): string | null => readStoredLanguage(),
  getServerSnapshot: (): string | null => null,
};

/** The remembered language when the problem offers it, otherwise the default. */
export function initialLanguageFor(
  allowed: readonly Language[] | undefined,
  remembered: string | null,
): Language {
  const match = allowed?.find((language) => language === remembered);
  return match ?? defaultLanguageFor(allowed);
}
