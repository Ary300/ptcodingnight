"use client";

import { useEffect, useState } from "react";

import { TeamStandingsResponseSchema, type TeamStandingsResponse } from "@/lib/schemas/api";

import { POLL_INTERVAL_MS } from "./constants";

/**
 * Polls the team board.
 *
 * A sibling of `useStandings`, deliberately not a generalisation of it. The individual board carries
 * division tabs, rank deltas and the reveal sequence; the team board carries an expandable breakdown
 * and none of that. Merging them behind a type parameter would make both harder to read for the sake
 * of sharing a `fetch` and a `setInterval`.
 *
 * Validated with Zod rather than trusted, because this is a trust boundary like any other: the
 * projector is a read-only consumer of a route it does not own.
 */

export type TeamStandingsSource = "pending" | "api" | "error";

export interface UseTeamStandingsResult {
  standings: TeamStandingsResponse | null;
  source: TeamStandingsSource;
  /** Present when the last poll failed. The board keeps showing the previous rows regardless. */
  error: string | null;
}

/** Accepts the API envelope or a bare body, same as the individual board's reader. */
function parse(body: unknown): TeamStandingsResponse | null {
  const direct = TeamStandingsResponseSchema.safeParse(body);
  if (direct.success) return direct.data;

  if (typeof body === "object" && body !== null && "data" in body) {
    const enveloped = TeamStandingsResponseSchema.safeParse((body as { data: unknown }).data);
    if (enveloped.success) return enveloped.data;
  }

  return null;
}

export function useTeamStandings(contestId: string | null): UseTeamStandingsResult {
  const [standings, setStandings] = useState<TeamStandingsResponse | null>(null);
  const [source, setSource] = useState<TeamStandingsSource>("pending");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (contestId === null) return;

    let cancelled = false;

    const poll = async (): Promise<void> => {
      try {
        const response = await fetch(`/api/contests/${contestId}/team-standings`, {
          cache: "no-store",
        });
        const parsed = parse(await response.json());

        if (cancelled) return;

        if (parsed === null) {
          setSource("error");
          setError("The scoreboard sent something this page could not read.");
          return;
        }

        setStandings(parsed);
        setSource("api");
        setError(null);
      } catch {
        if (cancelled) return;
        // The PREVIOUS rows stay on screen. A projector that blanks on one dropped request is
        // worse than one showing rows a few seconds stale, and the room cannot tell the
        // difference until it recovers.
        setSource("error");
        setError("Lost contact with the scoreboard. Retrying.");
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [contestId]);

  return { standings, source, error };
}
