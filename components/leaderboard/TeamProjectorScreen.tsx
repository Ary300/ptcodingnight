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

  // The HEADER RENDERS IN EVERY STATE, including "no contest pinned" and "still loading".
  //
  // The first version early-returned a bare sentence for those cases, which meant the wall showed
  // an untitled page whenever anything was wrong — and a screen with no title is indistinguishable
  // from a broken deployment to everyone in the room. A titled screen saying why it is empty is a
  // different thing entirely.
  const message =
    contestId === null
      ? "Add ?contest=<id> to this URL to pin the board to a contest."
      : standings === null
        ? source === "error"
          ? (error ?? "Cannot reach the scoreboard.")
          : "Loading standings…"
        : null;

  const visible = standings === null ? [] : standings.teams.slice(0, maxRows);

  return (
    /*
      Ink ground, paper text — DESIGN.md §7, "the projector is monumental".
      This shipped as `bg-paper` with `text-ink`, which is the COMPETITOR surface: a phone read at
      30 cm in a lit room. On the wall it is a near-white 1920×1080 rectangle in a darkened room,
      which is glare rather than contrast, and it put every muted value on the wrong side of the
      floors in §7 — those are stated per ground (`text-ink/N` on paper, `text-paper/N` on ink),
      so a surface with the ground inverted has them all measured against the wrong background.

      It went unnoticed because it only became the DEFAULT projector when teams displaced the
      individual board, and the a11y spec that checks this rule was still pointed at the old one.
    */
    <main className="relative min-h-screen overflow-hidden bg-ink p-8 text-paper">
      {/* The team board has no reveal sequence, so the crest never reaches its "lit" state here.
          The dramatic unfreeze belongs to the individual board's ProjectorScreen; adding a second
          copy of that machinery for teams would be two implementations of one moment. */}
      <CrestWatermark frozen={standings?.frozen ?? false} lit={false} />

      <header className="relative flex items-baseline justify-between gap-6">
        <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
          Team standings
        </h1>
        <div className="flex items-baseline gap-6">
          {/*
            Live or frozen, IN WORDS — DESIGN.md §7, and the individual board has always said it.
            The team board did not, and it is now the default board on the wall.

            Motion is theatre; this is the message. Under `prefers-reduced-motion` the animated
            cues collapse and words are the only channel left, and a room that cannot tell a
            frozen board from a live one will read a stale ranking as the current one.
          */}
          {standings !== null && (
            <p
              className={standings.frozen ? "text-gold" : "text-paper/70"}
              style={{ fontSize: "var(--text-sm)" }}
            >
              {standings.frozen ? "Board frozen" : "Live"}
            </p>
          )}
          {standings !== null && <Countdown endsAt={standings.endsAt} />}
        </div>
      </header>

      {standings?.frozen === true && (
        <FrozenPlate
          lifting={false}
          liftMs={0}
          asOfLabel={new Date(standings.asOf).toLocaleTimeString()}
        />
      )}

      {message !== null ? (
        <p role="status" className="relative mt-8 text-paper/70" style={{ fontSize: "var(--text-md)" }}>
          {message}
        </p>
      ) : (
        <div className="relative mt-6">
          <TeamStandingsBoard teams={visible} variant="projector" />
        </div>
      )}

      {standings !== null && standings.teams.length > visible.length && (
        <p className="numeric relative mt-4 text-paper/70" style={{ fontSize: "var(--text-xs)" }}>
          Showing top {visible.length} of {standings.teams.length} teams.
        </p>
      )}

      {/* A board that has lost contact says so rather than pretending. It keeps the last rows. */}
      {source === "error" && (
        <p role="status" className="relative mt-2 text-gold" style={{ fontSize: "var(--text-xs)" }}>
          {error ?? "Lost contact with the scoreboard. Retrying."}
        </p>
      )}
    </main>
  );
}
