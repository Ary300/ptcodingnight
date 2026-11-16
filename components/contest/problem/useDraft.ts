"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

import type { Language } from "@/lib/schemas/judge";

/**
 * Keeps a student's in-progress code across a reload, a closed tab, and a second tab.
 *
 * A dropped Wi-Fi connection, an accidental back gesture, or a browser deciding to reload a
 * backgrounded tab should not cost forty minutes of work. Drafts are per problem *and* per
 * language, so switching to Java and back does not destroy the Python attempt.
 *
 * ## localStorage, keyed by WHO
 *
 * Drafts used to live in `sessionStorage`, on the reasoning that lab machines are shared. The cost
 * was real and measured on the night's walkthrough: closing the tab, or opening the same problem in
 * a new tab, lost the code, and a returning student saw the starter template under a "Solved"
 * badge. So the draft now outlives the tab, and the sharing concern is answered by the key instead:
 * contest, participant, problem and language. A different student signed in on the same machine
 * has a different participant id and never sees this one's code in their editor.
 *
 * Nothing clears a draft on submit, on purpose: a student keeps editing exactly what they sent.
 *
 * Every storage call is wrapped. Private browsing, a full quota or a blocked origin must cost the
 * persistence, never the keystroke.
 *
 * ## Why `useSyncExternalStore`
 *
 * Storage is an external store, and this is the API for reading one. Reading it in an effect
 * and calling setState is both a cascading render and — because the server has no storage — a
 * hydration mismatch waiting to happen. `getServerSnapshot` returns null so the server and the
 * hydration pass agree on the fallback, and the stored draft arrives immediately afterwards. The
 * `storage` event also carries an edit made in another tab of the same problem.
 */

/** Whose drafts these are. Null until the session read has answered; nothing persists before. */
export interface DraftOwner {
  readonly contestId: string;
  readonly participantId: string;
}

const PREFIX = "ptcn.draft.v2.";

export function draftKey(
  owner: DraftOwner,
  slug: string,
  language: Language,
): string {
  return `${PREFIX}${owner.contestId}.${owner.participantId}.${slug}.${language}`;
}

/*
  The old sessionStorage drafts are deliberately NOT read as a fallback. Their key carried no
  participant, so a tab left open across two students would hand the second the first one's code.
*/
function readDraft(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Forget every draft on this browser. Called on sign-out: the key keeps one student's code out of
 * another's editor, and this keeps it off a shared lab machine once its owner has left. Their
 * submitted code is still on the server and comes back into the editor when they sign in again.
 */
export function forgetDrafts(): void {
  try {
    const doomed = Array.from({ length: window.localStorage.length }, (_, index) =>
      window.localStorage.key(index),
    ).filter((key): key is string => key !== null && key.startsWith(PREFIX));
    doomed.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Storage blocked: there is nothing stored to forget.
  }
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

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
      if (key === null) return;
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Storage full or blocked. Losing the draft is bad; losing the keystroke is worse,
        // so the editor keeps working and only persistence is given up.
      }
    },
    [editKey, key],
  );

  return [value, update];
}
