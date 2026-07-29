"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

import type { Language } from "@/lib/schemas/judge";

/**
 * Keeps a student's in-progress code across a reload.
 *
 * A dropped Wi-Fi connection, an accidental back gesture, or a browser deciding to reload a
 * backgrounded tab should not cost forty minutes of work. Drafts are per problem *and* per
 * language, so switching to Java and back does not destroy the Python attempt.
 *
 * `sessionStorage`, matching `data/participant.ts`: the lab machines are shared, and code
 * that outlives the tab is code the next student finds.
 *
 * ## Why `useSyncExternalStore`
 *
 * Storage is an external store, and this is the API for reading one. Reading it in an effect
 * and calling setState is both a cascading render and — because the server has no
 * `sessionStorage` — a hydration mismatch waiting to happen. `getServerSnapshot` returns
 * null so the server and the hydration pass agree on the template, and the stored draft
 * arrives immediately afterwards.
 */

function keyFor(slug: string, language: Language): string {
  return `ptcn.draft.${slug}.${language}`;
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

export function useDraft(
  slug: string,
  language: Language,
  fallback: string,
): [string, (next: string) => void] {
  const key = keyFor(slug, language);

  const stored = useSyncExternalStore(
    subscribe,
    () => window.sessionStorage.getItem(key),
    () => null,
  );

  // Local edits are tagged with the key they belong to, so switching language shows that
  // language's draft rather than carrying the previous one across.
  const [edit, setEdit] = useState<{ key: string; value: string } | null>(null);
  const value = edit !== null && edit.key === key ? edit.value : (stored ?? fallback);

  const update = useCallback(
    (next: string) => {
      setEdit({ key, value: next });
      try {
        window.sessionStorage.setItem(key, next);
      } catch {
        // Storage full or blocked. Losing the draft is bad; losing the keystroke is worse,
        // so the editor keeps working and only persistence is given up.
      }
    },
    [key],
  );

  return [value, update];
}
