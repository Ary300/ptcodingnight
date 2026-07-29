"use client";

import { useEffect, useState } from "react";

import { COUNTDOWN_URGENT_MS } from "./constants";
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
export function Countdown({ endsAt }: CountdownProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // The first tick rides an animation frame rather than running inline, so the clock is
    // right on the first painted frame without writing state from the effect body.
    const frame = requestAnimationFrame(() => setNow(Date.now()));
    const timer = window.setInterval(() => setNow(Date.now()), 1000);

    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, []);

  const endsAtMs = Date.parse(endsAt);
  const remainingMs =
    now === null || Number.isNaN(endsAtMs) ? null : endsAtMs - now;

  const urgent = remainingMs !== null && remainingMs <= COUNTDOWN_URGENT_MS;
  const ended = remainingMs !== null && remainingMs <= 0;

  return (
    <div>
      <div className={styles.clockLabel}>{ended ? "Time" : "Time remaining"}</div>
      <div className={`numeric ${styles.clock} ${urgent ? styles.clockUrgent : ""}`}>
        {remainingMs === null ? PLACEHOLDER : format(remainingMs)}
      </div>
    </div>
  );
}
