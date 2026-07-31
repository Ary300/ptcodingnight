"use client";

import { useState } from "react";

import type { TeamStandingRow, TeamPlayerRow } from "@/lib/schemas/api";

import styles from "./leaderboard.module.css";

/**
 * The team board, built on the Codeforces standings table.
 *
 * ## Why that table and not a list of rows
 *
 * Codeforces puts one column per problem and one row per competitor, so the whole contest is a
 * grid you read in either direction: down a column to see how a problem went, across a row to see
 * how someone is doing. A ranked list of totals cannot answer either question. Everything else in
 * this application follows HackerRank; the standings follow Codeforces, because this is the one
 * screen where a dense grid beats a friendly list.
 *
 * Taken from that table, concretely: a centred title over a bordered grid, `#` / who / `=` / one
 * column per problem, a two-line cell with the score over the time, tabular figures so the columns
 * line up, thin rules and a tight row. What is NOT taken is at the bottom of this comment.
 *
 * ## What "one column per problem" means for a TEAM contest
 *
 * It cannot be per problem, and that is not a compromise — it is the format. Every player is
 * assigned a different set (PRD §6.2), so a team's members are not attempting the same problems
 * and a per-problem grid would be almost entirely empty. **The sets are the columns.** A cell is
 * one team's player in one set: their points, and — where the preset charges penalties — their
 * time under it, exactly where Codeforces puts the solve time. Read down column A and you can see
 * how the easy set went across the room; read across a row and you see who on that team carried
 * it.
 *
 * ## Why the arithmetic is still on screen
 *
 * A team score is a mean, so it is not a number a student can check in their head — and the thing
 * this platform replaced got that arithmetic *wrong* by 31.25 points (docs/SCORING.md §2.1). The
 * `=` column is the score; the row under the team name is how it was reached; and the expander
 * opens every input. Someone who can see how the number was reached does not have to trust it.
 *
 * This is also where the imitation stops. A CF row is a name and a total, because an individual's
 * score is a sum anyone can add up. A mean is not, so the divisor stays on the row. A board that
 * looked more like Codeforces by dropping it would be a worse board.
 *
 * ## Deliberately not copied
 *
 * - **A point value under each column letter.** CF prints what the problem is worth. A *set* has
 *   no single worth, and the contract this board reads (`TeamStandingsResponse`) carries no such
 *   number, so any figure printed there would be invented. The sub-label says what the column is
 *   instead.
 * - **The red `-2` failed-attempt count.** Attempts are not in the contract either. The nearest
 *   true statement is "a player is in this set and has not scored", and that is what an unscored
 *   cell shows: a real `0`, which reads as "attempted, nothing yet" without needing the colour.
 * - **Colour as the carrier of meaning.** CF leans on green-for-solved. Here `0` versus `420`,
 *   weight, and the em-dash for "nobody in this set" each read correctly in greyscale, which they
 *   have to: the board spends part of the night desaturated behind the freeze, and roughly 1 in 12
 *   boys in the room has a colour-vision deficiency (DESIGN.md §3).
 *
 * ## Formatting
 *
 * Scores render with `toFixed(2)` because `543.75` and `543.8` are different claims, and a mean is
 * routinely fractional. The value shown is derived from `scoreHundredths`, which is what the engine
 * ranks by; the decimal is never summed or compared here.
 */

export interface TeamStandingsBoardProps {
  teams: readonly TeamStandingRow[];
  /** Compact mode for the projector: no expansion, larger type, ranks only. */
  variant?: "interactive" | "projector";
  /** Highlights the viewer's own team. */
  highlightTeamId?: string | null;
}

function formatScore(score: number): string {
  return score.toFixed(2);
}

/** "1450 pts ÷ 4 players = 362.50 + 150 side" — the sentence form of the formula. */
function arithmeticFor(team: TeamStandingRow): string {
  const pool = `${team.playerPoolPoints} pts`;
  const divisor =
    team.teamSize === 0
      ? "no players"
      : `${team.teamSize} player${team.teamSize === 1 ? "" : "s"}`;
  const mean =
    team.teamSize === 0
      ? "0.00"
      : formatScore((team.playerPoolPoints * 100) / team.teamSize / 100);
  const side =
    team.sideActivityPoints === 0 ? "" : ` + ${team.sideActivityPoints} side`;

  return `${pool} ÷ ${divisor} = ${mean}${side}`;
}

