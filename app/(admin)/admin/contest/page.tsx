import { redirect } from "next/navigation";

/**
 * `/admin/contest` was the contest builder. Creating now lives at `/admin/contests/new`, beside
 * the list it adds to.
 *
 * Kept as a redirect rather than deleted: this URL is in the old nav, in `docs/`, and in whatever
 * an organizer bookmarked. A dead link is a worse answer than a moved one.
 */
export default function LegacyContestBuilderPage() {
  redirect("/admin/contests/new");
}
