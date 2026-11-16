"use client";

import { useEffect, useState } from "react";

import { COUNTDOWN_URGENT_MS } from "./constants";
import { serverNow } from "./server-clock";
import styles from "./leaderboard.module.css";

const PLACEHOLDER = "--:--:--";

function format(remainingMs: number): string {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export interface CountdownProps {
  /** ISO instant the contest ends, from `StandingsResponse.endsAt`. */
  endsAt: string;
  /**
   * ISO instant the contest opens. Before it the wall reads "Starts in" and counts to the start;
   * it used to count to the END and call that time remaining, so a projector switched on at 6:30
   * showed 1:45:00 remaining for a contest that had not begun.
   */
  startsAt?: string;
}

/**
 * Time remaining. Every digit is `.numeric` (JetBrains Mono, tabular) so the clock does not
 * shuffle sideways once a second on the one screen everybody is looking at.
 *
 * Renders a placeholder until the first client tick: the remaining time depends on
 * `Date.now()`, which cannot agree between server and client, and a hydration mismatch on
 * the projector is a visible flicker.
 *
 * Inside the last five minutes it turns `--gold` — 13.44:1 on `--ink`, and the same colour
 * the frozen plate uses, so gold consistently means "pay attention to this".
 */
export function Countdown({ endsAt, startsAt }: CountdownProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // The first tick rides an animation frame rather than running inline, so the clock is
    // right on the first painted frame without writing state from the effect body.
    // Counted against the server's clock (server-clock.ts), so a projector laptop that runs fast
    // does not show the room "Finished" early.
    const frame = requestAnimationFrame(() => setNow(serverNow()));
    const timer = window.setInterval(() => setNow(serverNow()), 1000);

    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, []);

  const endsAtMs = Date.parse(endsAt);
  const startsAtMs = startsAt === undefined ? Number.NaN : Date.parse(startsAt);
  const beforeStart = now !== null && !Number.isNaN(startsAtMs) && now < startsAtMs;
  const targetMs = beforeStart ? startsAtMs : endsAtMs;
  const remainingMs =
    now === null || Number.isNaN(targetMs) ? null : targetMs - now;

  const urgent = !beforeStart && remainingMs !== null && remainingMs <= COUNTDOWN_URGENT_MS;
  const ended = !beforeStart && remainingMs !== null && remainingMs <= 0;

  return (
    <div>
      <div className={styles.clockLabel}>
        {beforeStart ? "Starts in" : ended ? "Time" : "Time remaining"}
      </div>
      <div className={`numeric ${styles.clock} ${urgent ? styles.clockUrgent : ""}`}>
        {remainingMs === null ? PLACEHOLDER : format(remainingMs)}
      </div>
    </div>
  );
}