/** One team's players in one set. Usually exactly one; a roster can legitimately double up. */
interface SetCell {
  readonly points: number;
  readonly names: readonly string[];
  readonly penaltyMinutes: number;
}

/**
 * The set labels to use as columns, across every team on the board.
 *
 * Sorted, and derived from the data rather than assumed to be A–D: a contest can be configured
 * with a different number of sets, and a column that exists because a constant said so would be
 * empty on every row without anyone noticing it was wrong.
 */
function setColumns(teams: readonly TeamStandingRow[]): readonly string[] {
  const labels = new Set<string>();
  for (const team of teams) {
    for (const player of team.players) {
      if (player.chosenSetLabel !== null) labels.add(player.chosenSetLabel);
    }
  }
  return [...labels].sort((a, b) => a.localeCompare(b));
}

function cellFor(team: TeamStandingRow, label: string): SetCell | null {
  const players = team.players.filter((p) => p.chosenSetLabel === label);
  if (players.length === 0) return null;

  return {
    points: players.reduce((sum, p) => sum + p.score, 0),
    names: players.map((p) => p.displayName),
    penaltyMinutes: players.reduce((sum, p) => sum + p.penaltyMinutes, 0),
  };
}

/**
 * Does this board charge penalties at all?
 *
 * Codeforces always prints a time under the score because every CF format is timed. The Coding
 * Night preset is not: `coding-night-classic` awards points and charges nothing, so on that board
 * the second line of every cell would read `0m` on every row — a column of zeroes whose only
 * content is that the column means nothing here.
 *
 * The decision is therefore taken once for the WHOLE board rather than per cell. Per cell, a row
 * with a penalty would be a line taller than a row without one and the grid would comb.
 */
function anyPenalty(teams: readonly TeamStandingRow[]): boolean {
  return teams.some((team) =>
    team.players.some((player: TeamPlayerRow) => player.penaltyMinutes > 0),
  );
}

