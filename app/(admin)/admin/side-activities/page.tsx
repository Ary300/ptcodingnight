import { SideActivityEntry } from "@/components/admin/SideActivityEntry";

/**
 * `/admin/side-activities` — award points for the non-coding activities.
 *
 * `?contest=<id>` picks the contest. Required rather than guessed: awarding points to the wrong
 * contest's team is silent and hard to notice, and a wrong guess here changes a result.
 */
export default async function SideActivitiesPage({
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
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>
          Side activities
        </h1>
        <p className="mt-1 max-w-[70ch] text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
          The metal puzzle, train tracks, Connections. These are the only points with no submission
          behind them, so this screen is the only record that they happened — every entry is kept,
          with who entered it.
        </p>
      </header>

      {contestId === null ? (
        <p role="status" className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
          Add <code>?contest=&lt;id&gt;</code> to this URL to choose the contest.
        </p>
      ) : (
        <SideActivityEntry contestId={contestId} />
      )}
    </div>
  );
}
