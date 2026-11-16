"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

import type { Language } from "@/lib/schemas/judge";

import { draftKey, readDraft, writeDraft, type DraftOwner } from "../data/draft-storage";

export type { DraftOwner } from "../data/draft-storage";

/**
 * Keeps a student's in-progress code across a reload, a closed tab, and a second tab.
 *
 * A dropped Wi-Fi connection, an accidental back gesture, or a browser deciding to reload a
 * backgrounded tab should not cost forty minutes of work. Drafts are per problem *and* per
 * language, so switching to Java and back does not destroy the Python attempt.
 *
 * ## localStorage, keyed by WHO, and kept for nobody else
 *
 * Drafts used to live in `sessionStorage`, on the reasoning that lab machines are shared. The cost
 * was found on the night's walkthrough: closing the tab, or opening the same problem in a new
 * tab, lost the code, and a returning student saw the starter template under a "Solved" badge.
 * So the draft now outlives the tab. The sharing concern is answered twice: the key carries the
 * contest and participant, so no editor opens another student's draft, and `draft-storage.ts`
 * deletes every other student's drafts as soon as the page knows who is signed in, so they are
 * not left readable in devtools either.
 *
 * Nothing clears a draft on submit, on purpose: a student keeps editing exactly what they sent.
 *
 * ## Why `useSyncExternalStore`
 *
 * Storage is an external store, and this is the API for reading one. Reading it in an effect and
 * calling setState is both a cascading render and, because the server has no storage, a
 * hydration mismatch waiting to happen. `getServerSnapshot` returns null so the server and the
 * hydration pass agree on the fallback, and the stored draft arrives immediately afterwards. The
 * `storage` event also carries an edit made in another tab of the same problem.
 */

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

/**
 * The editor's value and its setter. `owner` is null until the session read has answered, and
 * nothing is read or written before that, so a draft can never be filed under the wrong student.
 */
export function useDraft(
  owner: DraftOwner | null,
  slug: string,
  language: Language,
  fallback: string,
): [string, (next: string) => void] {
  const key = owner === null ? null : draftKey(owner, slug, language);

  const stored = useSyncExternalStore(
    subscribe,
    () => (key === null ? null : readDraft(key)),
    () => null,
  );

  // Local edits are tagged with the key they belong to, so switching language shows that
  // language's draft rather than carrying the previous one across.
  const editKey = key ?? `${slug}.${language}`;
  const [edit, setEdit] = useState<{ key: string; value: string } | null>(null);
  const value = edit !== null && edit.key === editKey ? edit.value : (stored ?? fallback);

  const update = useCallback(
    (next: string) => {
      setEdit({ key: editKey, value: next });
      if (key !== null) writeDraft(key, next);
    },
    [editKey, key],
  );

  return [value, update];
}
