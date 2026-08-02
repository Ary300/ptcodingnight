"use client";

import { useState } from "react";
import { formatEventTime } from "@/lib/contest/event-time";

import type { TeamPlayerProblem, TeamPlayerRow } from "@/lib/schemas/api";

import styles from "./leaderboard.module.css";

/**
 * Level two of the team board: how each player is doing.
 *
 * Level one — the `N players` button on `TeamStandingsBoard` — answers "what did each teammate
 * CONTRIBUTE": a name, a set and a point total. That is the arithmetic behind the mean and it is
 * public. It does not answer "how is he DOING", which is the question a captain asks with forty
 * minutes left: who is stuck, who is one rejection away, who has not started.
 *
 * ## Who sees this, and why
 *
 * The gate is not here. `TeamPlayerRow.problems` arrives `null` when the viewer is not entitled to
 * it, decided once in `getTeamStandings` — the routes behind this board are unauthenticated,
 * because the projector has no session, so the *payload* has to be the disclosure boundary. A
 * component gate would be theatre: the data would already be in the browser's network tab.
 *
 * What that means on each of the three surfaces this renders on:
 *
 * - **Projector.** Never rendered at all — `TeamStandingsBoard` puts the whole expander behind
 *   `!projector`, because a room reads ranks from ten metres and cannot click. The API also sends
 *   `null` to an anonymous reader, so it is enforced twice, which is the correct number of times
 *   for "every rival team's attempt history, on a wall, with no login".
 * - **Competitor lobby (`/team`).** Open for the viewer's OWN team, because their teammates'
 *   points are the divisor in their own score and a mean cannot be checked from a total. Closed
 *   for every other team, with a stated reason — see `NOT_YOURS` below.
 * - **`/admin/awards`.** Open on every team. An organizer sees through the freeze already and
 *   needs this to settle a dispute with the board rather than an argument.
 *
 * ## What is taken from Codeforces and what is not
 *
 * Taken: the wrong-attempt count as a first-class red number (`−2`), the solve time as a secondary
 * line, and per-problem density in place of prose.
 *
 * Not taken: CF's columns. CF has one column per problem because everyone attempts the same set;
 * here every player is on a *different* set (PRD §6.2), so a per-problem grid at team level would
 * be around ninety per cent empty. Per problem is dense only per PLAYER, which is exactly where
 * this panel sits.
 *
 * Scores are already normalized to each contest problem's `basePoints` before they reach this
 * panel. Test-case weights divide partial credit; they are not a second public scoring scale.
 */

/** Shown in place of the control on a team that is not the viewer's. */
const NOT_YOURS = "Per-problem detail is shown for your own team.";

/**
 * Solve time, in the reader's own clock, to the minute.
 *
 * Codeforces prints `HH:MM` elapsed from the contest start. Ours is wall-clock, because a student
 * in the room compares it against the clock on the wall and against when they remember submitting,
 * not against a contest offset nothing else on this screen shows.
 *
 * Client-only: this board's data arrives from a `fetch` in an effect, so the server never renders
 * a row and a locale-formatted time cannot cause a hydration mismatch.
 */
function clockTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return formatEventTime(at);
}

interface ProblemLineProps {
  problem: TeamPlayerProblem;
  playerName: string;
}

