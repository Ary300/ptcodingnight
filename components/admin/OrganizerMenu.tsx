"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The organizer's account control — and, more to the point, the way OUT.
 *
 * ## Why this exists
 *
 * There was no sign-out anywhere in the organizer console. Not on any of its seven screens, and
 * not on the competitor ones either: `CompetitorChrome` renders its account menu only when the
 * viewer is a joined COMPETITOR, and an organizer is not one — so `/contest`, `/team` and
 * `/submissions` showed an ADMIN no account control at all.
 *
 * `DELETE /api/admin/session` had been exported and working the whole time. Nothing called it.
 *
 * The session lasts 12 hours on a `maxAge` cookie, so on the shared projector laptop it survived
 * closing the browser into the next day — and what it fronts is freeze, rejudge, verdict override
 * and side-activity points entry.
 *
 * ## Deliberately not `components/contest/UserMenu`
 *
 * That component is built around a competitor's identity — the highlighted chip carries team and
 * assigned problem set, and its items are the competitor destinations. Reusing it would mean
 * making every one of those optional, which is how one component becomes two components wearing
 * the same name. The shared thing here is the interaction, and it is nine lines.
 */

export interface OrganizerMenuProps {
  readonly displayName: string;
}

export function OrganizerMenu({ displayName }: OrganizerMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (root.current !== null && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const signOut = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      // REVOKES the row rather than only clearing the cookie — sessions live in Postgres exactly
      // so they can be ended, and a sign-out that only forgets locally leaves a token that still
      // authenticates if anyone captured it.
      await fetch("/api/admin/session", { method: "DELETE" });
    } catch {
      // Leave anyway. Somebody walking away from a shared laptop must not be held on the page by
      // a failed request.
    } finally {
      window.location.assign("/sign-in");
    }
  }, []);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-chip border border-rule-edge-inverse px-2.5 py-1 font-semibold text-paper hover:border-rule-firm-inverse"
        style={{ fontSize: "var(--text-xs)" }}
      >
        <span className="max-w-[12ch] truncate">{displayName}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {open && (
        // `text-ink` on the panel: it is a paper surface inside a `text-paper` header, and without
        // this every item inherits near-white on near-white and the menu opens invisible.
        <div className="absolute right-0 z-50 mt-1 w-56 rounded-panel border border-rule-edge bg-paper text-ink shadow-lg">
          <ul role="menu" className="py-1">
            <li role="none">
              <Link
                role="menuitem"
                href="/contest"
                className="block px-4 py-2.5 hover:bg-ink/5"
                style={{ fontSize: "var(--text-sm)" }}
                onClick={() => setOpen(false)}
              >
                View as a student
              </Link>
            </li>
            <li role="none" className="border-t border-rule-hair">
              <button
                role="menuitem"
                type="button"
                disabled={busy}
                onClick={() => void signOut()}
                className="block w-full px-4 py-2.5 text-left font-semibold text-panther hover:bg-ink/5"
                style={{ fontSize: "var(--text-sm)" }}
              >
                {busy ? "Signing out…" : "Sign out"}
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
