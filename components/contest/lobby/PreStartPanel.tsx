"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Rail } from "@/components/ui";

import { ContestClock } from "./ContestClock";
import type { ContestPhase } from "./phase";

/**
 * The lobby before the gun.
 *
 * ## What this replaces
 *
 * A bare red line reading "This contest has not started yet", a "Try again" link, and nothing
 * else, on an otherwise empty page — beside a standings panel that rendered the student's own name
 * perfectly well. An empty screen is indistinguishable from a broken one, and the one affordance
 * on it invited the student to reload a page that was working exactly as designed. What they were
 * waiting for, and how long, were both absent.
 *
 * So the screen answers, in the order the question is asked: **what** is this, **when** does it
 * open, **where do I sit** (team and set), and **what happens** when the clock hits zero.
 *
 * ## Why it refreshes itself
 *
 * A contest does not open because a clock passed `startsAt`. `assertCanSubmit` needs the state to
 * be `RUNNING` *and* the instant to be inside the window, and an organizer presses the button that
 * sets the state. So zero on this clock is "about now", not "now", and a student staring at
 * `00:00:00` with a Try again link is back where we started.
 *
 * From zero onward the page re-asks the server on an interval and swaps itself for the real lobby
 * the moment the answer changes. The interval is deliberately slow: every student in the room is
 * on this screen at the same time, and the judge queue is the thing that must not be starved on
 * the night.
 */

/** How often to re-ask the server once the clock has run out. Slow on purpose — see above. */
const REOPEN_POLL_MS = 10_000;

export interface PreStartPanelProps {
  readonly phase: ContestPhase;
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section
      aria-label={label}
      className="flex items-stretch overflow-hidden rounded border border-ink/15 bg-paper"
    >
      <Rail state="brand" />
      <div className="min-w-0 flex-1 px-4 py-3">{children}</div>
    </section>
  );
}

/** One fact about where this student sits: a quiet label over a real value. */
function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <dt
        className="text-ink/60 uppercase"
        style={{ fontSize: "var(--text-xs)", letterSpacing: "0.08em" }}
      >
        {label}
      </dt>
      <dd className="font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
        {value}
      </dd>
      {note !== undefined && (
        <dd className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          {note}
        </dd>
      )}
    </div>
  );
}

