"use client";

import { useEffect, useState } from "react";

/**
 * Counts an integer up from zero once `active` goes true, then holds.
 *
 * Step 3 of the Unfreeze (docs/DESIGN.md §6): a mover's delta glyph counts up from `−` to
 * its final `↑n` / `↓n`. Zero renders as `−` in `<Delta>`, so starting at zero *is* starting
 * at the dash — the glyph column never goes empty and never changes width.
 *
 * `durationMs <= 0` (reduced motion) lands on the final value immediately. The value is
 * still reached; only the travel is removed.
 *
 * Both the idle value and the reduced-motion value are derived at render rather than pushed
 * into state, so the effect never has to write state synchronously to stay correct.
 */
export function useCountUp(
  target: number,
  active: boolean,
  durationMs: number,
  delayMs: number,
): number {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    if (!active || durationMs <= 0) return undefined;

    let frame = 0;
    let startedAt = 0;

    const advance = (now: number) => {
      if (startedAt === 0) startedAt = now;
      const progress = Math.min(1, (now - startedAt) / durationMs);
      setAnimated(Math.round(target * progress));
      if (progress < 1) frame = requestAnimationFrame(advance);
    };

    const start = window.setTimeout(() => {
      setAnimated(0);
      frame = requestAnimationFrame(advance);
    }, delayMs);

    return () => {
      window.clearTimeout(start);
      cancelAnimationFrame(frame);
    };
  }, [target, active, durationMs, delayMs]);

  if (!active) return 0;
  if (durationMs <= 0) return target;
  return animated;
}
