import { SideActivityEntry } from "@/components/admin/SideActivityEntry";

/**
 * Side-activity points, as a tab of the contest they belong to.
 *
 * Kept as a tab of its own rather than folded into a settings screen: these are the only points on
 * the night with no submission behind them, so this tab is the only record that they happened. A
 * team score is short by exactly these points, with nothing anywhere to say why, if nobody finds
 * this screen — which is what happened when it had no nav entry at all.
 */
export default async function ContestSideActivitiesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-lg)" }}>
          Side activities
        </h2>
        <p className="mt-1 max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          The metal puzzle, train tracks, Connections. These are the only points with no submission
          behind them, so this screen is the only record that they happened — every entry is kept,
          with who entered it.
        </p>
      </header>

      <SideActivityEntry contestId={id} />
    </div>
  );
}
