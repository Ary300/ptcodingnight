import type { Metadata } from "next";

import { MyTeamView } from "@/components/contest/team/MyTeamView";

// A pipe, not an em dash: a browser tab is read by a person, so the no-em-dash rule reaches it.
// Without this export /team was the one competitor page whose tab read the generic app name,
// while its siblings say "Problems | Coding Night" and "My submissions | Coding Night".
export const metadata: Metadata = {
  title: "My team | Coding Night",
};

/**
 * `/team` — the competitor's own team, with the arithmetic shown.
 *
 * Thin, like every page in this route group: the data depends on the caller's session, so it is
 * fetched client-side rather than threaded through a server component that would have to re-read
 * the cookie itself.
 */
export default function MyTeamPage() {
  return <MyTeamView />;
}
