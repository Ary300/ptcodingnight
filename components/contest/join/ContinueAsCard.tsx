"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui";

import { forgetDrafts } from "../data/draft-storage";
import { clearParticipant } from "../data/participant";
import { GuestAvatar } from "../GuestAvatar";

export interface ContinueAsCardProps {
  readonly displayName: string;
  readonly firstName: string;
  /** Seeds the generated mark, the same seed the competitor chrome's menu uses. */
  readonly participantId: string;
  /** Null when the contest row could not be read. */
  readonly contestName: string | null;
  /** Where the page goes once signed out: the page the card is on, now showing the code form. */
  readonly signedOutHref: string;
}

/**
 * A recognised student at the door: their mark, their name, "Continue as Jo", and a way out.
 *
 * The account chooser's shape. A student who already typed their slip's code comes back to `/` or
 * `/join` and is offered their seat by name, rather than the stranger's page or a generic "Open
 * the contest". "Not you? Sign out" is for the shared lab machine: the same three steps the
 * competitor menu takes (end the session on the server, forget this tab's identity, forget the
 * drafts), then the page reloads signed out with the code form ready.
 */
export function ContinueAsCard({
  displayName,
  firstName,
  participantId,
  contestName,
  signedOutHref,
}: ContinueAsCardProps) {
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
        window.location.assign(signedOutHref);
      }
    })();
  };

  return (
    <section
      aria-label="Signed in"
      className="w-full max-w-sm rounded-panel border border-rule-edge bg-paper p-4"
    >
      <div className="flex items-center gap-3">
        {/* The mark's tile is paper, so a hairline keeps its edge on a paper card. */}
        <span className="shrink-0 overflow-hidden rounded border border-rule-edge">
          <GuestAvatar seed={participantId} sizeClass="h-10 w-10 block" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold" style={{ fontSize: "var(--text-sm)" }}>
            {displayName}
          </p>
          {contestName !== null && (
            <p className="truncate text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
              {contestName}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href="/contest"
          className="rounded-chip bg-panther px-4 py-2 font-semibold whitespace-nowrap text-paper hover:bg-panther-deep"
          style={{ fontSize: "var(--text-sm)" }}
        >
          Continue as {firstName}
        </Link>
        <span className="flex items-center gap-1.5 text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
          <span>Not you?</span>
          <Button type="button" variant="quiet" size="sm" disabled={busy} onClick={signOut}>
            Sign out
          </Button>
        </span>
      </div>
    </section>
  );
}
