"use client";

import { useEffect, useState } from "react";

/**
 * The contest clock.
 *
 * Three things this gets right that a naive countdown does not:
 *
 *  - **It renders as `--:--:--` on the server.** The remaining time depends on the client's
 *    clock, so computing it during render is a hydration mismatch by construction.
 *  - **It is a dark chip.** `--gold` measures 13.44 on `--ink` and 1.39 on `--paper`
 *    (docs/DESIGN.md §2), so the urgency colour is only usable on a dark surface. Rather
 *    than give up the colour, the clock brings its own background.
 *  - **It does not announce every second.** The ticking digits are `aria-hidden`; a polite
 *    live region announces whole minutes. A screen reader reading "one hour, fifty-nine
 *    minutes, fifty-eight seconds" once per second is unusable.
 */

const URGENT_MS = 5 * 60_000;

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function format(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function announce(ms: number): string {
  if (ms <= 0) return "Contest over.";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes === 1) return "1 minute remaining.";
  if (minutes < 60) return `${minutes} minutes remaining.`;
  return `${Math.floor(minutes / 60)} hours ${minutes % 60} minutes remaining.`;
}

export interface CountdownProps {
  /** ISO instant the contest ends — from `StandingsResponse.endsAt`. */
  endsAt: string;
  label?: string;
}

export function Countdown({ endsAt, label = "Time remaining" }: CountdownProps) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const target = new Date(endsAt).getTime();
    if (Number.isNaN(target)) return;

    const tick = () => setRemaining(Math.max(0, target - Date.now()));
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [endsAt]);

  const over = remaining !== null && remaining <= 0;
  const urgent = remaining !== null && remaining > 0 && remaining <= URGENT_MS;

  return (
    <div className="inline-flex items-center gap-3 rounded bg-ink px-3 py-1.5">
      <span className="text-paper/60 uppercase" style={{ fontSize: "var(--text-xs)", letterSpacing: "0.08em" }}>
        {over ? "Finished" : label}
      </span>
      <span
        aria-hidden="true"
        className="numeric font-semibold"
        style={{
          fontSize: "var(--text-md)",
          color: urgent ? "var(--color-gold)" : "var(--color-paper)",
        }}
      >
        {remaining === null ? "--:--:--" : format(remaining)}
      </span>
      <span className="sr-only" aria-live="polite">
        {remaining === null ? "" : announce(remaining)}
      </span>
    </div>
  );
}