export function PreStartPanel({ phase }: PreStartPanelProps) {
  const router = useRouter();
  const [waitingToOpen, setWaitingToOpen] = useState(false);

  const onElapsed = useCallback(() => {
    setWaitingToOpen(true);
  }, []);

  useEffect(() => {
    if (!waitingToOpen) return undefined;
    const id = setInterval(() => {
      // A server round trip, not a full reload: the loader re-runs, the phase comes back live, and
      // this component is replaced by the real lobby without the student losing their scroll.
      router.refresh();
    }, REOPEN_POLL_MS);
    return () => {
      clearInterval(id);
    };
  }, [waitingToOpen, router]);

  const startsAt = new Date(phase.startsAt);
  // The wall-clock time, in the reader's own zone, next to the countdown. A student comparing the
  // screen with the clock on the wall needs the time of day; a student deciding whether to fetch a
  // drink needs the countdown. They are different questions.
  const startLabel = Number.isNaN(startsAt.getTime())
    ? null
    : startsAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <div className="grid gap-4">
      <Panel label="When this contest starts and where you are sitting">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <ContestClock
            target={phase.startsAt}
            serverTime={phase.serverTime}
            label="Starts in"
            elapsedLabel="Starting now"
            onElapsed={onElapsed}
          />
          {startLabel !== null && (
            <p className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
              Scheduled for <span className="numeric text-ink">{startLabel}</span>
            </p>
          )}
        </div>

        {waitingToOpen ? (
          // `status`, not `alert`. Waiting for an organizer to press a button is the ordinary
          // course of the evening, not a fault, and an alert on arrival interrupts a screen reader
          // to say so.
          <p role="status" className="mt-3" style={{ fontSize: "var(--text-sm)" }}>
            The start time has passed. An organizer opens the contest from their console, so there
            is a moment between the two. This page is checking every few seconds and will open
            itself: you do not need to reload.
          </p>
        ) : (
          <p className="mt-3" style={{ fontSize: "var(--text-sm)" }}>
            Nothing to do until then. This page opens itself when the contest starts, so you can
            leave it up.
          </p>
        )}

        {/*
          The facts sit under the clock in the SAME panel, divided by a hairline rather than by a
          gap and a second border.

          Three stacked panels put three identical red rails down the page and pushed the problem
          list below the fold on a 360px phone. The clock and "which team am I on" answer the same
          question — what is my situation right now — so they are one object with a rule through it.
        */}
        <dl className="mt-3 flex flex-wrap gap-x-10 gap-y-3 border-t border-ink/15 pt-3">
          <Fact
            label="Team"
            value={phase.teamName ?? "Not on a team yet"}
            note={
              phase.teamName === null
                ? "An organizer adds you. There is nothing for you to do."
                : phase.teamSize === null
                  ? undefined
                  : phase.teamSize === 1
                    ? "1 person so far"
                    : `${String(phase.teamSize)} people`
            }
          />
          <Fact
            label="Problem set"
            value={phase.setLabel ?? "Not assigned yet"}
            note={
              phase.setLabel === null
                ? "Assigned with your team, by an organizer."
                : "Assigned, never chosen. Fixed for the round."
            }
          />
          {/*
            No "problems tonight" count here. The list below carries it, with the explanation of
            why the titles are missing attached to it — and a count in two places is a count that
            can disagree with itself.
          */}
        </dl>
      </Panel>

      <Panel label="What happens at the start">
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
          What happens when the clock hits zero
        </h2>
        <ul
          className="mt-2 grid gap-1.5 text-ink/75"
          style={{ fontSize: "var(--text-sm)" }}
        >
          <li>
            Every problem below unlocks at once. The titles and the full statements appear, and the
            rows become links.
          </li>
          <li>
            {/*
              No number here on purpose. The rate is a property of the contest's scoring preset
              (5 minutes classic, 20 ICPC — lib/types/scoring.ts), and this panel is not told which
              preset it is looking at. A hardcoded "5" would be wrong on an ICPC night and nothing
              would catch it.
            */}
            Submissions open. Each one is judged in a sandbox and scored. A rejected submission on a
            problem you go on to score adds penalty minutes, which separate people on the same
            score.
          </li>
          <li>
            Running the samples becomes free and unlimited. A sample run is never judged, never
            scored, and never appears in your submission history.
          </li>
          <li>
            Group problems are open to everybody. The rest come from your set, which is the one
            named above.
          </li>
        </ul>

        {/*
          THE ANSWER TO "CAN I RUN SAMPLES BEFORE THE START", WHICH IS NO.

          Four reasons, and the first is the one that decides it:

          1. There is nothing to run against. Running samples needs the sample input and the
             statement that explains it, and the statement is exactly what must not be readable
             before the gun. A student typing code against input they cannot see is not practising;
             they are guessing.
          2. It is the same judge. `runSamples` and `createSubmission` share `resolveTarget`, the
             same queue, the same container budget and the same host. Sixty students idling in a
             lobby with a free Run button would drain the judge in the minutes when it most needs to
             be empty, and G8 already shows the queue is the scarcest thing on this machine.
          3. It is a head start. Sample data plus a fast iteration loop is most of a problem. Sets
             are assigned rather than chosen precisely so that nobody can practise on theirs early
             (PRD §6.2), and a pre-start Run button would hand that back.
          4. It is not free to the student either: a sample run holds an HTTP request open for up
             to 150 seconds, so "just try it" before the start is a way to be mid-request when the
             contest opens.

          The API already agrees — `resolveTarget` calls `assertCanSubmit` on the run-samples path
          too — so this note is the screen telling the truth about the server rather than the screen
          inventing a rule. Nothing here required a gate change.
        */}
        <p className="mt-3 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          You cannot run code yet, on purpose. Running samples needs the statement and the sample
          input, and those open with everything else, at the start.
        </p>
      </Panel>
    </div>
  );
}
