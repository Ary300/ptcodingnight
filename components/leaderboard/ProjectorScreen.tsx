"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEventTime } from "@/lib/contest/event-time";

import {
  DIVISION_ROTATE_MS,
  FULL_MOTION_REVEAL,
  REDUCED_MOTION_REVEAL,
  VISIBLE_ROWS,
} from "./constants";
import { Countdown } from "./Countdown";
import { CrestWatermark } from "./CrestWatermark";
import { DivisionTabs } from "./DivisionTabs";
import { FrozenPlate } from "./FrozenPlate";
import styles from "./leaderboard.module.css";
import { StandingsBoard } from "./StandingsBoard";
import { useReducedMotion } from "./useReducedMotion";
import { useRevealSequence, isCrowned, isFrozenLook } from "./useRevealSequence";
import { useStandings } from "./useStandings";

const PANEL_ID = "projector-standings";

function timeOfDay(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "--:--";
  return formatEventTime(new Date(parsed));
}

export interface ProjectorScreenProps {
  /** From `?contest=` — null lets the API pick the running contest. */
  contestId: string | null;
}

/**
 * The projector board. PRD §9.3, docs/DESIGN.md §5 and §6.
 *
 * Two zones on a fixed canvas: standings on the left ~72%, clock and division tabs stacked
 * right. `--ink` ground, `--paper` text, the crest bleeding off the bottom-left corner. No
 * login, no nav, no footer, no scrollbars — everything on screen is a name, a number, or
 * the clock.
 *
 * The whole board sizes off one `--proj-scale` factor (see the module stylesheet), so
 * 1920×1080 degrades to 1280×720 by scaling uniformly rather than relaying out. Nothing
 * wraps differently and nothing scrolls, because school projectors are one resolution or
 * the other and neither one scrolls.
 */
export function ProjectorScreen({ contestId }: ProjectorScreenProps) {
  const { standings, frozenSnapshot, source } = useStandings(contestId);
  const reducedMotion = useReducedMotion();
  const timings = reducedMotion ? REDUCED_MOTION_REVEAL : FULL_MOTION_REVEAL;

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const division =
    standings.divisions.find((entry) => entry.divisionId === selectedId) ??
    standings.divisions[0] ??
    null;

  const rows = useMemo(
    () => (division ? division.rows.slice(0, VISIBLE_ROWS) : []),
    [division],
  );

  /** Where the reveal travels from: the frozen board's order for the division on screen. */
  const frozenOrder = useMemo(() => {
    if (!division || !frozenSnapshot) return [];
    const frozenDivision = frozenSnapshot.divisions.find(
      (entry) => entry.divisionId === division.divisionId,
    );
    return frozenDivision
      ? frozenDivision.rows.slice(0, VISIBLE_ROWS).map((row) => row.participantId)
      : [];
  }, [division, frozenSnapshot]);

  const phase = useRevealSequence(standings.frozen, rows.length, timings);

  // Cycle divisions while the board is unattended, but never during the freeze or the
  // reveal — the room is watching one board then, and it must not slide out from under it.
  const cycling = phase === "live" && standings.divisions.length > 1;

  useEffect(() => {
    if (!cycling) return undefined;

    const timer = window.setInterval(() => {
      setSelectedId((current) => {
        const index = standings.divisions.findIndex((entry) => entry.divisionId === current);
        const next = standings.divisions[(index + 1) % standings.divisions.length];
        return next ? next.divisionId : current;
      });
    }, DIVISION_ROTATE_MS);

    return () => window.clearInterval(timer);
  }, [cycling, standings.divisions]);

  const frozenLook = isFrozenLook(phase);
  const activeTabId = division ? `division-tab-${division.divisionId}` : PANEL_ID;
  const hiddenRows = division ? Math.max(0, division.rows.length - rows.length) : 0;

  return (
    <div className={styles.stage}>
      <CrestWatermark frozen={frozenLook} lit={isCrowned(phase)} />

      <div className={styles.grid}>
        <main className={styles.board}>
          <h1 className={styles.contestName}>Park Tudor Coding Night</h1>

          <div className={styles.plateBand}>
            {frozenLook ? (
              <FrozenPlate
                lifting={phase === "lifting"}
                liftMs={timings.plateLiftMs}
                asOfLabel={timeOfDay(standings.asOf)}
              />
            ) : null}
          </div>

          {division ? (
            <StandingsBoard
              rows={rows}
              frozenOrder={frozenOrder}
              totalRows={division.rows.length}
              phase={phase}
              timings={timings}
              panelId={PANEL_ID}
              labelledBy={activeTabId}
            />
          ) : (
            <p className={styles.contestMeta}>No divisions are running yet.</p>
          )}

          <div className={styles.footnote}>
            <span>
              Top <span className="numeric">{rows.length}</span>
              {hiddenRows > 0 ? (
                <>
                  {" of "}
                  <span className="numeric">{division ? division.rows.length : 0}</span>
                </>
              ) : null}
            </span>
            <span>
              Updated{" "}
              {/*
                `suppressHydrationWarning` because the FALLBACK standings stamp themselves at
                module load (`sample-standings.ts`), and the server bundle loads minutes before
                the browser does — so the first paint legitimately carries two different times and
                React throws a hydration error on the projector before the real board arrives.
                Suppressed on the one element whose text is the timestamp, never on its parent.
              */}
              <span className="numeric" suppressHydrationWarning>
                {timeOfDay(standings.asOf)}
              </span>
            </span>
            {source === "sample" ? (
              <span className={styles.sampleMarker}>SAMPLE DATA</span>
            ) : null}
          </div>
        </main>

        <aside className={styles.aside}>
          <Countdown endsAt={standings.endsAt} />

          <DivisionTabs
            divisions={standings.divisions}
            activeId={division ? division.divisionId : null}
            onSelect={setSelectedId}
            panelId={PANEL_ID}
          />

          <p
            className={`${styles.state} ${frozenLook ? styles.stateFrozen : styles.stateLive}`}
          >
            <span aria-hidden="true" className={styles.stateDot} />
            {frozenLook ? "Board frozen" : "Live"}
          </p>
        </aside>
      </div>
    </div>
  );
}
