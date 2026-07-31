"use client";

import { useState } from "react";

import { Button } from "@/components/ui";
import { Panel } from "@/components/admin/Panel";
import {
  downloadBlob,
  gridToCsv,
  gridToXlsx,
  teamSafeFilename,
  teamStandingsToGrid,
} from "@/components/admin/export";
import type { TeamStandingsResponse } from "@/lib/schemas/api";

/**
 * Final TEAM results: a podium, the full table, and export.
 *
 * The individual `AwardsBoard` next to this one is not redundant — Coding Night ranks teams
 * (PRD §6.1), but the ICPC preset ranks players, and both boards exist so the awards screen can
 * show whichever the contest actually used.
 *
 * ## The breakdown is the point
 *
 * A team score is a MEAN, so the number alone is not checkable by the people it is about. Every
 * row therefore shows its inputs — the player pool, the divisor, group points, side activities —
 * and expands to the per-player contributions. The thing this platform replaced got that
 * arithmetic wrong by 31.25 points and nobody could see where (docs/SCORING.md §2.1).
 *
 * Ties are shown as ties. PRD §6.1 is explicit that a remaining tie is never broken arbitrarily,
 * so two teams can share a step of the podium.
 */

const PLACE_LABEL = ["1st", "2nd", "3rd"] as const;

export interface TeamAwardsBoardProps {
  standings: TeamStandingsResponse;
  contestName: string;
}

function formatScore(score: number): string {
  return score.toFixed(2);
}

export function TeamAwardsBoard({ standings, contestName }: TeamAwardsBoardProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const toggle = (teamId: string): void => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  const podium = standings.teams.filter((team) => team.rank <= 3);

  return (
    <Panel
      title="Team results"
      description={
        <>
          Every row shows the numbers the score was computed from, not just the score. A team
          total is the player pool divided by the team size, plus side activity points.
        </>
      }
      aside={
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            style={{ fontSize: "var(--text-xs)" }}
            onClick={() => {
              downloadBlob(
                teamSafeFilename(contestName, "csv"),
                gridToCsv(teamStandingsToGrid(standings)),
                "text/csv;charset=utf-8",
              );
            }}
          >
            Export CSV
          </Button>
          <Button
            type="button"
            variant="secondary"
            style={{ fontSize: "var(--text-xs)" }}
            onClick={() => {
              downloadBlob(
                teamSafeFilename(contestName, "xlsx"),
                gridToXlsx(teamStandingsToGrid(standings)),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              );
            }}
          >
            Export XLSX
          </Button>
        </div>
      }
    >
      {standings.teams.length === 0 ? (
        <p role="status" className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
          No teams have scored yet.
        </p>
      ) : (
        <>
          {/*
            The podium inverts to `--ink` for one reason: `--gold` is the champion colour and it
            measures 1.39 on `--paper`, which is unreadable. On ink it is 13.44. Same
            justification as the individual board — not decoration (DESIGN.md §2).
          */}
          <ol className="mb-6 grid gap-3 sm:grid-cols-3">
            {podium.map((team) => (
              <li
                key={team.teamId}
                className="rounded bg-ink p-4 text-paper"
                aria-label={`${PLACE_LABEL[team.rank - 1] ?? `${String(team.rank)}th`} place, ${team.name}`}
              >
                <div
                  className="numeric font-display font-bold"
                  style={{ fontSize: "var(--text-sm)", color: "var(--color-gold)" }}
                >
                  {PLACE_LABEL[team.rank - 1] ?? `${String(team.rank)}th`}
                  {team.isTied && <span className="ml-2 text-paper/70">= tied</span>}
                </div>
                <div
                  className="mt-1 font-display font-bold"
                  style={{ fontSize: "var(--text-md)" }}
                >
                  {team.name}
                </div>
                <div className="numeric mt-1 text-paper/70" style={{ fontSize: "var(--text-xs)" }}>
                  {formatScore(team.score)} points
                </div>
              </li>
            ))}
          </ol>

          <div role="table" aria-label="Final team standings" className="w-full">
            <div
              role="row"
              className="grid grid-cols-[3rem_1fr_7rem_7rem_5rem] items-baseline gap-3 border-b border-ink/15 pb-2"
            >
              {["#", "Team", "Score", "Player pool", "Size"].map((heading, index) => (
                <span
                  key={heading}
                  role="columnheader"
                  className={`text-ink/65 ${index >= 2 ? "numeric text-right" : ""}`}
                  style={{ fontSize: "var(--text-xs)" }}
                >
                  {heading}
                </span>
              ))}
            </div>

            {standings.teams.map((team) => {
              const isOpen = expanded.has(team.teamId);
              return (
                <div key={team.teamId} role="rowgroup">
                  <div
                    role="row"
                    className="grid grid-cols-[3rem_1fr_7rem_7rem_5rem] items-baseline gap-3 border-b border-ink/10 py-2"
                  >
                    <span role="cell" className="numeric font-bold text-panther">
                      {team.rank}
                      {team.isTied && (
                        <span
                          className="ml-1 text-ink/60"
                          aria-label="tied"
                          style={{ fontSize: "var(--text-xs)" }}
                        >
                          =
                        </span>
                      )}
                    </span>
                    <span role="cell" className="min-w-0">
                      <span className="block truncate font-semibold">{team.name}</span>
                      <button
                        type="button"
                        onClick={() => toggle(team.teamId)}
                        aria-expanded={isOpen}
                        className="text-panther underline underline-offset-2"
                        style={{ fontSize: "var(--text-xs)" }}
                      >
                        {isOpen ? "Hide breakdown" : `${team.players.length} players`}
                      </button>
                    </span>
                    <span role="cell" className="numeric text-right font-bold">
                      {formatScore(team.score)}
                    </span>
                    <span role="cell" className="numeric text-right text-ink/75">
                      {team.playerPoolPoints}
                    </span>
                    <span role="cell" className="numeric text-right text-ink/75">
                      {team.teamSize}
                      {team.teamSize === 1 && (
                        // The divisor being 1 means this team's score is one person's points
                        // undivided. Usually a roster mistake, and it decides places.
                        <span className="ml-1 text-panther" style={{ fontSize: "var(--text-xs)" }}>
                          !
                        </span>
                      )}
                    </span>
                  </div>

                  {isOpen && (
                    <div role="row" className="border-b border-ink/10 bg-ink/3 px-3 py-2">
                      <div role="cell">
                        <ul className="space-y-1">
                          {team.players.map((player) => (
                            <li
                              key={player.participantId}
                              className="grid grid-cols-[1fr_auto] gap-3"
                              style={{ fontSize: "var(--text-xs)" }}
                            >
                              <span className="truncate">{player.displayName}</span>
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
                          <dt className="font-bold text-ink">Team score</dt>
                          <dd className="text-right font-bold text-ink">
                            {formatScore(team.score)}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Panel>
  );
}
