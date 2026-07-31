"use client";

import { useTeamStandings } from "@/components/leaderboard";
import { TeamAwardsBoard } from "@/components/admin/TeamAwardsBoard";

/**
 * Fetches the final team standings for the awards screen.
 *
 * Reuses `useTeamStandings` rather than fetching again: it already handles the envelope, the
 * polling, and the "keep the previous rows on a dropped request" behaviour. A second reader would
 * be a second thing to keep in step with the scoring engine's contract.
 */
export interface AwardsLoaderProps {
  contestId: string;
}

export function AwardsLoader({ contestId }: AwardsLoaderProps) {
  const { standings, error } = useTeamStandings(contestId);

  if (standings === null) {
    return (
      <p role="status" className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
        {error ?? "Loading final standings…"}
      </p>
    );
  }

  return <TeamAwardsBoard standings={standings} contestName={contestId} />;
}