function ProblemLine({ problem, playerName }: ProblemLineProps) {
  /*
    Every fact after the score is a phrase in one muted run, wrapping freely. A grid would be
    tidier at 1440 and would either overflow or clip at 360 — and the whole panel exists to be
    read on a phone during a round, so the phone wins the tie.
  */
  const facts: string[] = [];

  if (problem.firstScoredAt !== null) facts.push(`first solved ${clockTime(problem.firstScoredAt)}`);
  if (problem.penaltyMinutes > 0) facts.push(`${String(problem.penaltyMinutes)} min penalty`);
  if (problem.hintsTaken > 0) {
    facts.push(
      `${String(problem.hintsTaken)} hint${problem.hintsTaken === 1 ? "" : "s"} (−${String(problem.hintDeduction)})`,
    );
  }
  if (problem.isGroupProblem) {
    // Stated in full rather than as a badge. A group problem's points are on the team's Group
    // column and deliberately NOT in this player's total (lib/scoring/team.ts), so a reader adding
    // the panel up and finding it short deserves the sentence rather than a word they must decode.
    // A colon rather than an em dash: no em dash in anything a user can read.
    facts.push(`group: counts for the team, not for ${playerName}`);
  }
  if (problem.score === 0 && !problem.isGroupProblem) {
    // Said out loud rather than left to a bare `0`. A row exists here because there was a
    // submission or a hint, so "nothing yet" is a different state from a problem that is simply
    // absent from the list — and the two look identical if only the number speaks.
    facts.push("not scored yet");
  }

  return (
    <li className="border-t border-rule-hair py-1.5 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="numeric shrink-0 font-bold text-ink" style={{ fontSize: "var(--text-xs)" }}>
          {problem.slotLabel}
        </span>
        {/*
          Wraps, and is NOT truncated.

          `truncate` sets `white-space: nowrap`, and this panel lives inside a `<td>` of an
          auto-layout table: nowrap makes the cell's MIN-content width the full length of the
          longest problem title, which the table then has to honour. Measured at 360px, that alone
          pushed the document from 628px to 715px the moment a panel opened. Wrapping puts
          min-content back at the longest word.
        */}
        <span
          className="min-w-0 flex-1 break-words text-ink"
          style={{ fontSize: "var(--text-xs)" }}
        >
          {problem.title}
        </span>

        {/*
          Codeforces' red `−2`, kept as a number and a glyph rather than as a colour: `--panther`
          measures 5.08:1 on `--paper`, which passes, but roughly one boy in twelve in the room has
          a colour-vision deficiency and the board also spends part of the night desaturated behind
          the freeze (DESIGN.md §3). The minus sign is what carries the meaning; the red is a
          second channel on top of it.

          Shown whenever it is non-zero, INCLUDING on a solved problem — "solved on the fourth try"
          is a true and useful thing to know about a teammate. It is a rejection count, never an
          attempt count: a first-try accept is 0, indistinguishable from never submitting, and the
          score beside it is what separates those.
        */}
        {problem.rejectedCount > 0 && (
          <span className="numeric shrink-0 font-bold text-panther" style={{ fontSize: "var(--text-xs)" }}>
            <span aria-hidden="true">&minus;{problem.rejectedCount}</span>
            <span className={styles.visuallyHidden}>
              {problem.rejectedCount} rejected submission{problem.rejectedCount === 1 ? "" : "s"}
            </span>
          </span>
        )}

        <span
          className={`numeric shrink-0 text-right font-bold ${problem.score > 0 ? "text-ink" : "text-ink/60"}`}
          style={{ fontSize: "var(--text-xs)", minWidth: "3.5rem" }}
        >
          {problem.score}
          <span className={styles.visuallyHidden}> points</span>
        </span>
      </div>

      {facts.length > 0 && (
        <p className="mt-0.5 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          {facts.join(" · ")}
        </p>
      )}
    </li>
  );
}

export interface TeamPlayerLineProps {
  player: TeamPlayerRow;
}

/**
 * One player inside the level-one roster, with the level-two disclosure when it is theirs to open.
 *
 * A real `<button aria-expanded>`, not `<details>/<summary>`: this list lives inside a `<td>` of the
 * standings table, and `<details>` is invalid there — and the level-one expander above it is
 * already a button, so a second mechanism would also be two keyboard idioms on one screen.
 */
