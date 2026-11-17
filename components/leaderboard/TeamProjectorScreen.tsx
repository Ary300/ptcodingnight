"use client";

import { useEffect, useState } from "react";
import { formatEventTime } from "@/lib/contest/event-time";

import { Countdown } from "./Countdown";
import { CrestWatermark } from "./CrestWatermark";
import {
  nextTabId,
  RESUME_AFTER_MS,
  ROTATE_MS,
  rotationHold,
  rotationNote,
} from "./division-rotation";
import { resolveTabId, teamTabsFor, teamsForTab } from "./team-tabs";
import { FrozenPlate } from "./FrozenPlate";
import styles from "./leaderboard.module.css";
import { rosterBlockRows } from "./projector-rows";
import { TeamDivisionTabs } from "./TeamDivisionTabs";
import { TeamStandingsBoard } from "./TeamStandingsBoard";
import { useReducedMotion } from "./useReducedMotion";
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
 * **Every team, scrolling.** The wall used to ration a measured row budget: it drew the top seven,
 * printed "Showing top 7 of 15 teams", and every open breakdown cost two more teams off the
 * bottom. The organizers asked for no cap, so the board now draws every team on the division's tab
 * and the board region scrolls under a sticky header row. An open breakdown takes its height in
 * normal flow and pushes the teams below it down, and it draws every member, so a team of five
 * shows five players. Expand all and Collapse all sit above the table.
 *
 * No login and no app chrome (PRD §9.3). A dropped poll keeps the previous rows rather than
 * blanking; the room cannot tell a five-second-stale board from a live one, and can very much tell
 * an empty one.
 */

