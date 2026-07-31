import { AwardsLoader } from "@/components/admin/AwardsLoader";
import { ContestPicker } from "@/components/admin/ContestPicker";
import { contestNameFor } from "@/lib/contest/contests";

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
 * With no contest in the URL it renders the picker rather than asking for an id by hand.
 *
 * The contest's NAME is read here and handed down, because it is what the CSV and XLSX exports are
 * named after. It used to be passed the contest id, so the file an organizer handed out at the end
 * of the night was called after a cuid.
 */
export default async function AwardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const contest = params.contest;
  const contestId = typeof contest === "string" && contest.length > 0 ? contest : null;
  const contestName = contestId === null ? null : await contestNameFor(contestId);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
          Awards{contestName === null ? "" : ` — ${contestName}`}
        </h1>
        <p className="mt-1 max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          A team score is a mean, so every row shows the numbers it was computed from. Ties are
          shown as ties and never broken arbitrarily.
        </p>
      </header>

      {contestId === null ? (
        <ContestPicker basePath="/admin/awards" purpose="the awards board" />
      ) : contestName === null ? (
        <p role="status" className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          There is no contest with that id.
        </p>
      ) : (
        <AwardsLoader contestId={contestId} contestName={contestName} />
      )}
    </div>
  );
}
