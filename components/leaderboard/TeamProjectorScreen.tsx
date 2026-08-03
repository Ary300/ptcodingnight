"use client";

import { useEffect, useState } from "react";
import { formatEventTime } from "@/lib/contest/event-time";

import { TEAM_EXPANDED_ROW_COST, TEAM_VISIBLE_ROWS } from "./constants";
import { Countdown } from "./Countdown";
import { CrestWatermark } from "./CrestWatermark";
import { resolveTabId, teamTabsFor, teamsForTab } from "./team-tabs";
import { FrozenPlate } from "./FrozenPlate";
import styles from "./leaderboard.module.css";
import { drawnTeamRows, memberBlockBudget } from "./projector-rows";
import { TeamDivisionTabs } from "./TeamDivisionTabs";
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
 * every individual is contributing to the score there". So the breakdown is here, and the screen
 * pays for every open team in rows.
 *
 * It was first built as a wrapped LINE of chips, on the grounds that a column of subtotals would
 * not be legible at projector size. The organizer looked at that and asked for the column after
 * all, precisely: "you should have a smaller version of that for each team member, where in a box
 * the team member's name is there and then to the right there is the scores and it goes down, but
 * the boxes are smaller to show it's individual". `TeamRosterStrip` now returns rows OF THIS TABLE
 * rather than a block inside one cell, which is what makes a member's points sit under the same
 * column heading as the team's, and there is exactly one set of columns so nothing can drift.
 *
 * **Independent, inline, and not free.** Every team row controls its own roster. Opening another
 * team does not close the first, because comparing two rosters is a normal use of a standings
 * board and disclosure state should not behave like navigation. The ranking stays on the wall and
 * every strip sits directly under the row it explains, so its addends remain aligned with the
 * arithmetic that consumes them.
 *
 * The price is stated rather than hidden. Each strip is paid for out of `TEAM_VISIBLE_ROWS` (see
 * `TEAM_EXPANDED_ROW_COST`), the footnote says how many teams are drawn and out of how many, and
 * every open team stays drawn even when it ranks below the cut. The
 * failure being designed against is specific and has happened here: a change that silently clipped
 * five rows under a footnote that claimed to show ten.
 *
 * No login and no app chrome (PRD §9.3). A dropped poll keeps the previous rows rather than
 * blanking — the room cannot tell a five-second-stale board from a live one, and can very much tell
 * an empty one. Vertical scrolling appears only if the organizer opens more roster rows than the
 * measured canvas can hold; clipping an explicitly open section would be worse.
 */

export interface TeamProjectorScreenProps {
  /**
   * From `?contest=` / `?contestId=`. **Null is a request, not a missing value**: it means the
   * contest that is running, which is the only thing a screen on a wall can mean.
   */
  contestId: string | null;
  /**
   * From `?division=`, so a kiosk URL can be bookmarked per division. Null or absent opens on
   * the FIRST division's tab; an id that names no division in this contest falls back to that
   * default rather than to an empty wall. A contest with no divisions has no tabs at all.
   */
  initialDivisionId?: string | null;
  /** Rows beyond this are not drawn; the footnote still counts them. */
  maxRows?: number;
}

function timeOfDay(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "--:--";
  return formatEventTime(new Date(parsed));
}

/** The tab strip's `aria-controls` target: the region the standings render into. */
const TEAM_PANEL_ID = "team-standings-panel";

