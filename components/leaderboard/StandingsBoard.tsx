"use client";

import type { StandingRow as StandingRowData } from "@/lib/schemas/api";

import type { RevealTimings } from "./constants";
import styles from "./leaderboard.module.css";
import { StandingRow } from "./StandingRow";
import type { RevealPhase } from "./useRevealSequence";

export interface StandingsBoardProps {
  /** The final board for the active division, already capped to the visible rows. */
  rows: readonly StandingRowData[];
  /** Participant ids in frozen-board order, used only until the rows travel. */
  frozenOrder: readonly string[];
  phase: RevealPhase;
  timings: RevealTimings;
  /** Competitors in the division, not just the visible slice — this is what `aria-rowcount` means. */
  totalRows: number;
  /** id referenced by the division tabs' `aria-controls`. */
  panelId: string;
  labelledBy: string;
}

/**
 * The ledger. A `role="table"` of absolutely-positioned rows: the DOM order is always the
 * final standings order, so reading order and `aria-rowindex` stay truthful even while the
 * rows are visually parked at their frozen positions mid-reveal.
 */
export function StandingsBoard({
  rows,
  frozenOrder,
  phase,
  timings,
  totalRows,
  panelId,
  labelledBy,
}: StandingsBoardProps) {
  return (
    /*
      `motion-swap-in` on the panel, and the caller keys this board by its division (see
      ProjectorScreen) so the class runs again every time the tab changes.

      Measured before this: clicking Advanced took the wall from 8 competitor rows to 1 in the
      frame of the click, and the only animation in the whole document was the tab button's own
      colour transition. The rows themselves cannot carry the entrance — they are absolutely
      positioned and already animated by the reveal sequence, and a second transform on the same
      elements would fight it. The panel is the thing that got replaced, so the panel rises.

      Transform-only, which on this board is not a preference: `--muted` is a mix on the paper
      ground and every accent here is measured against it, so an opacity leg would drop the whole
      board under its floor for the length of the animation.
    */
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      tabIndex={-1}
      className={`motion-swap-in ${styles.board}`}
    >
      <div role="table" aria-label="Standings" aria-rowcount={totalRows} className={styles.board}>
        <div role="row" className={styles.columns}>
          <span aria-hidden="true" />
          <span role="columnheader" className={styles.headRank}>
            #
          </span>
          <span role="columnheader">Competitor</span>
          <span role="columnheader" className={styles.headRight}>
            Move
          </span>
          <span role="columnheader" className={styles.headRight}>
            Pen
          </span>
          <span role="columnheader" className={styles.headRight}>
            Score
          </span>
        </div>

        <div role="rowgroup" className={styles.list}>
          {rows.map((row, index) => {
            const frozenIndex = frozenOrder.indexOf(row.participantId);

            return (
              <StandingRow
                key={row.participantId}
                row={row}
                finalIndex={index}
                // A row that was not on the frozen board has nowhere to travel from, so it
                // simply arrives at its final place rather than sliding in from a lie.
                frozenIndex={frozenIndex === -1 ? null : frozenIndex}
                phase={phase}
                timings={timings}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
