"use client";

import { useEffect, useState } from "react";

import { StandingsResponseSchema, type StandingsResponse } from "@/lib/schemas/api";

import { API_ROUTES } from "@/lib/schemas/api";

import { POLL_INTERVAL_MS } from "./constants";
import { PROJECTOR_SAMPLE_STANDINGS } from "./sample-standings";

const POLL_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Where the rows currently on screen came from. Surfaced in the footer, because a board
 * showing sample data must say so.
 */
export type StandingsSource = "pending" | "api" | "sample";

export interface UseStandingsResult {
  standings: StandingsResponse;
  /**
   * The last response that arrived with `frozen: true`, kept so the Unfreeze has somewhere
   * to travel *from*. Captured from the API's own frozen payloads rather than reconstructed,
   * so the rows the room stared at for the last half hour are exactly the rows that move.
   */
  frozenSnapshot: StandingsResponse | null;
  source: StandingsSource;
}

/**
 * Reads the response body under either shape: the API envelope from `lib/schemas/api.ts`
 * (`{ success, data, error }`) or a bare `StandingsResponse`. The projector is a read-only
 * consumer of a route it does not own, so it validates rather than assumes — Zod at the
 * trust boundary, per CLAUDE.md.
 */
function parseStandings(body: unknown): StandingsResponse | null {
  const direct = StandingsResponseSchema.safeParse(body);
  if (direct.success) return direct.data;

  if (typeof body === "object" && body !== null && "data" in body) {
    const enveloped = StandingsResponseSchema.safeParse((body as { data: unknown }).data);
    if (enveloped.success) return enveloped.data;
  }

  return null;
}

/**
 * Polls the standings endpoint.
 *
 * Polling rather than SSE on purpose: PRD §10 makes polling the documented fallback, and
 * this is the one screen in the building that must never go blank because a stream dropped.
 * A failed poll keeps the last good board on screen — it never clears it.
 */
export function useStandings(contestId: string | null): UseStandingsResult {
  const [standings, setStandings] = useState<StandingsResponse>(PROJECTOR_SAMPLE_STANDINGS);
  const [frozenSnapshot, setFrozenSnapshot] = useState<StandingsResponse | null>(null);
  const [source, setSource] = useState<StandingsSource>("pending");

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let requestController: AbortController | null = null;

    // Omitting the id is meaningful, not a fallback: the projector shows whichever contest is
    // running, because nobody types an id into a screen on a wall.
    const url = API_ROUTES.publicStandings(contestId ?? undefined);

    const poll = async () => {
      requestController = new AbortController();
      const currentRequest = requestController;
      const timeout = window.setTimeout(() => currentRequest.abort(), POLL_REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          signal: currentRequest.signal,
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw new Error(`standings responded ${response.status}`);

        const parsed = parseStandings(await response.json());
        if (parsed === null) throw new Error("standings response did not match the contract");

        if (!cancelled) {
          setStandings(parsed);
          if (parsed.frozen) setFrozenSnapshot(parsed);
          setSource("api");
        }
      } catch {
        // Deliberately quiet, and deliberately non-destructive. The endpoint may not exist
        // yet; when it does, a transient failure must leave the previous board up rather
        // than blank the projector mid-contest. `source` only drops to "sample" while the
        // board has never successfully loaded.
        if (!cancelled) setSource((current) => (current === "api" ? "api" : "sample"));
      } finally {
        window.clearTimeout(timeout);
        if (requestController === currentRequest) requestController = null;
        // Schedule only after this response settles. setInterval can start a second request while
        // the first is slow; if the older response then arrives last, scores and frozen state move
        // backwards on the projector.
        if (!cancelled) timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      requestController?.abort();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [contestId]);

  return { standings, frozenSnapshot, source };
}
