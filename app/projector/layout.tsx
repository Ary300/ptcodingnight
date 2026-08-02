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
      {/*
        Top-left, visible, with an arrow: the bottom-left 13px version shipped first and the
        organizer reported "no back button" AGAIN, which settles the discoverability argument.
        A quiet bordered chip is still nothing at wall distance (compare: the LIVE pill that used
        to live here was a pulsing red dot; this is muted ink in a hairline), but at a desk it is
        unmistakably a control, in the corner every "back" control on the web lives in.
      */}
      <Link
        href="/"
        className="fixed top-3 left-3 z-10 flex items-center gap-1.5 rounded-chip border border-ink/20 bg-paper/90 px-3 py-1.5 text-ink/70 hover:border-ink/40 hover:text-ink"
        style={{ fontSize: "var(--text-sm)" }}
      >
        <span aria-hidden="true">&larr;</span> Home
      </Link>
    </>
  );
}
