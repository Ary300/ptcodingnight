"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

/** The server has no media queries; full motion is corrected on the client before paint. */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * Tracks `prefers-reduced-motion`.
 *
 * `app/globals.css` already collapses every transition and animation under that query. This
 * hook exists for the other half of the contract (docs/DESIGN.md §6): the Unfreeze is a
 * *sequence of timed phases*, and if the phases kept their full delays while the animations
 * were suppressed, a reduced-motion viewer would sit in front of a board that appeared to
 * stay frozen for three seconds and then jumped. Every step still runs — it just runs at
 * zero duration, so the information arrives at once and nothing is lost.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
