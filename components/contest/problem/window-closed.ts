"use client";

import { useEffect, useState } from "react";

/**
 * Whether the contest window has closed, for the problem page's two buttons.
 *
 * After 8:15 "Submit for judging" stayed enabled, a press went to the server, and the Results
 * header read "Did not finish", which sounds like the student's code failed. The page now knows
 * the window: it is closed at load when the server's own phase says "after", and it closes on the
 * clock at `endsAt` for a student who has the page open across the end. The clock is the SERVER's,
 * measured once at mount, so a lab laptop with a wrong clock does not close early or late.
 */

export interface ProblemWindow {
  /** ISO instant the contest window ends. */
  readonly endsAt: string;
  /** The server's clock when the page rendered. */
  readonly serverTime: string;
  /** The server said the window was already over when the page rendered. */
  readonly closedAtLoad: boolean;
}

/** The sentence a disabled Run examples or Submit carries as its description. */
export const SUBMISSIONS_CLOSED_REASON =
  "Submissions are closed because the contest window has ended. Your earlier submissions still count.";

/** Longest delay `setTimeout` honours. The practice arena's window ends in 2100. */
const MAX_TIMER_MS = 2_147_483_647;

/** Pure: milliseconds until the window closes, in server time, from a local instant. */
export function msUntilClose(window: ProblemWindow, mountedAt: number, now: number): number {
  const offset = Date.parse(window.serverTime) - mountedAt;
  return Date.parse(window.endsAt) - (now + offset);
}

export function useWindowClosed(window: ProblemWindow | null): boolean {
  const [closedByClock, setClosedByClock] = useState(false);
  const endsAt = window?.endsAt ?? null;
  const serverTime = window?.serverTime ?? null;
  const closedAtLoad = window?.closedAtLoad ?? false;

  useEffect(() => {
    if (endsAt === null || serverTime === null || closedAtLoad) return undefined;
    const mountedAt = Date.now();
    const remaining = msUntilClose({ endsAt, serverTime, closedAtLoad }, mountedAt, mountedAt);
    if (remaining > MAX_TIMER_MS) return undefined;
    const timer = setTimeout(() => setClosedByClock(true), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [endsAt, serverTime, closedAtLoad]);

  return closedAtLoad || closedByClock;
}