export function TeamProjectorScreen({
  contestId,
  initialDivisionId = null,
  maxRows = TEAM_VISIBLE_ROWS,
}: TeamProjectorScreenProps) {
  const { standings, source, error } = useTeamStandings(contestId);

  /**
   * The tab the organizer ASKED for, which is not always the tab shown: the request is held
   * verbatim and resolved against whatever divisions the current payload carries, so a
   * `?division=` for a contest that has none, or an id deleted mid-night, degrades to the
   * first division's tab instead of pinning an empty wall.
   */
  const [requestedTabId, setRequestedTabId] =
    useState<string | null>(initialDivisionId);

  /**
   * The open teams, held HERE rather than in the board.
   *
   * The board draws whatever rows it is given; this screen is what decides how many rows there is
   * room for. Those two facts have to be decided together, so they live in one place.
   */
  const [openTeamIds, setOpenTeamIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  // Escape closes, because the organizer opening this is at a laptop and the board is behind them.
  // Bound to the window rather than to the row: once the strip is open, the focused element may be
  // anything, and a projector is not a screen anyone wants to hunt for a close button on.
  useEffect(() => {
    if (openTeamIds.size === 0) return undefined;

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpenTeamIds(new Set());
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [openTeamIds.size]);

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
  /*
    ONLY division tabs, no merged view: each division fields its own teams against its own
    question sets, so an all-divisions ranking would compare teams that never faced the same
    questions. Teams without a division get their own final Unassigned tab, present only while
    such teams exist. A contest with no divisions has no strip and the original single board.
  */
  const tabs =
    standings === null ? [] : teamTabsFor(standings.divisions, standings.teams);
  const activeTabId = resolveTabId(tabs, requestedTabId);
  /* Filtered and re-ranked BEFORE the row budget below: the wall pays for what it draws. */
  const teams =
    standings === null ? [] : teamsForTab(standings.teams, activeTabId);

  const message =
    standings === null
      ? source === "error"
        ? (error ?? "Cannot reach the scoreboard.")
        : "Loading standings…"
      : activeTabId !== null && teams.length === 0
        ? "No teams in this division yet."
        : null;

  const frozen = standings?.frozen === true;

  /*
    How many rows fit, and which ones.

    Open indices are looked up by id on every poll rather than remembered as positions, because the
    board reorders under an open strip. A team that was rank 5 can be rank 3 four seconds later, and
    a remembered index would then put the wrong roster under the wrong row. IDs that vanished from
    the payload are ignored rather than reassigned to their old positions.
  */
  const openIndices = teams.flatMap((team, index) =>
    openTeamIds.has(team.teamId) ? [index] : [],
  );
  const validOpenTeamIds = new Set(
    openIndices.flatMap((index) => {
      const team = teams[index];
      return team === undefined ? [] : [team.teamId];
    }),
  );

  /*
   * Every roster costs two collapsed team rows. The minimum preserves the stronger promise that
   * an open control always has its content on screen.
   */
  const cap = Math.max(
    openIndices.length,
    maxRows - openIndices.length * TEAM_EXPANDED_ROW_COST,
  );
  const { indices, jumped } = drawnTeamRows(teams.length, cap, openIndices);

  /*
   * Past the point where two-row costs balance (three open on a seven-row wall), the strips
   * themselves shrink to share the leftover height, so the wall still does not scroll — measured
   * 894px of table against a 794px canvas at 1920×1080 before this arithmetic existed. The
   * remainder row inside each strip keeps a shorter block reconciling with its team row.
   * Vertical scroll survives only as the last resort for states this cannot satisfy (five or
   * more open blocks at their two-row floor), which clicking cannot reach on this geometry.
   */
  const blockRows = memberBlockBudget(maxRows, indices.length, openIndices.length);
  const visible = indices.flatMap((at) => {
    const team = teams[at];
    return team === undefined ? [] : [team];
  });

  /** What the footnote may honestly call "the top N" before the first pulled-up rank. */
  let topCount = 0;
  while (indices[topCount] === topCount) topCount += 1;
  const pulledOpenRanks = openIndices.flatMap((index) => {
    if (index < topCount) return [];
    const team = teams[index];
    return team === undefined ? [] : [team.rank];
  });

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
            {/*
              INSIDE the header's centre track, never a new `.teamStage` child. The stage's grid
              template is `auto auto minmax(0, 1fr) auto`, so an extra child between the header
              and the plate band takes the plate band's `auto` row and shoves the table into the
              `1fr` row's leftovers - the organizer screenshotted exactly that: the whole grid at
              the bottom of the wall under a giant gap.
            */}
            {tabs.length > 0 && (
              <TeamDivisionTabs
                tabs={tabs}
                activeTabId={activeTabId}
                onSelect={setRequestedTabId}
                panelId={TEAM_PANEL_ID}
              />
            )}
          </div>

          <div className={styles.teamHeadRight}>
            {/*
              No countdown in the practice arena. Its window ends in 2100, so the clock read
              "643527:44:47" on the wall, which is a broken-looking timer rather than a contest
              with no deadline. The word says what the screen is instead.
            */}
            {standings !== null &&
              (standings.isPractice ? (
                <span className={styles.teamSubtitle}>Practice</span>
              ) : (
                <Countdown endsAt={standings.endsAt} />
              ))}
          </div>
        </header>

        <div className={styles.teamPlateBand}>
          {frozen && standings !== null && (
            <FrozenPlate lifting={false} liftMs={0} asOfLabel={timeOfDay(standings.asOf)} />
          )}
        </div>

        <div id={TEAM_PANEL_ID} className={styles.teamBoard}>
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
              /*
                Remounted per tab. The board's FLIP hook slides a team from its previous row to
                its new one, and a tab switch gives every surviving team a new row for a reason
                that is not an overtake; a fresh mount has no previous positions and animates
                nothing. Poll updates keep the key, so real overtakes still slide.
              */
              key={activeTabId ?? "all-teams"}
              teams={visible}
              setLabels={standings?.setLabels ?? []}
              sets={standings?.sets ?? []}
              projectorTabId={activeTabId}
              groupPointsInsideMean={standings?.groupPointsInsideMean ?? true}
              sideActivitiesFlat={standings?.sideActivitiesFlat ?? true}
              variant="projector"
              memberBlockRows={blockRows}
              openTeamIds={validOpenTeamIds}
              onToggleTeam={(teamId) => {
                setOpenTeamIds((current) => {
                  const next = new Set(current);
                  if (next.has(teamId)) next.delete(teamId);
                  else next.add(teamId);
                  return next;
                });
              }}
            />
          )}
        </div>

        <div className={styles.teamFootnote}>
          {standings !== null && teams.length > topCount && (
            /*
              The DRAWN count, which is not always the top of the table: an open team below the cut
              is pulled up and drawn out of sequence, and the ranks then jump (1 2 3 4, then 7). The
              jump is legible in the rank column on its own, and it is said here in words as well,
              because a numeral that skips is a fact the board should state rather than leave to be
              noticed.
            */
            <span>
              {/* Counts THIS VIEW: on a division tab, "of N" is that division's field. */}
              Showing top <span className="numeric">{topCount}</span> of{" "}
              <span className="numeric">{teams.length}</span> teams
              {jumped && pulledOpenRanks.length > 0 && (
                <>
                  , plus {pulledOpenRanks.length === 1 ? "rank" : "ranks"}{" "}
                  <span className="numeric">{pulledOpenRanks.join(", ")}</span>
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
          {openIndices.length > 0 && teams.length > cap && (
            <span>
              {openIndices.length === 1
                ? "A breakdown is open, so fewer teams fit."
                : `${String(openIndices.length)} breakdowns are open, so fewer teams fit.`}
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
