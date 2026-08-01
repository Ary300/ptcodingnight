import type { Metadata } from "next";

/**
 * The projector route has no chrome of its own and inherits none: no nav, no footer, no
 * login, no scrollbars (PRD §9.3).
 *
 * `ProjectorScreen` paints a `position: fixed; inset: 0` stage, so it covers the viewport
 * regardless of what the root layout does with the body, and the document itself never
 * grows tall enough to produce a scrollbar.
 */
export const metadata: Metadata = {
  title: "Standings | Park Tudor Coding Night",
  description: "Live contest standings.",
  // Nothing here should be indexed, and there is no internet on the night anyway.
  robots: { index: false, follow: false },
};

export default function ProjectorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
