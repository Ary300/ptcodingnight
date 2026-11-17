"use client";

import Link from "next/link";

import { Rail } from "@/components/ui";
import { EVENT_TIME_ZONE, formatEventTime } from "@/lib/contest/event-time";

import type { ContestPhase } from "./phase";

/**
 * The lobby after the contest is over.
 *
 * ## What this replaces
 *
 * Nothing at all. A finished contest rendered the live lobby unchanged: the same "Running samples
 * is always free, only submissions are scored" line, the same assignment notice promising "every
 * problem listed below is one you can open and submit to", and the same problem rows as ordinary
 * links. All three were false, and the only thing on the page that said the night was over was a
 * header chip reading `FINISHED 00:00:00` — which is also what it reads five seconds before the
 * end.
 *
 * A student clicking through would find out by submitting and being refused. The refusal is
 * correct (`assertCanSubmit` rejects `ENDED`) and it is the wrong place to learn it.
 *
 * ## Why the statements stay open and the page says so
 *
 * `READABLE` in lib/contest/gate.ts includes `ENDED` deliberately: reading the problems afterwards
 * is how you find out what you missed, and it is most of the value of the evening for the students
 * who did not finish. That is worth stating out loud, because "the contest is over" reads as "and
 * therefore there is nothing here", which is exactly the dead end this panel exists to remove.
 */

export interface ContestEndedPanelProps {
  readonly phase: ContestPhase;
  /**
   * The live answer to "is the public board still frozen", from the lobby's board poll. Null until
   * the poll answers, when the server's render-time answer on `phase` stands in.
   */
  readonly boardFrozen?: boolean | null;
  /** The freeze instant, from the same poll. Falls back to `phase.freezeAt`. */
  readonly frozenAt?: string | null;
}

/**
 * The sentence after "submissions are closed".
 *
 * "Final" only once the organizers have revealed the board. After End on a frozen board the
 * walkthrough found this panel saying "the standings beside this are final" next to a card that
 * said BOARD FROZEN, and the two cannot both be true. Exported for its unit test.
 */
export function endedBoardLine(frozen: boolean, frozenAt: string | null): string {
  if (!frozen) return "These are the final standings.";
  const time = frozenAt === null ? "" : formatEventTime(frozenAt);
  const froze = time === "" ? "The board is frozen" : `The board froze at ${time}`;
  return `${froze} and stays frozen until the organizers reveal the final standings.`;
}

export function ContestEndedPanel({ phase, boardFrozen = null, frozenAt = null }: ContestEndedPanelProps) {
  const frozen = boardFrozen ?? phase.boardFrozen === true;
  const freezeInstant = frozenAt ?? phase.freezeAt ?? null;
  const endedAt = new Date(phase.endsAt);
  const endedLabel = Number.isNaN(endedAt.getTime())
    ? null
    : endedAt.toLocaleString("en-US", {
        timeZone: EVENT_TIME_ZONE,
        weekday: "long",
        hour: "numeric",
        minute: "2-digit",
      });

  return (
    <section
      // `status`, not `alert`. A contest finishing on time is the plan, not a fault.
      role="status"
      aria-label="This contest has finished"
      className="flex items-stretch overflow-hidden rounded-panel border border-rule-edge bg-paper"
    >
      <Rail state="brand" />
      <div className="min-w-0 flex-1 px-4 py-3">
        <h2 className="font-display font-bold text-panther" style={{ fontSize: "var(--text-md)" }}>
          {phase.name} has finished
        </h2>
        <p className="mt-1" style={{ fontSize: "var(--text-sm)" }}>
          {endedLabel === null
            ? "The contest is over, and submissions are closed."
            : `The contest ended at ${endedLabel}, and submissions are closed.`}{" "}
          <span data-testid="ended-board-line">{endedBoardLine(frozen, freezeInstant)}</span>
        </p>

        <ul className="mt-2 grid gap-1.5 text-ink/75" style={{ fontSize: "var(--text-sm)" }}>
          {/*
            Conditional on the gate's own answer rather than on the word "ENDED". A contest whose
            window has closed while an organizer has not yet moved the state is a real intermediate
            state, and in it the statements are still open — so the page must not promise otherwise
            in one direction or the other.
          */}
          <li>
            {phase.statementsOpen
              ? "You can still read the problems, but nothing is scored now."
              : "The problems have been closed by an organizer."}
          </li>
          <li>
            Your verdicts and your code are kept.{" "}
            <Link href="/submissions" className="text-panther underline underline-offset-2">
              My submissions
            </Link>{" "}
            has every attempt you made, newest first.
          </li>
          <li>
            The night is scored by team.{" "}
            <Link href="/team" className="text-panther underline underline-offset-2">
              My team
            </Link>{" "}
            shows your team&apos;s total and the arithmetic behind it.
          </li>
          {/*
            Team and set, in the past tense, because this panel REPLACES `AssignmentNotice` after
            the end rather than sitting above it. That notice's whole subject is what you may open
            and submit to, and every phrasing of it is false once the judge is closed. The two
            facts worth keeping are which team the score belongs to and which set the rows came
            from, so they are said here instead.
          */}
          {(phase.teamName !== null || phase.setLabel !== null) && (
            <li>
              {phase.teamName === null
                ? "You were not on a team."
                : `You competed for ${phase.teamName}.`}{" "}
              {phase.setLabel === null
                ? "No problem set was assigned to you."
                : `Your problem set was ${phase.setLabel}.`}
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
