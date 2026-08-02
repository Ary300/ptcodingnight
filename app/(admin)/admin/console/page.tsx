import { ContestPicker } from "@/components/admin/ContestPicker";

import { redirectIntoContestTab } from "../legacy-scope";

/**
 * `/admin/console` — the old flat URL for the live console.
 *
 * Now a tab of the contest (`/admin/contests/<id>/console`), and for a sharper reason than the
 * other tabs: freezing the wrong contest's board stops the wrong room's standings, and an override
 * lands on the wrong student's score. The contest is the page heading now, not an invisible query
 * parameter picked on some earlier screen.
 */
export default async function LiveConsolePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectIntoContestTab(searchParams, "/console");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
          Live console
        </h1>
        <p className="mt-1 max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          This view is never frozen, even while the public board is. Pick the contest you are
          running.
        </p>
      </header>

      <ContestPicker tab="/console" purpose="the live console" />
    </div>
  );
}
