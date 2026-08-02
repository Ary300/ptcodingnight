import type { Metadata } from "next";
import Link from "next/link";

/**
 * The projector route has no chrome of its own and inherits none: no nav, no footer, no
 * login, no scrollbars (PRD §9.3).
 *
 * `ProjectorScreen` paints a `position: fixed; inset: 0` stage, so it covers the viewport
 * regardless of what the root layout does with the body, and the document itself never
 * grows tall enough to produce a scrollbar.
 *
 * ## The one piece of chrome it DOES have, and why it is shaped like this
 *
 * A home link, small and muted, pinned to the bottom-left corner above the stage. "Kiosk page,
 * no anchors" was the original design and the organizer overruled it from a browser: this URL is
 * not only a wall, it is also what "Live standings" links to from every student screen, and a
 * person who follows that link is trapped with nothing but the browser's back button. The two
 * audiences are served by SIZE rather than by a mode: at wall distance a 13px ink/60 mark in a
 * corner does not read at all; at a desk it is exactly where an eye looks for a way out.
 *
 * Bottom-left, not top-left: the top row carries the title and the clock, and the bottom-left is
 * dead space on every board layout. `z-10` beats the stage's fixed layer.
 */
export const metadata: Metadata = {
  title: "Standings | Park Tudor Coding Night",
  description: "Live contest standings.",
  // Not for indexing: it is a live board for one room on one night.
  robots: { index: false, follow: false },
};

export default function ProjectorLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Link
        href="/"
        className="fixed bottom-3 left-3 z-10 rounded px-2 py-1 text-ink/60 underline-offset-2 hover:text-panther hover:underline"
        style={{ fontSize: "var(--text-xs)" }}
      >
        Coding Night home
      </Link>
    </>
  );
}
