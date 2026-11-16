"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui";

import { forgetDrafts } from "../data/draft-storage";
import { clearParticipant } from "../data/participant";

export interface SignedInNoticeProps {
  displayName: string;
  /** Null when the contest row could not be read; the link still goes to the contest. */
  contestName: string | null;
}

/**
 * The top of `/join` for somebody who is already signed in.
 *
 * It used to show the empty code form and nothing else, so a student who came back to this page
 * could not tell whether they were in, and typing a second code was the only thing on offer. Now
 * it says who is signed in, links to their contest, and offers to sign out, which is what a
 * student at a shared laptop needs before typing their own code.
 *
 * Signing out is the same three steps the competitor menu takes: end the session on the server,
 * forget this tab's identity, forget the drafts. Then the page reloads, signed out, with the form
 * ready.
 */
export function SignedInNotice({ displayName, contestName }: SignedInNoticeProps) {
  const [busy, setBusy] = useState(false);

  const signOut = (): void => {
    setBusy(true);
    void (async () => {
      try {
        await fetch("/api/auth/session", { method: "DELETE" });
      } catch {
        // Best effort, as in the competitor menu: the reload below shows whether it worked.
      } finally {
        clearParticipant();
        forgetDrafts();
        window.location.assign("/join");
      }
    })();
  };

  return (
    <section
      aria-label="Signed in"
      className="mb-6 rounded-panel border border-rule-edge bg-paper p-4"
    >
      <p style={{ fontSize: "var(--text-sm)" }}>
        You are signed in as <strong>{displayName}</strong>
        {contestName === null ? "." : <> for {contestName}.</>}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          href="/contest"
          className="rounded-chip bg-panther px-3 py-1.5 font-semibold text-paper hover:bg-panther-deep"
          style={{ fontSize: "var(--text-xs)" }}
        >
          Open the contest
        </Link>
        <Button type="button" variant="quiet" size="sm" disabled={busy} onClick={signOut}>
          Sign out
        </Button>
      </div>
      <p className="mt-2 text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
        Sign out first if this is not you, then enter your own code below.
      </p>
    </section>
  );
}
