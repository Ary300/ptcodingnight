import { ContestPicker } from "@/components/admin/ContestPicker";

import { redirectIntoContestTab } from "../legacy-scope";

/**
 * `/admin/teams` — the old flat roster URL.
 *
 * The roster is a tab of a contest now (`/admin/contests/<id>/teams`). The rule that there is no
 * implicit "current contest" has not changed; what changed is where the contest is written down.
 * As a query string it was dropped by every nav link, so each hop between two screens of the same
 * contest threw the organizer back to a thirteen-row picker. As a path segment it cannot be
 * dropped by a link that does not mention it.
 *
 * With `?contest=` this redirects into that tab; without it, it still answers "which contest?", so
 * a bookmark or a link from `docs/` is never a dead end.
 */
export default async function AdminTeamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectIntoContestTab(searchParams, "/teams");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>Teams</h1>
        <p className="mt-1 max-w-[70ch] opacity-75" style={{ fontSize: "var(--text-sm)" }}>
          Team size is the divisor in every team score, so a roster change is a score change. Pick
          the contest whose roster you are about to change.
        </p>
      </header>

      <ContestPicker tab="/teams" purpose="managing teams" />
    </div>
  );
}
