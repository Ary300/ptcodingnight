"use client";

import { useEffect, useState } from "react";

import { TEAM_EXPANDED_ROW_COST, TEAM_VISIBLE_ROWS } from "./constants";
import { Countdown } from "./Countdown";
import { CrestWatermark } from "./CrestWatermark";
import { FrozenPlate } from "./FrozenPlate";
import styles from "./leaderboard.module.css";
import { drawnTeamRows } from "./projector-rows";
import { TeamStandingsBoard } from "./TeamStandingsBoard";
import { useTeamStandings } from "./useTeamStandings";

/**
 * `/projector` in team mode — the board on the wall, and the default one (PRD §6.1).
 *
 * Codeforces' arrangement: the contest's name centred at the top, what the board is under it, and
 * the standings grid centred beneath both. The clock and the live/frozen state sit in the outer
 * tracks of the same header row, so the title stays centred on the canvas rather than on whatever
 * space they left.
 *
 * ## The breakdown, and what it costs
 *
 * This screen used to say, in this comment, that the per-player breakdown was deliberately not
 * here. The organizer disagreed, in as many words: "there is no drop down menu in that to show what
 * every individual is contributing to the score there". The old reasoning was half right — twelve
 * players' subtotals as a *column*, at projector size, is not legible — so the breakdown is here
 * now as a wrapping LINE (`TeamRosterStrip`), one team at a time, and the screen pays for it in
 * rows.
 *
 * **One team at a time, not a mode toggle, and not free.** The three options were: expand every
 * team (impossible, the board is already full at seven rows), a separate "breakdown mode" screen
 * that replaces the standings (the room loses the ranking it is watching, at the exact moment the
 * organizer wants to talk about one team's place in it), or one open row inline. The last keeps the
 * Codeforces shape: the ranking never leaves the wall, and the strip appears directly under the row
 * it explains, so the addends sit under the arithmetic that consumes them.
 *
 * The price is stated rather than hidden. A projector does not scroll, so the open strip is paid
 * for out of `TEAM_VISIBLE_ROWS` (see `TEAM_EXPANDED_ROW_COST`), the footnote says how many teams
 * are drawn and out of how many, and the open team is drawn even when it ranks below the cut. The
 * failure being designed against is specific and has happened here: a change that silently clipped
 * five rows under a footnote that claimed to show ten.
 *
 * No login, no chrome, no scrollbars (PRD §9.3). A dropped poll keeps the previous rows rather than
 * blanking — the room cannot tell a five-second-stale board from a live one, and can very much tell
 * an empty one.
 */

export interface TeamProjectorScreenProps {
  /**
   * From `?contest=` / `?contestId=`. **Null is a request, not a missing value**: it means the
   * contest that is running, which is the only thing a screen on a wall can mean.
   */
  contestId: string | null;
  /** Rows beyond this are not drawn; the footnote still counts them. */
  maxRows?: number;
}

