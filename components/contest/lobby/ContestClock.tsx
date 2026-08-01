"use client";

import { useEffect, useState } from "react";

import { humanDuration } from "./phase";

/**
 * A countdown to a fixed instant, on the lobby's paper surface.
 *
 * ## Why this is not `components/contest/Countdown.tsx`
 *
 * That one is the header chip and is built for the dark bar: `text-paper/75` on a translucent
 * `bg-paper/10`, switching to `--gold` when time is short. Both of those are invisible on paper,
 * and `--gold` measures 1.39:1 there (docs/DESIGN.md §2), so it cannot simply be dropped onto this
 * page. It also counts to the END of the contest and only ever to the end, which is the wrong
 * instant for a student who is waiting for the start.
 *
 * ## The clock this counts in is the SERVER'S
 *
 * `serverTime` is the instant the page was rendered, as the server saw it. A school laptop whose
 * clock is twenty minutes out would otherwise show a countdown that is twenty minutes wrong and
 * looks completely authoritative doing it. The offset is measured once on mount and applied to
 * every tick after, so the digits agree with the room even when the machine does not.
 *
 * ## Two channels, never one
 *
 * The last minute turns `--panther` AND changes the word above the digits. `--panther` is 5.08:1
 * on paper, which passes AA as a solid colour and fails at any alpha, so it is used solid or not
 * at all. Remove the colour entirely and the state still reads, which is the test in DESIGN.md §3.
 */

/** Under this, the clock says so in words as well as in colour. */
const IMMINENT_MS = 60_000;

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

export interface ContestClockProps {
  /** ISO instant being counted down to. */
  readonly target: string;
  /** ISO instant the server rendered this page. See the note above. */
  readonly serverTime: string;
  /** The word above the digits while there is still time on them. */
  readonly label: string;
  /** The word above the digits once they reach zero. */
  readonly elapsedLabel: string;
  /** Fired once, when the countdown first reaches zero. */
  readonly onElapsed?: () => void;
}

export function ContestClock({
  target,
  serverTime,
  label,
  elapsedLabel,
  onElapsed,
}: ContestClockProps) {
  /*
    Null until the first tick, and the first tick is in an effect.

    The remaining time depends on `Date.now()`, so computing it during render is a hydration
    mismatch by construction — the server and the browser cannot agree on a value that changes
    every second. `--:--:--` is what both of them render.
  */
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const targetMs = new Date(target).getTime();
    const serverMs = new Date(serverTime).getTime();
    if (Number.isNaN(targetMs) || Number.isNaN(serverMs)) return undefined;

    // Positive when this machine's clock is behind the server's. Measured once, deliberately:
    // re-measuring per tick would let a clock correction mid-contest jump the digits.
    const skewMs = serverMs - Date.now();

    let fired = false;
    const tick = () => {
      const left = Math.max(0, targetMs - (Date.now() + skewMs));
      setRemaining(left);
      if (left === 0 && !fired) {
        fired = true;
        onElapsed?.();
      }
    };

    tick();
    const id = setInterval(tick, 1_000);
    return () => {
      clearInterval(id);
    };
  }, [target, serverTime, onElapsed]);

  const elapsed = remaining !== null && remaining <= 0;
  const imminent = remaining !== null && remaining > 0 && remaining <= IMMINENT_MS;

  return (
    <div>
      <p
        className="uppercase"
        style={{
          fontSize: "var(--text-xs)",
          letterSpacing: "0.08em",
          // Solid --panther or the /60 muted floor. Never an alpha on --panther: it measures
          // 5.08:1 solid and anything less than solid drops under AA.
          color: imminent || elapsed ? "var(--color-panther)" : undefined,
        }}
      >
        <span className={imminent || elapsed ? "font-semibold" : "text-ink/60"}>
          {elapsed ? elapsedLabel : label}
        </span>
      </p>

      {/*
        The digits are decoration for a screen reader: they change every second, and a live region
        that announces "one hour fifty-nine minutes fifty-eight seconds" once per second is not
        usable by anybody. The polite announcement below carries whole minutes instead.
      */}
      <p
        aria-hidden="true"
        className="numeric font-semibold"
        style={{
          fontSize: "var(--text-xl)",
          lineHeight: 1.05,
          color: imminent ? "var(--color-panther)" : undefined,
        }}
      >
        {remaining === null ? "--:--:--" : format(remaining)}
      </p>

      <p className="sr-only" aria-live="polite">
        {remaining === null
          ? ""
          : elapsed
            ? elapsedLabel
            : `${label}: ${humanDuration(remaining)}.`}
      </p>
    </div>
  );
}