export interface TeamProjectorScreenProps {
  /**
   * From `?contest=` / `?contestId=`. **Null is a request, not a missing value**: it means the
   * contest that is running, which is the only thing a screen on a wall can mean.
   */
  contestId: string | null;
  /**
   * From `?division=`, so a kiosk URL can be bookmarked per division, and a URL that names one
   * PINS the wall to it: no rotation. Null or absent opens on the FIRST division's tab and then
   * rotates through every division (see `division-rotation.ts`); an id that names no division in
   * this contest falls back to that first tab rather than to an empty wall. A contest with no
   * divisions has no tabs at all.
   */
  initialDivisionId?: string | null;
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
}: TeamProjectorScreenProps) {
  // Always the public board, even on the organizer laptop that usually drives the wall.
  const { standings, source, error } = useTeamStandings(contestId, { publicView: true });

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

  /**
   * When the viewer last picked a tab by hand, or null. A hand-picked tab holds the wall for
   * `RESUME_AFTER_MS` and then rotation picks up again, so a laptop click cannot strand the room
   * on one division for the rest of the night.
   */
  const [chosenAt, setChosenAt] = useState<number | null>(null);
  const reducedMotion = useReducedMotion();

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
      ? source === "idle"
        ? // Plain words for the wall, and the way to point it at a contest from the laptop.
          "No contest is running right now. This board shows a contest as soon as one opens, or open the projector from a contest's Setup tab to show that one."
        : source === "error"
        ? (error ?? "Cannot reach the scoreboard.")
        : "Loading standings…"
      : activeTabId !== null && teams.length === 0
        ? "No teams in this division yet."
        : null;

  const frozen = standings?.frozen === true;

  /*
    THE ROTATION. Two divisions, one wall: without this the projector sat on the first tab all
    night. Reduced motion changes how a switch LOOKS (no wipe, no progress bar), never whether it
    happens, because the division a viewer cannot see is information, not decoration.
  */
  const hold = rotationHold({
    pinned: initialDivisionId !== null,
    tabCount: tabs.length,
    chosenRecently: chosenAt !== null,
    breakdownOpen: openTeamIds.size > 0,
  });
  const note = rotationNote(hold);
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  /* A string, so a poll that returns the same divisions does not restart the 20 seconds. */
  const tabIdsKey = tabs.map((tab) => tab.id).join("\n");

  useEffect(() => {
    if (hold !== null) return undefined;
    const timer = window.setTimeout(() => {
      setRequestedTabId(nextTabId(tabIdsKey.split("\n"), activeTabId));
    }, ROTATE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [hold, tabIdsKey, activeTabId]);

  useEffect(() => {
    if (chosenAt === null) return undefined;
    const timer = window.setTimeout(() => setChosenAt(null), RESUME_AFTER_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [chosenAt]);

  /*
    Which teams are open. Looked up by id on every poll rather than remembered as positions,
    because the board reorders under an open strip; ids that vanished from the payload drop out.
    Every team is drawn: the board region scrolls, so there is no row budget to spend.
  */
  const validOpenTeamIds = new Set(
    teams.flatMap((team) => (openTeamIds.has(team.teamId) ? [team.teamId] : [])),
  );
  const blockRows = rosterBlockRows(teams.map((team) => team.players.length));

  /*
    Live or frozen, IN WORDS — DESIGN.md §7, and the individual board has always said it. The team
    board did not, and it is the default board on the wall.

    Motion is theatre; this is the message. Under `prefers-reduced-motion` the animated cues
    collapse and words are the only channel left, and a room that cannot tell a frozen board from a
    live one will read a stale ranking as the current one.
  */
  const subtitle =
    standings === null
      ? source === "idle"
        ? "Waiting for a contest to open"
        : "Waiting for the scoreboard"
      : frozen
        ? // Short, because the plate directly below it carries the instant and the "judging
          // continues" part. Saying both twice reads as a stutter from ten metres away.
          "Frozen standings"
        : // Past the end and not frozen is the revealed board. "Live standings" beside a clock
          // reading 00:00:00 told the room the reveal was still to come.
          Date.parse(standings.asOf) >= Date.parse(standings.endsAt) && !standings.isPractice
          ? "Final standings"
          : `Live standings, updated ${timeOfDay(standings.asOf)}`;

  return (
    /*
      Paper ground, ink text, one fixed canvas — DESIGN.md §5, "the projector is monumental", and
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
          <div className={styles.teamHeadLeft}>
            {/*
              The rotation is stated in words in the otherwise empty left track, so it costs the
              rows nothing in height. The bar under it fills over the 20 seconds a division holds
              the wall; it is a second channel, and under reduced motion it is simply absent.
            */}
            {note !== null && (
              <div className={styles.rotation}>
                <p className={styles.rotationNote}>{note}</p>
                {hold === null && !reducedMotion && (
                  <span aria-hidden="true" className={styles.rotationTrack}>
                    <span
                      key={activeTabId}
                      className={styles.rotationFill}
                      style={{ animationDuration: `${String(ROTATE_MS)}ms` }}
                    />
                  </span>
                )}
              </div>
            )}
          </div>

          <div>
            <h1 className={styles.teamTitle}>
              Park Tudor Coding Night{" "}
              {/* The division on the wall, in the heading itself: the one line everyone reads. */}
              <span className={styles.teamTitleSub} data-projector-division>
                {activeTab === undefined ? "Team standings" : `${activeTab.label} team standings`}
              </span>
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
                onSelect={(tabId) => {
                  setRequestedTabId(tabId);
                  setChosenAt(Date.now());
                }}
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
                <Countdown endsAt={standings.endsAt} startsAt={standings.startsAt} />
              ))}
          </div>
        </header>

        <div className={styles.teamPlateBand}>
          {frozen && standings !== null && (
            <FrozenPlate lifting={false} liftMs={0} asOfLabel={timeOfDay(standings.asOf)} />
          )}
        </div>

        {/* Keyed per division so each switch replays the wipe; reduced motion removes the wipe. */}
        <div
          key={activeTabId ?? "all-teams"}
          id={TEAM_PANEL_ID}
          className={`${styles.teamBoard} ${styles.teamBoardSwap}`}
        >
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
              teams={teams}
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
              onSetOpenTeams={setOpenTeamIds}
            />
          )}
        </div>

        <div className={styles.teamFootnote}>
          {standings !== null && teams.length > 0 && (
            /*
              The whole field is on the board; this only counts it, and on a division tab the
              count is that division's. Scrolling the board reaches every team.
            */
            <span>
              <span className="numeric">{teams.length}</span>{" "}
              {teams.length === 1 ? "team" : "teams"}
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