export function TeamStandingsBoard({
  teams,
  variant = "interactive",
  highlightTeamId = null,
}: TeamStandingsBoardProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const projector = variant === "projector";

  const toggle = (teamId: string): void => {
    setExpanded((current) => {
      // A new Set rather than a mutation: immutable updates are the house rule, and React needs a
      // new reference to re-render anyway.
      const next = new Set(current);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  /**
   * The board renders on two grounds, and the DESIGN.md §7 contrast floors are stated per ground:
   * `text-ink/N` on `--paper` has a floor of 57%, `text-paper/N` on `--ink` has a floor of 47%.
   * The same class is therefore not merely a different colour on the projector, it is a different
   * *measurement* — muted ink text on the ink ground is unreadable rather than subtle.
   *
   * Named here rather than repeated inline so a new cell cannot pick one and forget the other.
   */
  const muted = projector ? "text-paper/75" : "text-ink/65";
  const dim = projector ? "text-paper/70" : "text-ink/60";
  const grid = projector ? "border-paper/25" : "border-ink/20";
  const headBg = projector ? "bg-paper/10" : "bg-ink/5";
  /** Panther red is chrome on the ink ground, never body text — DESIGN.md §2. */
  const accent = projector ? "text-gold" : "text-panther";

  /**
   * Codeforces prints a solved cell green and a failed one red. Both are available on the
   * projector and NEITHER is on the competitor board: `--rise` and `--fall` measure 2.02 and 1.94
   * on `--paper` and are dark-surface only (DESIGN.md §2). On paper the two states are carried by
   * weight and by `--panther` at 5.08 — the correct move rather than a concession, because the
   * number itself already says which state it is in.
   */
  const scored = projector ? "text-rise" : "text-ink";
  const unscored = projector ? "text-fall" : "text-panther";

  /**
   * Every size on the projector comes from the stage's `--fs-*` ladder rather than the raw
   * `--text-proj-*` tokens, so the board takes part in the uniform 1920→1280 degrade instead of
   * staying 1920-sized on a 720-tall canvas and running off the bottom. The fallbacks keep it
   * legible if it is ever rendered outside a `.stage`.
   *
   * `--text-proj-sm` is the floor of the projector scale and it is the floor here too: header
   * labels, the arithmetic line and the cell times all sit exactly on it. They were `--text-xs`
   * — 12.8px, a phone size, on a wall — and unreadable past the second row of desks.
   */
  const size = projector
    ? {
        head: "var(--fs-sm, var(--text-proj-sm))",
        sub: "var(--fs-sm, var(--text-proj-sm))",
        name: "var(--fs-md, var(--text-proj-md))",
        rank: "var(--fs-md, var(--text-proj-md))",
        cell: "var(--fs-md, var(--text-proj-md))",
        total: "var(--fs-lg, var(--text-proj-lg))",
      }
    : {
        head: "var(--text-xs)",
        sub: "var(--text-xs)",
        name: "var(--text-md)",
        rank: "var(--text-md)",
        cell: "var(--text-sm)",
        total: "var(--text-lg)",
      };

  const columns = setColumns(teams);
  const showTimes = anyPenalty(teams);

  if (teams.length === 0) {
    return (
      <p
        role="status"
        className={dim}
        style={{ fontSize: projector ? size.name : "var(--text-sm)" }}
      >
        No teams yet. An organizer creates teams and assigns players before the
        round starts.
      </p>
    );
  }

  /* Codeforces rows are tight, and on the projector the density is also what decides how many
     teams are on the wall at all: every extra pixel of padding is multiplied by the row count and
     comes off the bottom of a canvas that does not scroll. */
  const cellPad = projector ? "px-3 py-1" : "px-2.5 py-1.5";
  const numericCol = { width: "1%", whiteSpace: "nowrap" } as const;

  return (
    /*
      The table scrolls inside its own box, and it is CENTRED with a bound on its width.

      Both halves matter. Without the box, a grid wider than a phone makes the *document* scroll
      sideways, which is a DESIGN.md §7 failure G9 checks for at 360px. Without the bound, the one
      flexible column (`Team`, at `width: 100%`) eats every spare pixel of a 1920 canvas and opens
      a quarter-screen gulf between each team's name and its score — which the eye has to cross on
      every row, from ten metres away.

      On the projector that bound GROWS WITH THE COLUMN COUNT, because a fixed one is wrong at
      both ends: sized for a two-set contest it squeezes a four-set one until the arithmetic line
      wraps and every row becomes three lines tall — which cost five of ten rows off the bottom of
      a 1080 canvas, under a footnote still claiming to show ten.
    */
    <div
      className="mx-auto w-full"
      style={{
        maxWidth: projector
          ? `calc(var(--fs-lg, 2.667rem) * ${String(24 + 4 * columns.length)})`
          : "72rem",
      }}
    >
      <div
        className={`w-full overflow-x-auto border ${grid} ${projector ? "" : "bg-paper"}`}
      >
        <table
          aria-label="Team standings"
          className="w-full border-collapse"
          style={{ fontSize: projector ? size.cell : "var(--text-sm)" }}
        >
          <thead>
            <tr className={headBg}>
              <th
                scope="col"
                className={`numeric border ${grid} ${cellPad} text-right font-normal ${muted}`}
                style={{ fontSize: size.head, ...numericCol }}
              >
                {/* CF's `#`: drawn as the glyph, read aloud as the word, because "number sign" is
                  not a column heading. */}
                <span aria-hidden="true">#</span>
                <span className={styles.visuallyHidden}>Rank</span>
              </th>
              {/*
              `width: 100%` on the one flexible column, `width: 1%` + nowrap on every other. That
              is the table idiom for "this column takes the slack, the rest are content-sized" —
              without it the leftover space lands on whichever column the browser feels like,
              which here first pushed `Side` off the right edge of a 1280 projector and then, once
              the others were pinned, made the rank column four hundred pixels wide. The wrapper's
              max-width is what stops the slack itself from becoming the next problem.
            */}
              <th
                scope="col"
                className={`border ${grid} ${cellPad} text-left font-normal ${muted}`}
                style={{ fontSize: size.head, width: "100%" }}
              >
                Team
              </th>
              {/*
              Codeforces labels its total column "=". Kept, because it is the same idea and it is
              the narrowest possible label for the column that matters most — but given a real
              accessible name, since "equals" read aloud is not a column heading.
            */}
              <th
                scope="col"
                aria-label="Team score"
                className={`numeric border ${grid} ${cellPad} text-right font-bold`}
                style={{ fontSize: size.head, ...numericCol }}
              >
                =
              </th>

              {columns.map((label) => (
                <th
                  key={label}
                  scope="col"
                  aria-label={`Set ${label}`}
                  className={`numeric border ${grid} ${cellPad} text-center font-bold`}
                  style={{ fontSize: size.head, ...numericCol }}
                >
                  {/* CF's column head is the problem letter over what it is worth. The letter is
                    ours too; the line under it says what the column IS, because a set has no
                    single point value and inventing one would put a lie in a very
                    authoritative-looking place. */}
                  <span
                    className={`block ${accent}`}
                    style={{ fontSize: size.cell }}
                  >
                    {label}
                  </span>
                  <span
                    className={`block font-normal ${muted}`}
                    style={{ fontSize: size.sub }}
                  >
                    set
                  </span>
                </th>
              ))}

              <th
                scope="col"
                className={`numeric border ${grid} ${cellPad} text-center font-normal ${muted}`}
                style={{ fontSize: size.head, ...numericCol }}
              >
                Group
              </th>
              <th
                scope="col"
                className={`numeric border ${grid} ${cellPad} text-center font-normal ${muted}`}
                style={{ fontSize: size.head, ...numericCol }}
              >
                Side
              </th>
            </tr>
          </thead>

          <tbody>
            {teams.map((team) => {
              const isOpen = expanded.has(team.teamId);
              const mine =
                highlightTeamId !== null && team.teamId === highlightTeamId;
              const rowTint = mine
                ? projector
                  ? "bg-gold/10"
                  : "bg-panther/8"
                : "";

              return [
                <tr key={team.teamId} className={rowTint}>
                  <td
                    className={`numeric border ${grid} ${cellPad} text-right align-top font-display font-bold ${accent}`}
                    style={{
                      fontSize: size.rank,
                      /* The rail (DESIGN.md §5) on the leading edge of the row. Here it marks the
                       viewer's own team, and it is reserved on every row so that no row is a
                       rail-width wider than its neighbours. */
                      borderLeftWidth: "var(--rail-width)",
                      borderLeftStyle: "solid",
                      borderLeftColor: mine
                        ? projector
                          ? "var(--color-gold)"
                          : "var(--color-panther)"
                        : "transparent",
                    }}
                  >
                    {team.rank}
                    {/* A genuine tie is shown as one. Two teams level on every key did equally well,
                      and inventing an order would be a lie the projector tells the room. */}
                    {team.isTied && (
                      <span
                        className={dim}
                        aria-label="tied"
                        style={{ fontSize: size.sub }}
                      >
                        =
                      </span>
                    )}
                  </td>

                  <td className={`border ${grid} ${cellPad} align-top`}>
                    <span
                      className="block truncate font-display font-bold"
                      style={{ fontSize: size.name }}
                    >
                      {team.name}
                      {mine && (
                        /* A tint is a colour, and colour is never the only channel (DESIGN.md §3).
                         The word is what actually says whose row this is. */
                        <span
                          className={`ml-2 font-body font-normal ${accent}`}
                          style={{ fontSize: size.sub }}
                        >
                          your team
                        </span>
                      )}
                    </span>
                    <span
                      className={`numeric block ${muted}`}
                      style={{
                        fontSize: size.sub,
                        /* One line on the projector, where a wrap costs a third of a row's height
                           on every row and pushes teams off the bottom of the board. On a phone it
                           is allowed to wrap, because there the alternative is a horizontal
                           scroll to read your own team's arithmetic. */
                        whiteSpace: projector ? "nowrap" : "normal",
                      }}
                    >
                      {arithmeticFor(team)}
                      {team.teamSize === 1 && (
                        // Team size is the divisor, so a team of one is worth flagging: it is usually
                        // a roster mistake rather than an intended format.
                        <span className={`ml-2 ${accent}`}>
                          · one player only
                        </span>
                      )}
                    </span>
                    {!projector && (
                      <button
                        type="button"
                        onClick={() => toggle(team.teamId)}
                        aria-expanded={isOpen}
                        className="mt-0.5 text-panther underline underline-offset-2"
                        style={{ fontSize: size.sub }}
                      >
                        {isOpen
                          ? "Hide players"
                          : `${String(team.players.length)} player${team.players.length === 1 ? "" : "s"}`}
                      </button>
                    )}
                  </td>

                  <td
                    className={`numeric border ${grid} ${cellPad} text-right align-top font-display font-bold`}
                    style={{ fontSize: size.total }}
                  >
                    {formatScore(team.score)}
                  </td>

                  {columns.map((label) => {
                    const cell = cellFor(team, label);
                    return (
                      <td
                        key={label}
                        className={`numeric border ${grid} ${cellPad} text-center align-top`}
                      >
                        {cell === null ? (
                          // Nobody on this team is in this set. An em-dash, not a zero: zero is a
                          // score somebody earned and this is the absence of a player.
                          <span
                            className={dim}
                            aria-label="no player in this set"
                          >
                            &mdash;
                          </span>
                        ) : (
                          <>
                            <span
                              className={`block font-bold ${cell.points > 0 ? scored : unscored}`}
                              style={{ fontSize: size.cell }}
                            >
                              {cell.points}
                            </span>
                            {/* CF's second line is the time. Ours is the penalty the preset charged,
                              and it appears only on a board that charges any — see `anyPenalty`. */}
                            {showTimes && (
                              <span
                                className={`block ${dim}`}
                                style={{ fontSize: size.sub }}
                              >
                                <span aria-hidden="true">
                                  {cell.penaltyMinutes}m
                                </span>
                                <span className={styles.visuallyHidden}>
                                  {cell.penaltyMinutes} minutes penalty
                                </span>
                              </span>
                            )}
                            {!projector && (
                              <span
                                className={`block truncate ${muted}`}
                                style={{ fontSize: size.sub, maxWidth: "9rem" }}
                              >
                                {cell.names.join(", ")}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}

                  <td
                    className={`numeric border ${grid} ${cellPad} text-center align-top`}
                  >
                    {team.groupPoints === 0 ? (
                      <span className={dim}>&mdash;</span>
                    ) : (
                      <span
                        className={`font-bold ${scored}`}
                        style={{ fontSize: size.cell }}
                      >
                        {team.groupPoints}
                      </span>
                    )}
                  </td>
                  <td
                    className={`numeric border ${grid} ${cellPad} text-center align-top`}
                  >
                    {team.sideActivityPoints === 0 ? (
                      <span className={dim}>&mdash;</span>
                    ) : (
                      <span
                        className={`font-bold ${scored}`}
                        style={{ fontSize: size.cell }}
                      >
                        {team.sideActivityPoints}
                      </span>
                    )}
                  </td>
                </tr>,

                isOpen && !projector ? (
                  <tr key={`${team.teamId}-detail`} className="bg-ink/3">
                    <td className={`border ${grid} ${cellPad}`} />
                    <td
                      className={`border ${grid} ${cellPad}`}
                      colSpan={3 + columns.length}
                    >
                      <ul className="space-y-1">
                        {team.players.map((player) => (
                          <li
                            key={player.participantId}
                            className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3"
                            style={{ fontSize: "var(--text-xs)" }}
                          >
                            <span className="truncate">
                              {player.displayName}
                            </span>
                            <span className="numeric text-ink/65">
                              {player.chosenSetLabel === null
                                ? "no set"
                                : `set ${player.chosenSetLabel}`}
                            </span>
                            <span className="numeric text-right font-bold">
                              {player.score}
                            </span>
                          </li>
                        ))}
                      </ul>

                      <dl
                        className="numeric mt-2 grid grid-cols-2 gap-x-4 border-t border-ink/10 pt-2 text-ink/65"
                        style={{ fontSize: "var(--text-xs)" }}
                      >
                        <dt>Group problems</dt>
                        <dd className="text-right">{team.groupPoints}</dd>
                        <dt>Player pool (÷ {team.teamSize})</dt>
                        <dd className="text-right">{team.playerPoolPoints}</dd>
                        <dt>Side activities (flat)</dt>
                        <dd className="text-right">
                          {team.sideActivityPoints}
                        </dd>
                        {team.penaltyMinutes > 0 && (
                          <>
                            <dt>Penalty</dt>
                            <dd className="text-right">
                              {team.penaltyMinutes} min
                            </dd>
                          </>
                        )}
                        <dt className="font-bold text-ink">Team score</dt>
                        <dd className="text-right font-bold text-ink">
                          {formatScore(team.score)}
                        </dd>
                      </dl>
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </div>

      {/*
        A phone shows the rank, the team and the total; the set columns are past the right edge of
        a 360px screen and there is nothing on a touch device to say so — the table simply looks
        like it ends. Said out loud below the narrow layout, and hidden once the columns fit.
      */}
      {!projector && (
        <p
          className={`mt-1.5 sm:hidden ${dim}`}
          style={{ fontSize: "var(--text-xs)" }}
        >
          Scroll the table sideways for the set, group and side columns.
        </p>
      )}
    </div>
  );
}