export function TeamPlayerLine({ player }: TeamPlayerLineProps) {
  const [open, setOpen] = useState(false);

  const detail = player.problems;
  // `null` and `[]` are different claims and must not collapse into one rendering. `[]` is "this
  // student has attempted nothing", which is a fact about them; `null` is "not yours to read",
  // which is a fact about the viewer. Silence would read as a bug, and an empty panel would read
  // as "he solved nothing" — a lie about a real student.
  const mayRead = detail !== null;
  const hasRows = detail !== null && detail.length > 0;

  const setText = player.chosenSetLabel === null ? "no set" : `set ${player.chosenSetLabel}`;
  const solved = `${String(player.solvedCount)} solved`;

  return (
    <li>
      <div
        className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3"
        style={{ fontSize: "var(--text-xs)" }}
      >
        {hasRows ? (
          <button
            type="button"
            onClick={() => {
              setOpen((current) => !current);
            }}
            aria-expanded={open}
            className="min-w-0 truncate text-left text-panther underline underline-offset-2"
          >
            {/* The glyph is a second channel for the open state, since `aria-expanded` is not
                visible and the underline says "control", not "expanded". It is the shared
                Select chevron (same path, stroke and caps) rather than the text glyphs it used
                to be — one arrow style product-wide (inventory D36), down when open, right when
                closed. Inline, so the button's `truncate` still measures it. */}
            <svg
              aria-hidden="true"
              focusable="false"
              width={9}
              height={6}
              viewBox="0 0 10 6"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`mr-1 inline-block transition-transform ${open ? "" : "-rotate-90"}`}
            >
              <path d="M1 1L5 5L9 1" />
            </svg>
            {player.displayName}
            {/* A button whose whole accessible name is a person's name says nothing about what
                pressing it does. The name is separated, not concatenated: "Adaproblem by problem"
                is what a screen reader reads back when two adjacent runs are only separated
                visually. A colon does that job; an em dash is banned from anything a user can
                read, and an accessible name is read out loud, which is as user-visible as text
                gets. */}
            <span className={styles.visuallyHidden}>: problem by problem</span>
          </button>
        ) : (
          <span className="min-w-0 truncate">{player.displayName}</span>
        )}

        <span className="numeric text-ink/65">
          {setText}
          {/* Ungated, like the point total beside it: how many problems someone has solved is the
              same class of fact as how many points they have, and the projector prints that. */}
          <span className="ml-2">{solved}</span>
        </span>
        <span className="numeric text-right font-bold">{player.score}</span>
      </div>

      {!mayRead && (
        <p className="mt-0.5 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          {NOT_YOURS}
        </p>
      )}

      {mayRead && !hasRows && (
        <p className="mt-0.5 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          No submissions and no hints yet.
        </p>
      )}

      {open && detail !== null && (
        /*
          `overflow-x-auto` is load-bearing, not decoration.

          This panel lives inside a `<td>` of an auto-layout table, so whatever min-content width it
          has, the TABLE has to honour — and the table's width leaks to the document on `/team`,
          where `MyTeamView` puts the board in a flex column without `min-w-0`. Measured at 360px:
          opening one panel took the document from 628px to 715px. A box that scrolls in x
          contributes zero min-content in x, which is the same technique the board itself uses to
          keep a wide grid off the document, and it makes the property structural rather than a
          matter of every future line in here staying narrow.

          In practice it never scrolls: the lines wrap, so the panel's own min-content is under
          100px and the column it sits in is always wider than that.
        */
        <div className="mt-1 overflow-x-auto border-l-2 border-rule-edge pl-2.5">
          {player.lastScoreIncreaseAt !== null && (
            /* "Still moving" versus "stalled forty minutes ago" is the single most useful signal
               for how someone is doing, and it is free — the engine already computes it. */
            <p className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
              Last scored at {clockTime(player.lastScoreIncreaseAt)}
            </p>
          )}
          <ul aria-label={`${player.displayName}: problem by problem`}>
            {detail.map((problem) => (
              <ProblemLine
                key={problem.contestProblemId}
                problem={problem}
                playerName={player.displayName}
              />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
