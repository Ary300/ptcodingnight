"use client";

import { useEffect, useState } from "react";

import { API_ROUTES, TeamStandingsResponseSchema, type TeamStandingsResponse } from "@/lib/schemas/api";

import { POLL_INTERVAL_MS } from "./constants";
import { noteServerDate } from "./server-clock";

const POLL_REQUEST_TIMEOUT_MS = 10_000;

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

/**
 * `idle`: the un-scoped route answered that no contest is running (`data: null`). A state of
 * the wall, not a failure, so it carries no error text.
 */
export type TeamStandingsSource = "pending" | "api" | "idle" | "error";

export interface UseTeamStandingsResult {
  standings: TeamStandingsResponse | null;
  source: TeamStandingsSource;
  /** Present when the last poll failed. The board keeps showing the previous rows regardless. */
  error: string | null;
}

/**
 * Where to read the board from.
 *
 * **A null id is a request, not a missing argument.** It means "whichever contest is running",
 * which is the only thing a screen on a wall can mean — nobody types an id into it. This hook
 * used to return early on null and never fetch at all, so a bare `/projector` sat on an empty
 * board telling the room to go and edit the URL.
 *
 * The literals are here rather than in `API_ROUTES` only because the un-scoped twin is newer than
 * that table; both belong there, and `tests/e2e/wiring.api.spec.ts` is the check that keeps the
 * two halves on the same URL.
 */
function urlFor(contestId: string | null, publicView: boolean): string {
  if (publicView) return API_ROUTES.projectorTeamStandings(contestId ?? undefined);
  return contestId === null
    ? "/api/team-standings"
    : `/api/contests/${encodeURIComponent(contestId)}/team-standings`;
}

export interface UseTeamStandingsOptions {
  /**
   * Ask for the PUBLIC board whoever is signed in, and send no cookie. The projector sets this,
   * because it runs on an organizer's laptop and the organizer's session would otherwise show the
   * room the live scores through a freeze. Awards and the console leave it off and see through it.
   */
  readonly publicView?: boolean;
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

/** `{ success: true, data: null }`: the un-scoped route's "no contest is running". */
function isNothingRunning(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    "success" in body &&
    (body as { success: unknown }).success === true &&
    "data" in body &&
    (body as { data: unknown }).data === null
  );
}

/**
 * The API's own sentence for a failed envelope.
 *
 * "No contest is running" and "Contest not found" are the two an organizer will actually hit, and
 * both are actionable. Collapsing them into "the scoreboard sent something this page could not
 * read" turns a fixable situation into a mystery on the wall.
 */
function envelopeError(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;

  const error = (body as { error: unknown }).error;
  if (typeof error !== "object" || error === null || !("message" in error)) return null;

  const message = (error as { message: unknown }).message;
  return typeof message === "string" && message.length > 0 ? message : null;
}

export function useTeamStandings(
  contestId: string | null,
  options: UseTeamStandingsOptions = {},
): UseTeamStandingsResult {
  const publicView = options.publicView === true;
  const [standings, setStandings] = useState<TeamStandingsResponse | null>(null);
  const [source, setSource] = useState<TeamStandingsSource>("pending");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let requestController: AbortController | null = null;
    const url = urlFor(contestId, publicView);

    const poll = async (): Promise<void> => {
      requestController = new AbortController();
      const currentRequest = requestController;
      const timeout = window.setTimeout(() => currentRequest.abort(), POLL_REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          signal: currentRequest.signal,
          // Revalidate every time, never reuse unasked: the browser sends the board's ETag and an
          // unchanged board comes back as a 304 with no body. See `jsonOkRevalidated`.
          cache: "no-cache",
          credentials: publicView ? "omit" : "same-origin",
          headers: { accept: "application/json" },
        });
        noteServerDate(response.headers.get("date"));
        const body: unknown = await response.json();
        const parsed = parse(body);

        if (cancelled) return;

        if (parsed === null && isNothingRunning(body)) {
          setStandings(null);
          setSource("idle");
          setError(null);
          return;
        }

        if (parsed === null) {
          setSource("error");
          setError(envelopeError(body) ?? "The scoreboard sent something this page could not read.");
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
      } finally {
        window.clearTimeout(timeout);
        if (requestController === currentRequest) requestController = null;
        // One request at a time: an older score payload must not arrive after a newer one and win.
        if (!cancelled) timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      requestController?.abort();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [contestId, publicView]);

  return { standings, source, error };
}
