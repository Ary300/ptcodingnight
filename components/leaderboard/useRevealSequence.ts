"use client";

import { useEffect, useRef, useState } from "react";

import type { RevealTimings } from "./constants";

/**
 * The Unfreeze, as a state machine. docs/DESIGN.md §6.
 *
 *   live        board updating normally
 *   frozen      greyscale except the rails, gold plate up, crest on the outline variant
 *   lifting     (1) the plate lifts away — rows are still at their frozen positions
 *   travelling  (2) rows spring to final position, 40 ms stagger down the board
 *   deltas      (3) movers flash their rail and count their delta up from `−`
 *   champion    (4) the champion's row grows and the crest ignites
 *   settled     the end of the night
 *
 * The phases are ordered and none is skipped, including under reduced motion — see
 * `REDUCED_MOTION_REVEAL`, which zeroes the durations rather than the steps.
 */
export type RevealPhase =
  | "live"
  | "frozen"
  | "lifting"
  | "travelling"
  | "deltas"
  | "champion"
  | "settled";

/** True while the board is holding its breath: greyscale on, plate up, deltas withheld. */
export function isFrozenLook(phase: RevealPhase): boolean {
  return phase === "frozen" || phase === "lifting";
}

/** True while the reveal is running, i.e. the final deltas have not been earned yet. */
export function isRevealing(phase: RevealPhase): boolean {
  return phase === "lifting" || phase === "travelling" || phase === "deltas";
}

/** True once the champion may be crowned and the crest may ignite. */
export function isCrowned(phase: RevealPhase): boolean {
  return phase === "champion" || phase === "settled";
}

/** The steps a timer can hand back. `frozen` and `live` are derived, never scheduled. */
type ScheduledStep = Exclude<RevealPhase, "live" | "frozen">;

/**
 * Drives the sequence off a single input: the API's `frozen` flag going true → false.
 *
 * `rowCount` feeds the stagger, so the board waits for the *last* row to land before the
 * deltas start rather than for a fixed guess.
 *
 * The frozen and live phases are derived at render from `frozen` itself; only the reveal
 * steps are stored, and they are only ever written from a timer callback. That keeps the
 * hook free of synchronous state writes inside an effect, which the React Compiler rejects.
 */
export function useRevealSequence(
  frozen: boolean,
  rowCount: number,
  timings: RevealTimings,
): RevealPhase {
  const [step, setStep] = useState<ScheduledStep | null>(null);
  const wasFrozen = useRef(frozen);

  useEffect(() => {
    if (frozen) {
      wasFrozen.current = true;
      // Discard any completed reveal so a second freeze cannot leak its ending into the
      // first frame of the next unfreeze.
      const reset = window.setTimeout(() => setStep(null), 0);
      return () => window.clearTimeout(reset);
    }

    if (!wasFrozen.current) return undefined;

    // Frozen → not frozen. This is the moment the whole evening has been building to.
    wasFrozen.current = false;

    const cascadeMs = timings.rowTravelMs + timings.rowStaggerMs * Math.max(0, rowCount - 1);
    const deltasMs = timings.deltaCountMs + timings.rowStaggerMs * Math.max(0, rowCount - 1);

    const schedule: ReadonlyArray<{ ms: number; step: ScheduledStep }> = [
      { ms: 0, step: "lifting" },
      { ms: timings.plateLiftMs, step: "travelling" },
      { ms: timings.plateLiftMs + cascadeMs, step: "deltas" },
      {
        ms: timings.plateLiftMs + cascadeMs + deltasMs + timings.championDelayMs,
        step: "champion",
      },
      {
        ms:
          timings.plateLiftMs +
          cascadeMs +
          deltasMs +
          timings.championDelayMs +
          timings.rowTravelMs,
        step: "settled",
      },
    ];

    const timers = schedule.map(({ ms, step: next }) =>
      window.setTimeout(() => setStep(next), ms),
    );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [frozen, rowCount, timings]);

  if (frozen) return "frozen";
  return step ?? "live";
}
