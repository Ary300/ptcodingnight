"use client";

import { useEffect, useState } from "react";

import { useTeamStandings, type SideActivityLine } from "@/components/leaderboard";
import { TeamAwardsBoard } from "@/components/admin/TeamAwardsBoard";
import { API_ROUTES, ContestSideActivitiesSchema } from "@/lib/schemas/api";

/**
 * Fetches the final team standings for the awards screen.
 *
 * Reuses `useTeamStandings` rather than fetching again: it already handles the envelope, the
 * polling, and the "keep the previous rows on a dropped request" behaviour. A second reader would
 * be a second thing to keep in step with the scoring engine's contract.
 *
 * It also reads every team's typed awards, so the Puzzle column can show where its points came
 * from. That read is re-run whenever any team's Puzzle total changes, so the listed awards and
 * the total beside them are the same facts; a failed read leaves the board showing totals only.
 */
export interface AwardsLoaderProps {
  readonly contestId: string;
  /** The contest's NAME, which is what the CSV and XLSX exports are named after. */
  readonly contestName: string;
}

/** How often the open awards screen re-reads the itemised awards, for edits that leave totals alone. */
const BREAKDOWN_REFRESH_MS = 15_000;

export function AwardsLoader({ contestId, contestName }: AwardsLoaderProps) {
  const { standings, error } = useTeamStandings(contestId);
  const [breakdown, setBreakdown] = useState<ReadonlyMap<string, readonly SideActivityLine[]>>();

  // A label-only edit, or two edits that net to the same total, leave every total unchanged, so the
  // breakdown is also read again every BREAKDOWN_REFRESH_MS while this screen is open.
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setRefreshTick((tick) => tick + 1), BREAKDOWN_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  // Changes exactly when a Puzzle total changes, which is when the breakdown is stale.
  const totalsKey =
    standings?.teams.map((team) => `${team.teamId}:${String(team.sideActivityPoints)}`).join() ??
    "";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(API_ROUTES.adminContestSideActivities(contestId), {
          cache: "no-store",
        });
        if (!response.ok) return;
        const body: unknown = await response.json();
        const parsed = ContestSideActivitiesSchema.safeParse(
          typeof body === "object" && body !== null && "data" in body
            ? (body as { data: unknown }).data
            : null,
        );
        if (!parsed.success || cancelled) return;
        setBreakdown(
          new Map(
            parsed.data.teams.map((team) => [
              team.teamId,
              team.activities.map(({ id, label, points }) => ({ id, label, points })),
            ]),
          ),
        );
      } catch {
        // Totals still render from the standings; only the itemised list is missing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contestId, totalsKey, refreshTick]);

  if (standings === null) {
    return (
      <p role="status" className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
        {error ?? "Loading final standings…"}
      </p>
    );
  }

  return (
    <TeamAwardsBoard
      standings={standings}
      contestName={contestName}
      sideActivityBreakdown={breakdown}
    />
  );
}
