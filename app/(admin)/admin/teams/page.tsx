import { RosterManager } from "@/components/admin/RosterManager";

/**
 * `/admin/teams?contest=<id>` — the roster an organizer works from on the night.
 *
 * Contest pinned by query string, exactly as `/admin/side-activities` is: there is no implicit
 * "current contest" anywhere in this application, because that is hidden state which breaks the
 * moment two contests exist or somebody opens last year's board.
 */
export default async function AdminTeamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const contest = params.contest;
  const contestId = typeof contest === "string" && contest.length > 0 ? contest : null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>Teams</h1>
        <p className="mt-1 max-w-[70ch] opacity-75" style={{ fontSize: "var(--text-sm)" }}>
          Team size is the divisor in every team score, so a roster change is a score change.
          Every action here is recorded with who did it and why.
        </p>
      </header>

      {contestId === null ? (
        <p role="status" className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          Add <code>?contest=&lt;id&gt;</code> to this URL to manage a contest&rsquo;s teams.
        </p>
      ) : (
        <RosterManager contestId={contestId} />
      )}
    </div>
  );
}
