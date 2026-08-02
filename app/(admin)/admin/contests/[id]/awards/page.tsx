import { AwardsLoader } from "@/components/admin/AwardsLoader";

import { contestSetup } from "../contest-setup";

/**
 * Final results.
 *
 * **Teams are what Coding Night ranks** (PRD §6.1), so the team board is the one shown, with the
 * per-division individual board underneath for the ICPC preset.
 *
 * The contest's NAME is read here and handed down, because it is what the CSV and XLSX exports are
 * named after — an export called after a cuid is an export nobody can file.
 */
export default async function ContestAwardsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const setup = await contestSetup(id);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-lg)" }}>
          Awards
        </h2>
        <p className="mt-1 max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          {/* A team score is a mean, so a bare total is uncheckable; the row carries its own
              working. Ties are never broken arbitrarily. */}
          Every row shows the numbers its team score was computed from. Ties are shown as ties.
        </p>
      </header>

      {setup === null ? (
        <p role="status" className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          There is no contest with that id, so there is no board to show.
        </p>
      ) : (
        <AwardsLoader contestId={id} contestName={setup.name} />
      )}
    </div>
  );
}
