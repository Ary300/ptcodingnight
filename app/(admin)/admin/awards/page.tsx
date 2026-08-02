import { ContestPicker } from "@/components/admin/ContestPicker";

import { redirectIntoContestTab } from "../legacy-scope";

/**
 * `/admin/awards` — the old flat URL for the final board.
 *
 * Now a tab of the contest (`/admin/contests/<id>/awards`), where the contest's NAME is already on
 * screen — which matters here more than anywhere, because that name is what the CSV and XLSX
 * exports are called after.
 */
export default async function AwardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectIntoContestTab(searchParams, "/awards");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
          Awards
        </h1>
        <p className="mt-1 max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          {/* A team score is a mean, so a bare total is uncheckable; the row carries its own
              working. Ties are never broken arbitrarily. */}
          Every row shows the numbers its team score was computed from. Ties are shown as ties.
          Pick the contest whose results you want.
        </p>
      </header>

      <ContestPicker tab="/awards" purpose="the awards board" />
    </div>
  );
}
