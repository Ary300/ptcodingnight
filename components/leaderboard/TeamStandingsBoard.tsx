"use client";

import { useState } from "react";

import type { TeamStandingRow } from "@/lib/schemas/api";

/**
 * The team board.
 *
 * ## Why the arithmetic is on screen
 *
 * A team score is a mean, so it is not a number a student can check in their head — and the thing
 * this platform replaced got that arithmetic *wrong* by 31.25 points (docs/SCORING.md §2.1). So each
 * row can be expanded to show every input: each member's points, the group total, the divisor, and
 * the side activities. Someone who can see how the number was reached does not have to trust it, and
 * a wrong roster becomes visible instead of silently changing the result.
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

/** "1450 + 125 group, over 4 players, + 150 side" — the sentence form of the formula. */
function arithmeticFor(team: TeamStandingRow): string {
  const pool = `${team.playerPoolPoints} pts`;
  const divisor = team.teamSize === 0 ? "no players" : `${team.teamSize} player${team.teamSize === 1 ? "" : "s"}`;
  const mean =
    team.teamSize === 0 ? "0.00" : formatScore((team.playerPoolPoints * 100) / team.teamSize / 100);
  const side = team.sideActivityPoints === 0 ? "" : ` + ${team.sideActivityPoints} side`;

  return `${pool} ÷ ${divisor} = ${mean}${side}`;
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
   * Named here rather than repeated inline so a new row cannot pick one and forget the other.
   */
  const muted = projector ? "text-paper/70" : "text-ink/65";
  const dim = projector ? "text-paper/70" : "text-ink/60";
  const rule = projector ? "border-paper/20" : "border-ink/15";
  const hairline = projector ? "border-paper/12" : "border-ink/10";
  /** Panther red is chrome on the ink ground, never body text — DESIGN.md §2. */
  const accent = projector ? "text-gold" : "text-panther";

  if (teams.length === 0) {
    return (
      <p role="status" className={dim} style={{ fontSize: "var(--text-sm)" }}>
        No teams yet. An organizer creates teams and assigns players before the round starts.
      </p>
    );
  }

  return (
    <div
      role="table"
      aria-label="Team standings"
      aria-rowcount={teams.length}
      className="w-full"
    >
      <div
        role="row"
        className={`grid grid-cols-[3rem_1fr_auto] items-baseline gap-3 border-b ${rule} pb-2`}
      >
        <span role="columnheader" className={`numeric ${muted}`} style={{ fontSize: "var(--text-xs)" }}>
          #
        </span>
        <span role="columnheader" className={muted} style={{ fontSize: "var(--text-xs)" }}>
          Team
        </span>
        <span
          role="columnheader"
          className={`numeric text-right ${muted}`}
          style={{ fontSize: "var(--text-xs)" }}
        >
          Score
        </span>
      </div>

      {teams.map((team, index) => {
        const isOpen = expanded.has(team.teamId);
        const mine = highlightTeamId !== null && team.teamId === highlightTeamId;

        return (
          <div key={team.teamId} role="rowgroup">
            <div
              role="row"
              aria-rowindex={index + 1}
              className={[
                `grid grid-cols-[3rem_1fr_auto] items-baseline gap-3 border-b ${hairline} py-3`,
                mine ? "bg-panther/8" : "",
              ].join(" ")}
            >
              <span
                role="cell"
                className={`numeric font-display font-bold ${accent}`}
                style={{ fontSize: projector ? "var(--text-lg)" : "var(--text-md)" }}
              >
                {team.rank}
                {/* A genuine tie is shown as one. Two teams level on every key did equally well,
                    and inventing an order would be a lie the projector tells the room. */}
                {team.isTied && (
                  <span className={dim} aria-label="tied" style={{ fontSize: "var(--text-xs)" }}>
                    =
                  </span>
                )}
              </span>

              <span role="cell" className="min-w-0">
                <span
                  className="block truncate font-display font-bold"
                  style={{ fontSize: projector ? "var(--text-lg)" : "var(--text-md)" }}
                >
                  {team.name}
                </span>
                <span className={`numeric block ${muted}`} style={{ fontSize: "var(--text-xs)" }}>
                  {arithmeticFor(team)}
                  {team.teamSize === 1 && (
                    // Team size is the divisor, so a team of one is worth flagging: it is usually a
                    // roster mistake rather than an intended format.
                    <span className={`ml-2 ${accent}`}>· one player only</span>
                  )}
                </span>
              </span>

              <span role="cell" className="text-right">
                <span
                  className="numeric block font-display font-bold"
                  style={{ fontSize: projector ? "var(--text-xl)" : "var(--text-lg)" }}
                >
                  {formatScore(team.score)}
                </span>
                {!projector && (
                  <button
                    type="button"
                    onClick={() => toggle(team.teamId)}
                    aria-expanded={isOpen}
                    className="text-panther underline underline-offset-2"
                    style={{ fontSize: "var(--text-xs)" }}
                  >
                    {isOpen ? "Hide players" : `${team.players.length} players`}
                  </button>
                )}
              </span>
            </div>

            {/*
              A `row` holding one `cell`, and that wrapper is not decoration. `role="rowgroup"`
              may contain only rows, so putting the `ul`/`dl` straight inside it is a CRITICAL
              `aria-required-children` violation — and a screen reader in table mode does not
              announce content that is not in a cell. The one screen built so a student can check
              their own team's arithmetic was the screen where that arithmetic could not be read
              out.

              Unseen until now because the expanded panel only exists when there is real team
              data, and G9 was auditing the stub backend.
            */}
            {isOpen && !projector && (
              <div role="row" className="border-b border-ink/10 bg-ink/3 px-3 py-2">
                <div role="cell">
                <ul className="space-y-1">
                  {team.players.map((player) => (
                    <li
                      key={player.participantId}
                      className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3"
                      style={{ fontSize: "var(--text-xs)" }}
                    >
                      <span className="truncate">{player.displayName}</span>
                      <span className="numeric text-ink/65">
                        {player.chosenSetLabel === null ? "no set" : `set ${player.chosenSetLabel}`}
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
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
