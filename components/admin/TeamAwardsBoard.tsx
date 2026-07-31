"use client";

import { Button } from "@/components/ui";
import { Panel } from "@/components/admin/Panel";
import {
  downloadBlob,
  gridToCsv,
  gridToXlsx,
  teamSafeFilename,
  teamStandingsToGrid,
} from "@/components/admin/export";
import { TeamStandingsBoard } from "@/components/leaderboard";
import type { TeamStandingsResponse } from "@/lib/schemas/api";

/**
 * Final TEAM results: a podium, the full table, and export.
 *
 * The individual `AwardsBoard` next to this one is not redundant — Coding Night ranks teams
 * (PRD §6.1), but the ICPC preset ranks players, and both boards exist so the awards screen can
 * show whichever the contest actually used.
 *
 * ## The table is the SAME table the room saw
 *
 * It renders `TeamStandingsBoard`, the component behind the projector and behind a student's own
 * `/team` view, rather than a fourth hand-built grid. This screen used to carry its own — five
 * columns, its own expander, its own idea of which numbers mattered — and that is how an awards
 * screen ends up quietly disagreeing with the board the room just watched. There is one standings
 * table in this application and it looks the same everywhere it appears.
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

          {/*
            The full table, and the one everybody in the room has been looking at all night. The
            per-team expander, the arithmetic under each name and the flag on a team of one all
            live inside it, so they cannot drift away from what the projector showed.
          */}
          <TeamStandingsBoard teams={standings.teams} />
        </>
      )}
    </Panel>
  );
}
