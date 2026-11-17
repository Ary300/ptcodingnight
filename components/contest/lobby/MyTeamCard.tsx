"use client";

import Link from "next/link";

import { Rail } from "@/components/ui";
import { shownName } from "@/lib/contest/guest-name";
import type { TeamPlayerRow, TeamStandingsResponse } from "@/lib/schemas/api";

import { standingsState, teamOfParticipant } from "../standings/standings-state";
import { BoardFrozenNotice, FinalStandingsNotice } from "./BoardFrozenNotice";
import { playerProgress, setLetterFor } from "./my-team-progress";

/**
 * The lobby's right-hand card: the student's OWN team, one line per teammate.
 *
 * It replaces a ranked board of every individual student in the contest. The organizers decided
 * that individual scores are visible only inside a student's own team, so this card reads the
 * signed-in team board (the same response /team reads) and shows nothing but the viewer's team:
 * each teammate's name, set letter, points, and which problems they have solved or attempted.
 * The full team ranking is one link away on /standings.
 *
 * The freeze is obeyed for free, because the server computes this board as of the freeze for
 * anyone who is not an organizer. The notice says so in the same words as /standings and /team.
 *
 * Paper ground, so the shared notice renders exactly as it does on those pages. Muted text is
 * `text-ink/60` or darker (DESIGN.md §7).
 */

export interface MyTeamCardProps {
  readonly standings: TeamStandingsResponse | null;
  readonly error: string | null;
  readonly participantId: string;
  /** Whether the window has closed, by the server's clock. */
  readonly submissionsClosed: boolean;
}

export function MyTeamCard({ standings, error, participantId, submissionsClosed }: MyTeamCardProps) {
  const teamId = standings === null ? null : teamOfParticipant(standings.teams, participantId);
  const team = teamId === null ? null : (standings?.teams.find((t) => t.teamId === teamId) ?? null);
  const state = standings === null ? null : standingsState(standings);

  return (
    <section
      aria-label="Your team"
      data-testid="lobby-team-card"
      className="flex flex-col gap-3 rounded-panel border border-rule-edge bg-paper p-4"
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
          {team === null ? "Your team" : team.name}
        </h2>
        <Link
          href="/standings"
          className="ml-auto text-panther underline underline-offset-2"
          style={{ fontSize: "var(--text-xs)" }}
        >
          Full team standings
        </Link>
      </header>

      {standings !== null && state === "frozen" && (
        <BoardFrozenNotice frozenAt={standings.asOf} submissionsClosed={submissionsClosed} />
      )}
      {state === "final" && <FinalStandingsNotice />}

      {standings === null ? (
        <p
          role={error === null ? "status" : "alert"}
          className={error === null ? "text-ink/60" : "text-panther"}
          style={{ fontSize: "var(--text-sm)" }}
        >
          {error ?? "Loading your team…"}
        </p>
      ) : team === null ? (
        <p className="text-ink/75" style={{ fontSize: "var(--text-sm)" }}>
          You are not on a team yet. An organizer adds you to one, and your points move with you.
        </p>
      ) : (
        <>
          {/* Score only, no rank: the payload's rank runs across both divisions while the wall and
              /standings rank within a division, so a rank here would disagree with them. */}
          <p className="text-ink/75" style={{ fontSize: "var(--text-sm)" }}>
            Team score <span className="numeric font-bold text-ink">{team.score.toFixed(2)}</span>
          </p>
          <ul aria-label={`${team.name} players`} className="flex flex-col">
            {team.players.map((player) => (
              <TeammateRow
                key={player.participantId}
                player={player}
                isYou={player.participantId === participantId}
                setLetter={setLetterFor(player.chosenSetLabel, standings.sets)}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

interface TeammateRowProps {
  readonly player: TeamPlayerRow;
  readonly isYou: boolean;
  readonly setLetter: string | null;
}

function TeammateRow({ player, isYou, setLetter }: TeammateRowProps) {
  const progress = playerProgress(player);

  return (
    <li
      data-testid="lobby-teammate"
      data-you={isYou ? "true" : undefined}
      className="flex items-stretch border-t border-rule-hair first:border-t-0"
      style={{
        background: isYou ? "color-mix(in srgb, var(--color-panther) 7%, transparent)" : undefined,
      }}
    >
      {/* The rail marks the viewer's own row by position as well as by tint, so it reads without
          colour (DESIGN.md §3). */}
      <Rail state={isYou ? "brand" : "rest"} />
      <div className="min-w-0 flex-1 px-2 py-2">
        <div className="flex items-baseline gap-2" style={{ fontSize: "var(--text-sm)" }}>
          <span className="min-w-0 font-display font-bold [overflow-wrap:anywhere]">
            {shownName(player.displayName)}
          </span>
          {isYou && (
            <span className="whitespace-nowrap text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
              <span className="sr-only">, </span>
              you
            </span>
          )}
          <span className="ml-auto whitespace-nowrap text-ink/75" style={{ fontSize: "var(--text-xs)" }}>
            {setLetter === null ? "No set" : `Set ${setLetter}`}
          </span>
          <span className="numeric whitespace-nowrap font-bold">
            {formatPoints(player.score)}
            <span className="sr-only"> points</span>
          </span>
        </div>

        <p className="mt-1 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          {progress.summary}
        </p>
        {progress.problems.length > 0 && (
          <ul aria-label={`${shownName(player.displayName)}: problems`} className="mt-1 flex flex-wrap gap-1">
            {progress.problems.map((problem) => (
              <li
                key={problem.contestProblemId}
                className={`rounded-chip border px-1.5 ${
                  problem.status === "solved"
                    ? "border-ink font-bold text-ink"
                    : "border-rule-firm text-ink/75"
                }`}
                style={{ fontSize: "var(--text-xs)" }}
              >
                <span className="numeric">{problem.slotLabel}</span>{" "}
                {problem.status === "solved" ? "solved" : "attempted"}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function formatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(2);
}
