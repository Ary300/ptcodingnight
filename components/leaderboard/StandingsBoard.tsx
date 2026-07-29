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
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      tabIndex={-1}
      className={styles.board}
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
