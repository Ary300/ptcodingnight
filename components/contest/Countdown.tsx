"use client";

import { useEffect, useState } from "react";

import { serverNow } from "@/components/leaderboard/server-clock";

import { humanDuration } from "./lobby/phase";

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

/*
  Whole minutes in words, through the one helper that already pluralises (`humanDuration`). These
  read "1 hours 9 minutes remaining" and "2 hours 1 minutes" with their own arithmetic.
*/
export function announceStart(ms: number): string {
  if (Math.ceil(ms / 60_000) <= 1) return "The contest starts in under a minute.";
  return `The contest starts in ${humanDuration(ms)}.`;
}

export function announce(ms: number): string {
  if (ms <= 0) return "Contest over.";
  return `${humanDuration(ms)} remaining.`;
}

export interface CountdownProps {
  /** ISO instant the contest ends — from `StandingsResponse.endsAt`. */
  endsAt: string;
  /**
   * ISO instant the contest opens. Before it, the pill says "Starts in" and counts to the start.
   *
   * Without it the pill counted to the END from the lobby, so a student waiting for 7:00 saw
   * "Time remaining 26:26:02" beside the lobby's own "Starts in 25:11:02": two clocks on one
   * screen, disagreeing (2026-11-15 organizer sweep).
   */
  startsAt?: string;
  label?: string;
}

export function Countdown({ endsAt, startsAt, label = "Time remaining" }: CountdownProps) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [beforeStart, setBeforeStart] = useState(false);

  useEffect(() => {
    const end = new Date(endsAt).getTime();
    if (Number.isNaN(end)) return;
    const start = startsAt === undefined ? Number.NaN : new Date(startsAt).getTime();

    const tick = () => {
      // The server's clock, not the laptop's: the server decides when submissions close.
      const now = serverNow();
      const waiting = !Number.isNaN(start) && now < start;
      setBeforeStart(waiting);
      setRemaining(Math.max(0, (waiting ? start : end) - now));
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [endsAt, startsAt]);

  const over = !beforeStart && remaining !== null && remaining <= 0;
  const urgent = !beforeStart && remaining !== null && remaining > 0 && remaining <= URGENT_MS;

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
        key={over ? "finished" : beforeStart ? "waiting" : "running"}
        className="motion-swap-in whitespace-nowrap text-paper/75 uppercase"
        style={{ fontSize: "var(--text-xs)", letterSpacing: "0.08em" }}
      >
        {over ? "Finished" : beforeStart ? "Starts in" : label}
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
        {remaining === null ? "" : beforeStart ? announceStart(remaining) : announce(remaining)}
      </span>
    </div>
  );
}
