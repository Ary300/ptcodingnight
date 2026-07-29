"use client";

import { useCallback, useEffect, useState } from "react";

import { errorMessageOf } from "./contest-api";

/**
 * Load-once-and-render for an async read, with the three states a screen actually has to
 * draw: loading, ready, failed. Errors are surfaced, never swallowed — a competitor staring
 * at an empty problem list with no explanation is worse than an error message.
 *
 * `load` must be `useCallback`-stable. That is deliberate: it keeps the dependency array
 * honest instead of hiding a changing closure behind a ref.
 *
 * ## Why the result is tagged rather than reset
 *
 * The obvious shape — `setState(LOADING)` at the top of the effect — is a synchronous
 * setState inside an effect body, which the React Compiler rules reject and which causes a
 * cascading render. Instead the settled result carries the `load` identity and attempt it
 * belongs to, and "loading" is *derived* when that tag does not match the current inputs.
 * Same behaviour, one render, and stale data from a previous problem can never flash on
 * screen while the next one is in flight.
 */

export type Resource<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: T; error: null }
  | { status: "error"; data: null; error: string };

const LOADING = { status: "loading", data: null, error: null } as const;

interface Settled<T> {
  load: () => Promise<T>;
  attempt: number;
  state: Resource<T>;
}

export function useResource<T>(load: () => Promise<T>): Resource<T> & { reload: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    let cancelled = false;

    load().then(
      (data) => {
        if (!cancelled) {
          setSettled({ load, attempt, state: { status: "ready", data, error: null } });
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setSettled({
            load,
            attempt,
            state: { status: "error", data: null, error: errorMessageOf(error) },
          });
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [load, attempt]);

  const fresh = settled !== null && settled.load === load && settled.attempt === attempt;
  const state: Resource<T> = fresh ? settled.state : LOADING;

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { ...state, reload };
}
