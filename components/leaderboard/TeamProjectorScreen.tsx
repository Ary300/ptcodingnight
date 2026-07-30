"use client";

import { Countdown } from "./Countdown";
import { CrestWatermark } from "./CrestWatermark";
import { FrozenPlate } from "./FrozenPlate";
import { TeamStandingsBoard } from "./TeamStandingsBoard";
import { useTeamStandings } from "./useTeamStandings";

/**
 * `/projector` in team mode — the board on the wall.
 *
 * Team-level only. The per-player breakdown is deliberately NOT here: a room reads ranks from the
 * back of a classroom, and a projector that tries to show twelve players' subtotals shows nothing
 * legible. The breakdown lives in the competitor and admin views, where somebody is close enough to
 * a screen to read it.
 *
 * No login, no chrome, no scrollbars (PRD §9.3). A dropped poll keeps the previous rows rather than
 * blanking — the room cannot tell a five-second-stale board from a live one, and can very much tell
 * an empty one.
 */

export interface TeamProjectorScreenProps {
  contestId: string | null;
  /** Rows beyond this are not rendered: past ~12 the type is too small to read from the back. */
  maxRows?: number;
}

export function TeamProjectorScreen({ contestId, maxRows = 12 }: TeamProjectorScreenProps) {
  const { standings, source, error } = useTeamStandings(contestId);

  if (contestId === null) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper p-8">
        <p className="text-ink/65" style={{ fontSize: "var(--text-md)" }}>
          Add <code>?contest=&lt;id&gt;</code> to this URL to pin the board to a contest.
        </p>
      </main>
    );
  }

  if (standings === null) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper p-8">
        <p role="status" className="text-ink/65" style={{ fontSize: "var(--text-md)" }}>
          {source === "error" ? (error ?? "Cannot reach the scoreboard.") : "Loading standings…"}
        </p>
      </main>
    );
  }

  const visible = standings.teams.slice(0, maxRows);

  return (
    <main className="relative min-h-screen overflow-hidden bg-paper p-8">
      {/* The team board has no reveal sequence, so the crest never reaches its "lit" state here.
          The dramatic unfreeze belongs to the individual board's ProjectorScreen; adding a second
          copy of that machinery for teams would be two implementations of one moment. */}
      <CrestWatermark frozen={standings.frozen} lit={false} />

      <header className="relative flex items-baseline justify-between gap-6">
        <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
          Team standings
        </h1>
        <Countdown endsAt={standings.endsAt} />
      </header>

      {standings.frozen && (
        <FrozenPlate
          lifting={false}
          liftMs={0}
          asOfLabel={new Date(standings.asOf).toLocaleTimeString()}
        />
      )}

      <div className="relative mt-6">
        <TeamStandingsBoard teams={visible} variant="projector" />
      </div>

      {standings.teams.length > visible.length && (
        <p className="numeric relative mt-4 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          Showing top {visible.length} of {standings.teams.length} teams.
        </p>
      )}

      {/* A board that has lost contact says so rather than pretending. It keeps the last rows. */}
      {source === "error" && (
        <p role="status" className="relative mt-2 text-panther" style={{ fontSize: "var(--text-xs)" }}>
          {error ?? "Lost contact with the scoreboard. Retrying."}
        </p>
      )}
    </main>
  );
}