function timeOfDay(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "--:--";
  return new Date(parsed).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function TeamProjectorScreen({
  contestId,
  maxRows = TEAM_VISIBLE_ROWS,
}: TeamProjectorScreenProps) {
  const { standings, source, error } = useTeamStandings(contestId);

  /**
   * The one open team, held HERE rather than in the board.
   *
   * The board draws whatever rows it is given; this screen is what decides how many rows there is
   * room for. Those two facts have to be decided together, so they live in one place.
   */
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);

  // Escape closes, because the organizer opening this is at a laptop and the board is behind them.
  // Bound to the window rather than to the row: once the strip is open, the focused element may be
  // anything, and a projector is not a screen anyone wants to hunt for a close button on.
  useEffect(() => {
    if (openTeamId === null) return undefined;

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpenTeamId(null);
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [openTeamId]);

  // The HEADER RENDERS IN EVERY STATE, including "still loading" and "the API said no".
  //
  // The first version early-returned a bare sentence for those cases, which meant the wall showed
  // an untitled page whenever anything was wrong — and a screen with no title is indistinguishable
  // from a broken deployment to everyone in the room. A titled screen saying why it is empty is a
  // different thing entirely.
  //
  // There is no longer a "no contest pinned" case. That branch used to tell the room to go and
  // edit the URL; a bare `/projector` now asks the API for the running contest, like the
  // individual board always has.
  const message =
    standings === null
      ? source === "error"
        ? (error ?? "Cannot reach the scoreboard.")
        : "Loading standings…"
      : null;

  const frozen = standings?.frozen === true;

  /*
    How many rows fit, and which ones.

    `openIndex` is looked up by id on every poll rather than remembered as a position, because the
    board reorders under the strip: a team that was rank 5 when it was opened can be rank 3 four
    seconds later, and a remembered index would then have the wrong team's roster open under the
    wrong row. A team that has vanished from the payload resolves to null, which is closed.
  */
  const teams = standings === null ? [] : standings.teams;
  const found = openTeamId === null ? -1 : teams.findIndex((t) => t.teamId === openTeamId);
  const openIndex = found === -1 ? null : found;

  const cap =
    openIndex === null ? maxRows : Math.max(1, maxRows - TEAM_EXPANDED_ROW_COST);
  const { indices, jumped } = drawnTeamRows(teams.length, cap, openIndex);
  const visible = indices.flatMap((at) => {
    const team = teams[at];
    return team === undefined ? [] : [team];
  });

  /** What the footnote may honestly claim as "the top N". A pulled-up row is not part of it. */
  const topCount = jumped ? visible.length - 1 : visible.length;
  const openRank = openIndex === null ? null : (teams[openIndex]?.rank ?? null);

  /*
    Live or frozen, IN WORDS — DESIGN.md §7, and the individual board has always said it. The team
    board did not, and it is the default board on the wall.

    Motion is theatre; this is the message. Under `prefers-reduced-motion` the animated cues
    collapse and words are the only channel left, and a room that cannot tell a frozen board from a
    live one will read a stale ranking as the current one.
  */
  const subtitle =
    standings === null
      ? "Waiting for the scoreboard"
      : frozen
        ? // Short, because the plate directly below it carries the instant and the "judging
          // continues" part. Saying both twice reads as a stutter from ten metres away.
          "Frozen standings"
        : `Live standings · updated ${timeOfDay(standings.asOf)}`;

  return (
    /*
      Ink ground, paper text, one fixed canvas — DESIGN.md §5, "the projector is monumental", and
      the same `.stage` the individual board stands on.

      This shipped as a `bg-paper` Tailwind page, which is the COMPETITOR surface: a phone read at
      30 cm in a lit room. On the wall that is a near-white 1920×1080 rectangle in a darkened room,
      which is glare rather than contrast, and it put every muted value on the wrong side of the
      floors in §7 — those are stated per ground, so a surface with the ground inverted has them all
      measured against the wrong background. It also meant the board sized itself off the app scale
      and never took part in the 1920→1280 degrade.
    */
    <div className={styles.stage}>
      {/* The team board has no reveal sequence, so the crest never reaches its "lit" state here.
          The dramatic unfreeze belongs to the individual board's ProjectorScreen; adding a second
          copy of that machinery for teams would be two implementations of one moment. */}
      <CrestWatermark frozen={frozen} lit={false} />

      <main className={styles.teamStage}>
        <header className={styles.teamHead}>
          {/*
            THE CORNER PILL IS GONE. "get rid of the little live symbol in the top left it looks
            ugly" — it was a coloured dot and a word in the corner of a screen whose whole job is
            to be read from ten metres, and a dot is the least legible thing on it at that range.

            The STATE is not gone, and must never be: a frozen board that does not say so is a
            stale ranking the room will read as the current one. It moves into the subtitle, one
            line under the title, which is where the eye already is on the way into the `#` column
            — and it is words, not a glyph, so it survives greyscale, colour-vision deficiency and
            `prefers-reduced-motion` alike (DESIGN.md §3).

            The track itself stays. `.teamHead` is `1fr auto 1fr` so that the title is centred on
            the CANVAS rather than on whatever the clock left over; removing the element would
            centre it on the wrong thing.
          */}
          <div className={styles.teamHeadLeft} />

          <div>
            <h1 className={styles.teamTitle}>
              Park Tudor Coding Night{" "}
              <span className={styles.teamTitleSub}>Team standings</span>
            </h1>
            <p
              className={`${styles.teamSubtitle} ${frozen ? styles.teamSubtitleFrozen : ""}`}
            >
              {subtitle}
            </p>
          </div>

          <div className={styles.teamHeadRight}>
            {standings !== null && <Countdown endsAt={standings.endsAt} />}
          </div>
        </header>

        <div className={styles.teamPlateBand}>
          {frozen && standings !== null && (
            <FrozenPlate lifting={false} liftMs={0} asOfLabel={timeOfDay(standings.asOf)} />
          )}
        </div>

        <div className={styles.teamBoard}>
          {message !== null ? (
            /*
              Exactly ONE `role="status"` is on screen at a time. The empty state and the
              lost-contact footnote are both live regions, and both rendering at once gives a
              screen reader two announcements for one situation — and any assertion about "the
              status" two things to match.
            */
            <p role="status" className={`${styles.teamMessage} ${styles.contestMeta}`}>
              {message}
            </p>
          ) : (
            <TeamStandingsBoard
              teams={visible}
              variant="projector"
              openTeamId={openTeamId}
              onToggleTeam={(teamId) => {
                // One at a time. Two open strips is four rows off a seven-row board, and a room
                // reading two breakdowns at once is reading neither.
                setOpenTeamId((current) => (current === teamId ? null : teamId));
              }}
            />
          )}
        </div>

        <div className={styles.teamFootnote}>
          {standings !== null && standings.teams.length > topCount && (
            /*
              The DRAWN count, which is not always the top of the table: an open team below the cut
              is pulled up and drawn out of sequence, and the ranks then jump (1 2 3 4, then 7). The
              jump is legible in the rank column on its own, and it is said here in words as well,
              because a numeral that skips is a fact the board should state rather than leave to be
              noticed.
            */
            <span>
              Showing top <span className="numeric">{topCount}</span> of{" "}
              <span className="numeric">{standings.teams.length}</span> teams
              {jumped && openRank !== null && (
                <>
                  , plus rank <span className="numeric">{openRank}</span>
                </>
              )}
            </span>
          )}

          {/*
            Why the count just dropped. A board that shows five of nine seconds after showing seven
            of nine, with nothing to explain it, reads as teams having disappeared.

            Only when the budget actually cost somebody their row: on a four-team contest the whole
            field fits with a strip open, and announcing a squeeze that did not happen is its own
            small lie.
          */}
          {openIndex !== null && teams.length > cap && (
            <span>A breakdown is open, so fewer teams fit.</span>
          )}

          {/* A board that has lost contact says so rather than pretending. It keeps the last
              rows it had — stale and honest beats blank. */}
          {source === "error" && standings !== null && (
            <span role="status" className={styles.teamAlert}>
              {error ?? "Lost contact with the scoreboard. Retrying."}
            </span>
          )}
        </div>
      </main>
    </div>
  );
}
