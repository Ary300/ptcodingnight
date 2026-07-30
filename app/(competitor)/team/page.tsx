import { MyTeamView } from "@/components/contest/team/MyTeamView";

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
