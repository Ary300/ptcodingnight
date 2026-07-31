"use client";

import { useState } from "react";

import type { TeamStandingRow } from "@/lib/schemas/api";

/**
 * The team board, built on the Codeforces standings table.
 *
 * ## Why that table and not a list of rows
 *
 * Codeforces puts one column per problem and one row per competitor, so the whole contest is a
 * grid you read in either direction: down a column to see how a problem went, across a row to see
 * how someone is doing. A ranked list of totals cannot answer either question.
 *
 * ## What "one column per problem" means for a TEAM contest
 *
 * It cannot be per problem, and that is not a compromise — it is the format. Every player is
 * assigned a different set (PRD §6.2), so a team's members are not attempting the same problems
 * and a per-problem grid would be almost entirely empty. **The sets are the columns.** A cell is
 * one team's player in one set: their points, and their name under it, exactly where Codeforces
 * puts the solve time. Read down column A and you can see how the easy set went across the room;
 * read across a row and you see who on that team carried it.
 *
 * ## Why the arithmetic is still on screen
 *
 * A team score is a mean, so it is not a number a student can check in their head — and the thing
 * this platform replaced got that arithmetic *wrong* by 31.25 points (docs/SCORING.md §2.1). The
 * `=` column is the score; the row under the team name is how it was reached; and the expander
 * opens every input. Someone who can see how the number was reached does not have to trust it.
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
    team.teamSize === 0 ? "no players" : `${team.teamSize} player${team.teamSize === 1 ? "" : "s"}`;
  const mean =
    team.teamSize === 0 ? "0.00" : formatScore((team.playerPoolPoints * 100) / team.teamSize / 100);
  const side = team.sideActivityPoints === 0 ? "" : ` + ${team.sideActivityPoints} side`;

  return `${pool} ÷ ${divisor} = ${mean}${side}`;
}

/** One team's players in one set. Usually exactly one; a roster can legitimately double up. */
interface SetCell {
  readonly points: number;
  readonly names: readonly string[];
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
  };
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
  const grid = projector ? "border-paper/20" : "border-ink/15";
  const headBg = projector ? "bg-paper/8" : "bg-ink/4";
  /** Panther red is chrome on the ink ground, never body text — DESIGN.md §2. */
  const accent = projector ? "text-gold" : "text-panther";

  /**
   * Codeforces prints a solved cell in green. That is available here on the projector and NOT on
   * the competitor board: `--rise` measures below the floor on `--paper` and is dark-surface only
   * (DESIGN.md §2). On paper the same signal is carried by weight, which is the correct move
   * rather than a concession — a scored cell is bold and an empty one is a dash, so the grid still
   * reads at a glance without the colour.
   */
  const scored = projector ? "text-rise" : "text-ink";

  const columns = setColumns(teams);

  if (teams.length === 0) {
    return (
      <p role="status" className={dim} style={{ fontSize: "var(--text-sm)" }}>
        No teams yet. An organizer creates teams and assigns players before the round starts.
      </p>
    );
  }

  const cellPad = projector ? "px-3 py-2" : "px-2.5 py-2";

  return (
    /*
      The table scrolls inside its own box. With a column per set this is wider than a phone, and
      a page that scrolls sideways is a DESIGN.md §7 failure that G9 checks for at 360px — the
      overflow has to be owned by the grid, never by the document.
    */
    <div className={`w-full overflow-x-auto border ${grid} ${projector ? "" : "bg-paper"}`}>
      <table
        aria-label="Team standings"
        className="w-full border-collapse"
        style={{ fontSize: projector ? "var(--text-proj-sm)" : "var(--text-sm)" }}
      >
        <thead>
          <tr className={headBg}>
            <th
              scope="col"
              className={`numeric border ${grid} ${cellPad} text-right font-normal ${muted}`}
              style={{ fontSize: "var(--text-xs)", width: "1%", whiteSpace: "nowrap" }}
            >
              #
            </th>
            {/*
              `width: 100%` on the one flexible column, `width: 1%` + nowrap on every other. That
              is the table idiom for "this column takes the slack, the rest are content-sized" —
              without it the leftover space lands on whichever column the browser feels like,
              which here first pushed `Side` off the right edge of a 1280 projector and then, once
              the others were pinned, made the rank column four hundred pixels wide.

              1280x720 is a real projector resolution, not a small-screen fallback: school
              projectors are 1920 or 1280 and it must not reflow on either (DESIGN.md §5).
            */}
            <th
              scope="col"
              className={`border ${grid} ${cellPad} text-left font-normal ${muted}`}
              style={{ fontSize: "var(--text-xs)", width: "100%" }}
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
              style={{ fontSize: "var(--text-xs)", width: "1%", whiteSpace: "nowrap" }}
            >
              =
            </th>

            {columns.map((label) => (
              <th
                key={label}
                scope="col"
                className={`numeric border ${grid} ${cellPad} text-center font-bold`}
                style={{ fontSize: "var(--text-xs)", width: "1%", whiteSpace: "nowrap" }}
              >
                <span className={accent}>{label}</span>
                <span className={`block font-normal ${muted}`} style={{ fontSize: "var(--text-xs)" }}>
                  set
                </span>
              </th>
            ))}

            <th
              scope="col"
              className={`numeric border ${grid} ${cellPad} text-center font-normal ${muted}`}
              style={{ fontSize: "var(--text-xs)", width: "1%", whiteSpace: "nowrap" }}
            >
              Group
            </th>
            <th
              scope="col"
              className={`numeric border ${grid} ${cellPad} text-center font-normal ${muted}`}
              style={{ fontSize: "var(--text-xs)", width: "1%", whiteSpace: "nowrap" }}
            >
              Side
            </th>
          </tr>
        </thead>

        <tbody>
          {teams.map((team) => {
            const isOpen = expanded.has(team.teamId);
            const mine = highlightTeamId !== null && team.teamId === highlightTeamId;
            const rowTint = mine ? (projector ? "bg-gold/10" : "bg-panther/8") : "";

            return [
              <tr key={team.teamId} className={rowTint}>
                <td
                  className={`numeric border ${grid} ${cellPad} text-right align-top font-display font-bold ${accent}`}
                  style={{ fontSize: projector ? "var(--text-proj-md)" : "var(--text-md)" }}
                >
                  {team.rank}
                  {/* A genuine tie is shown as one. Two teams level on every key did equally well,
                      and inventing an order would be a lie the projector tells the room. */}
                  {team.isTied && (
                    <span className={dim} aria-label="tied" style={{ fontSize: "var(--text-xs)" }}>
                      =
                    </span>
                  )}
                </td>

                <td className={`border ${grid} ${cellPad} align-top`}>
                  <span
                    className="block truncate font-display font-bold"
                    style={{ fontSize: projector ? "var(--text-proj-sm)" : "var(--text-md)" }}
                  >
                    {team.name}
                  </span>
                  <span className={`numeric block ${muted}`} style={{ fontSize: "var(--text-xs)" }}>
                    {arithmeticFor(team)}
                    {team.teamSize === 1 && (
                      // Team size is the divisor, so a team of one is worth flagging: it is usually
                      // a roster mistake rather than an intended format.
                      <span className={`ml-2 ${accent}`}>· one player only</span>
                    )}
                  </span>
                  {!projector && (
                    <button
                      type="button"
                      onClick={() => toggle(team.teamId)}
                      aria-expanded={isOpen}
                      className="mt-0.5 text-panther underline underline-offset-2"
                      style={{ fontSize: "var(--text-xs)" }}
                    >
                      {isOpen
                        ? "Hide players"
                        : `${String(team.players.length)} player${team.players.length === 1 ? "" : "s"}`}
                    </button>
                  )}
                </td>

                <td
                  className={`numeric border ${grid} ${cellPad} text-right align-top font-display font-bold`}
                  style={{ fontSize: projector ? "var(--text-proj-md)" : "var(--text-lg)" }}
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
                        <span className={dim} aria-label="no player in this set">
                          &mdash;
                        </span>
                      ) : (
                        <>
                          <span className={`block font-bold ${scored}`}>{cell.points}</span>
                          {!projector && (
                            <span
                              className={`block truncate ${muted}`}
                              style={{ fontSize: "var(--text-xs)", maxWidth: "9rem" }}
                            >
                              {cell.names.join(", ")}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  );
                })}

                <td className={`numeric border ${grid} ${cellPad} text-center align-top`}>
                  {team.groupPoints === 0 ? (
                    <span className={dim}>&mdash;</span>
                  ) : (
                    <span className={`font-bold ${scored}`}>{team.groupPoints}</span>
                  )}
                </td>
                <td className={`numeric border ${grid} ${cellPad} text-center align-top`}>
                  {team.sideActivityPoints === 0 ? (
                    <span className={dim}>&mdash;</span>
                  ) : (
                    <span className={`font-bold ${scored}`}>{team.sideActivityPoints}</span>
                  )}
                </td>
              </tr>,

              isOpen && !projector ? (
                <tr key={`${team.teamId}-detail`} className="bg-ink/3">
                  <td className={`border ${grid} ${cellPad}`} />
                  <td className={`border ${grid} ${cellPad}`} colSpan={3 + columns.length}>
                    <ul className="space-y-1">
                      {team.players.map((player) => (
                        <li
                          key={player.participantId}
                          className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3"
                          style={{ fontSize: "var(--text-xs)" }}
                        >
                          <span className="truncate">{player.displayName}</span>
                          <span className="numeric text-ink/65">
                            {player.chosenSetLabel === null
                              ? "no set"
                              : `set ${player.chosenSetLabel}`}
                          </span>
                          <span className="numeric text-right font-bold">{player.score}</span>
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
                      <dd className="text-right">{team.sideActivityPoints}</dd>
                      {team.penaltyMinutes > 0 && (
                        <>
                          <dt>Penalty</dt>
                          <dd className="text-right">{team.penaltyMinutes} min</dd>
                        </>
                      )}
                      <dt className="font-bold text-ink">Team score</dt>
                      <dd className="text-right font-bold text-ink">{formatScore(team.score)}</dd>
                    </dl>
                  </td>
                </tr>
              ) : null,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
