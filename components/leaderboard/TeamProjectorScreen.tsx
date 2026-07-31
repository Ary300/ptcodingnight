"use client";

import { TEAM_VISIBLE_ROWS } from "./constants";
import { Countdown } from "./Countdown";
import { CrestWatermark } from "./CrestWatermark";
import { FrozenPlate } from "./FrozenPlate";
import styles from "./leaderboard.module.css";
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
  const visible = standings === null ? [] : standings.teams.slice(0, maxRows);

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
        ? // Short, because the gold plate directly below it carries the instant and the "judging
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
          <div className={styles.teamHeadLeft}>
            {standings !== null && (
              <p className={`${styles.state} ${frozen ? styles.stateFrozen : styles.stateLive}`}>
                <span aria-hidden="true" className={styles.stateDot} />
                {frozen ? "Board frozen" : "Live"}
              </p>
            )}
          </div>

          <div>
            <h1 className={styles.teamTitle}>
              Park Tudor Coding Night{" "}
              <span className={styles.teamTitleSub}>Team standings</span>
            </h1>
            <p className={styles.teamSubtitle}>{subtitle}</p>
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
            <TeamStandingsBoard teams={visible} variant="projector" />
          )}
        </div>

        <div className={styles.teamFootnote}>
          {standings !== null && standings.teams.length > visible.length && (
            <span>
              Showing top <span className="numeric">{visible.length}</span> of{" "}
              <span className="numeric">{standings.teams.length}</span> teams
            </span>
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
