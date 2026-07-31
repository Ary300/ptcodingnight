"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * The account menu HackerRank puts at the right of its nav: a chevron button, a panel with the
 * viewer's headline stat at the top, then divided destinations and finally sign-out.
 *
 * ## What goes in the highlighted slot
 *
 * HackerRank puts a currency there ("Hackos: 1110"). The equivalent fact here is the one a
 * competitor actually wants at a glance and currently has to change page to see: **their team and
 * its score.** A student who is on no team gets told so in that slot, because it is the single
 * most important thing about their standing — an unassigned player contributes to no team score,
 * and that is worth interrupting them about rather than hiding a page away.
 *
 * ## Behaviour
 *
 * Closes on Escape, on outside click, and on navigating. Escape is not optional: this is a menu
 * that covers the page on a phone, and a student who opened it by accident mid-round needs it
 * gone without hunting for the exact pixel that dismisses it.
 */

export interface UserMenuProps {
  readonly displayName: string;
  /** The viewer's team and score, when they have one. */
  readonly teamName?: string | null;
  readonly teamScore?: string | null;
  readonly onSignOut: () => void;
}

const ITEMS = [
  { href: "/contest", label: "Problems" },
  { href: "/team", label: "My team" },
  { href: "/submissions", label: "My submissions" },
  { href: "/projector", label: "Live standings" },
] as const;

export function UserMenu({ displayName, teamName = null, teamScore = null, onSignOut }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    const onClick = (event: MouseEvent): void => {
      if (root.current !== null && !root.current.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    /*
      `min-w-0` is load-bearing, not tidiness. A flex item's default `min-width: auto` refuses to
      shrink below its content, so without it a long display name pushed the whole header past the
      viewport — measured 436px inside a 360px phone, which is a sideways scroll on every
      competitor page. The chrome carries a comment about this exact failure; replacing the block
      it described reintroduced it.
    */
    <div ref={root} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex min-w-0 items-center gap-2 rounded px-2 py-1 text-paper/85 hover:text-paper"
        style={{ fontSize: "var(--text-xs)" }}
      >
        <span // A tighter cap on a phone. 10rem of display name plus a chevron is 190px, which is
          // half a 360px viewport spent on something the student already knows.
          className="min-w-0 max-w-[7rem] truncate sm:max-w-[10rem]">{displayName}</span>
        <span aria-hidden="true" className={open ? "rotate-180" : ""}>
          &#9662;
        </span>
      </button>

      {open && (
        <div
          /*
            `text-ink` is not optional here. This panel is a paper surface rendered INSIDE the
            header, which sets `text-paper` for the dark bar — so every item that did not set its
            own colour inherited near-white and was invisible on white. Only "Sign out" showed,
            because it happens to specify `text-panther`.

            Stating the colour at the surface, rather than on each item, is what stops the next
            item added here from disappearing.
          */
          className="absolute right-0 z-50 mt-1 w-60 overflow-hidden rounded border border-ink/20 bg-paper text-ink shadow-lg"
        >
          {/*
            The highlighted slot. Panther red with paper text rather than red text on paper: at
            this size red-on-paper is below the contrast floor (DESIGN.md §2 pins --panther out
            of small body text), and inverting it puts the emphasis where HackerRank puts it
            without breaking the rule.
          */}
          <div className="bg-panther px-3 py-2.5 text-paper">
            {teamName === null ? (
              <span style={{ fontSize: "var(--text-sm)" }}>Not on a team yet</span>
            ) : (
              <>
                <span className="block truncate font-semibold" style={{ fontSize: "var(--text-sm)" }}>
                  {teamName}
                </span>
                {teamScore !== null && (
                  <span className="numeric block text-paper/85" style={{ fontSize: "var(--text-xs)" }}>
                    {teamScore}
                  </span>
                )}
              </>
            )}
          </div>

          {/*
            The `menu` role lives on the LIST, not on the panel, and the `li`s are `role="none"`.

            axe called this as two criticals when the panel carried the role: `menu` must contain
            `menuitem` CHILDREN (`aria-required-children`), and `ul`/`li` between them break that
            relationship (`aria-required-parent`). The team slot above is not a menu item either —
            it is a header — so having it inside the menu was part of the same mistake.

            Caught by the audit added alongside this component, which is the argument for auditing
            an open dropdown rather than only the page behind it.
          */}
          <ul role="menu" aria-label="Account">
            {ITEMS.map((item) => (
              <li key={item.href} role="none" className="border-t border-ink/10">
                <Link
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 hover:bg-ink/5"
                  style={{ fontSize: "var(--text-sm)" }}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li role="none" className="border-t border-ink/10">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
                className="block w-full px-3 py-2 text-left text-panther hover:bg-ink/5"
                style={{ fontSize: "var(--text-sm)" }}
              >
                Sign out
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
