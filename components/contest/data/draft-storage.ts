"use client";

import type { Language } from "@/lib/schemas/judge";

/**
 * Where a student's unsubmitted code is kept, and when it is thrown away.
 *
 * Drafts live in localStorage so a closed tab or a second tab does not lose them. localStorage
 * outlives the session, and lab laptops are shared and teammates swap seats, so the key alone
 * (contest, participant, problem, language) is not enough: a key nobody's editor will ever open is
 * still plaintext code in devtools for the next person. So the browser keeps only the CURRENT
 * student's drafts:
 *
 *  - when a competitor session resolves, every draft belonging to anyone else is deleted;
 *  - when the page resolves to no competitor at all, every draft is deleted;
 *  - signing out deletes every draft.
 *
 * What a student submitted is on the server and comes back into the editor from there, so a purge
 * here costs at most the typing since their last submission.
 *
 * Every storage call is guarded: private browsing or a blocked origin costs persistence, never
 * the page.
 */

const PREFIX = "ptcn.draft.v2.";

/** Whose drafts these are. */
export interface DraftOwner {
  readonly contestId: string;
  readonly participantId: string;
}

function ownerPrefix(owner: DraftOwner): string {
  return `${PREFIX}${owner.contestId}.${owner.participantId}.`;
}

export function draftKey(owner: DraftOwner, slug: string, language: Language): string {
  return `${ownerPrefix(owner)}${slug}.${language}`;
}

export function readDraft(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeDraft(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage full or blocked. Losing the draft is bad; losing the keystroke is worse, so the
    // editor keeps working and only persistence is given up.
  }
}

/**
 * Delete every draft on this browser except `owner`'s. Null deletes them all.
 *
 * Keys are collected first and removed afterwards, because removing while indexing shifts the
 * indices under the loop.
 */
export function keepOnlyDraftsOf(owner: DraftOwner | null): void {
  try {
    const keep = owner === null ? null : ownerPrefix(owner);
    const doomed = Array.from({ length: window.localStorage.length }, (_, index) =>
      window.localStorage.key(index),
    ).filter(
      (key): key is string =>
        key !== null && key.startsWith(PREFIX) && (keep === null || !key.startsWith(keep)),
    );
    doomed.forEach((key) => {
      window.localStorage.removeItem(key);
    });
  } catch {
    // Storage blocked: there is nothing stored to delete.
  }
}

/** Sign-out: nobody's drafts stay behind. */
export function forgetDrafts(): void {
  keepOnlyDraftsOf(null);
}
