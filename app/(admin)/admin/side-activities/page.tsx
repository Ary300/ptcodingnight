import { ContestPicker } from "@/components/admin/ContestPicker";

import { redirectIntoContestTab } from "../legacy-scope";

/**
 * `/admin/side-activities` — the old flat URL for the non-coding points.
 *
 * Now a tab of the contest (`/admin/contests/<id>/side-activities`). Awarding points to the wrong
 * contest's team is silent and hard to notice, which is exactly why the contest is named at the
 * top of the screen rather than living in a query string the organizer cannot see.
 */
export default async function SideActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectIntoContestTab(searchParams, "/side-activities");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>
          Side activities
        </h1>
        <p className="mt-1 max-w-[70ch] text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
          The metal puzzle, train tracks, Connections. These are the only points with no submission
          behind them, so this screen is the only record that they happened. Pick the contest the
          points belong to.
        </p>
      </header>

      <ContestPicker tab="/side-activities" purpose="awarding side-activity points" />
    </div>
  );
}
