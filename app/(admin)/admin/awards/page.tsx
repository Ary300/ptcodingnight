import { AwardsLoader } from "@/components/admin/AwardsLoader";

/**
 * `/admin/awards?contest=<id>` — final results.
 *
 * **Teams are what Coding Night ranks** (PRD §6.1), so the team board is the one shown, with the
 * per-division individual board underneath for the ICPC preset. This screen previously rendered
 * only the individual board from stub data, which meant the awards for a team contest were the
 * wrong awards.
 *
 * Contest pinned by query string, like every other admin screen: there is no implicit "current
 * contest", because that is hidden state that breaks the moment somebody opens last year's board.
 */
export default async function AwardsPage({
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
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>Awards</h1>
        <p className="mt-1 max-w-[70ch] opacity-75" style={{ fontSize: "var(--text-sm)" }}>
          A team score is a mean, so every row shows the numbers it was computed from. Ties are
          shown as ties and never broken arbitrarily.
        </p>
      </header>

      {contestId === null ? (
        <p role="status" className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          Add <code>?contest=&lt;id&gt;</code> to this URL to see a contest&rsquo;s results.
        </p>
      ) : (
        <AwardsLoader contestId={contestId} />
      )}
    </div>
  );
}
