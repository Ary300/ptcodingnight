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
    /*
      Outlined rather than filled. This pill used to be `bg-ink` on a white header; the header is
      now `bg-ink` itself (HackerRank's dark chrome), and an ink pill on an ink bar is an
      invisible pill. A hairline and a barely-lifted surface keep it readable as a distinct
      object without introducing a third colour into the bar.
    */
    <div className="inline-flex shrink-0 items-center gap-2.5 rounded-chip border border-rule-edge-inverse bg-paper/10 px-2.5 py-1">
      {/* "Time remaining" flips to "Finished" exactly once, at zero. Keyed so the new word
          rises in; it is a flex item, so the transform applies. */}
      <span
        key={over ? "finished" : "running"}
        className="motion-swap-in whitespace-nowrap text-paper/75 uppercase"
        style={{ fontSize: "var(--text-xs)", letterSpacing: "0.08em" }}
      >
        {over ? "Finished" : label}
      </span>
      {/*
        The paper-to-gold flip at 5:00 is the tensest state change in the room, and it used to
        happen between two frames. The colour now crosses over --motion-swap, which reads as
        the clock changing state rather than glitching. Nothing animates per second: the
        colour value is constant between the two threshold flips, so the transition only ever
        runs at 5:00 and at zero. Gold is 13.44:1 on this dark chip, full-strength text, so a
        colour transition here never passes through a failing ratio.
      */}
      <span
        aria-hidden="true"
        className="numeric font-semibold whitespace-nowrap transition-colors duration-[var(--motion-swap)]"
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
