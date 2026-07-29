"use client";

import type { CSSProperties } from "react";

import { Delta, Rail, railStateForDelta } from "@/components/ui";
import type { StandingRow as StandingRowData } from "@/lib/schemas/api";

import type { RevealTimings } from "./constants";
import styles from "./leaderboard.module.css";
import { useCountUp } from "./useCountUp";
import { isCrowned, isFrozenLook, isRevealing, type RevealPhase } from "./useRevealSequence";

export interface StandingRowProps {
  row: StandingRowData;
  /** Position on the final board. */
  finalIndex: number;
  /** Position on the frozen board, or null if the row was not on it. */
  frozenIndex: number | null;
  phase: RevealPhase;
  timings: RevealTimings;
}

/**
 * One line of the board.
 *
 * Rank change is carried on three independent channels, and the row is built so that
 * removing any one of them leaves it readable (docs/DESIGN.md §3):
 *
 *   glyph     `<Delta>` — ↑n / ↓n / − in a fixed-width mono column
 *   position  the row physically travels to its new place
 *   colour    the rail tints, third and last
 *
 * `--rise` and `--fall` differ in luminance by 1.04 and are separated almost entirely by
 * hue. Strip the colour and this row still reads correctly — that is the test.
 *
 * Rows are absolutely positioned and moved by `transform`, not reordered in the DOM. That
 * keeps the travel animation on the compositor, keeps reading order stable for assistive
 * technology, and means the stagger is a single CSS custom property rather than a
 * measure-and-animate dance.
 */
export function StandingRow({
  row,
  finalIndex,
  frozenIndex,
  phase,
  timings,
}: StandingRowProps) {
  const holdingFrozenOrder = isFrozenLook(phase);
  const positionIndex = holdingFrozenOrder ? (frozenIndex ?? finalIndex) : finalIndex;

  const crowned = isCrowned(phase);
  const champion = crowned && finalIndex === 0;
  const staggerMs = positionIndex * timings.rowStaggerMs;

  // Rows below the champion make room for the row that grew.
  const championOffset = crowned && positionIndex > 0 ? " + var(--champ-extra)" : "";

  const counting = phase === "deltas";
  const magnitude = useCountUp(
    Math.abs(row.delta),
    counting,
    timings.deltaCountMs,
    staggerMs,
  );

  /**
   * During the reveal the delta column resets to `−` and earns its way back: the movement
   * being counted is frozen-board → final board, and showing it before the rows have
   * travelled would give away the ending.
   */
  const shownDelta = isRevealing(phase)
    ? counting
      ? Math.sign(row.delta) * magnitude
      : 0
    : row.delta;

  const grey = holdingFrozenOrder ? styles.desaturated : "";

  const style = {
    "--row-y": `calc(var(--row-h) * ${positionIndex}${championOffset})`,
    "--row-delay": `${staggerMs}ms`,
    "--row-travel": `${timings.rowTravelMs}ms`,
  } as CSSProperties;

  return (
    <div
      role="row"
      aria-rowindex={finalIndex + 1}
      className={`${styles.row} ${champion ? styles.champion : ""}`}
      style={style}
    >
      <span
        className={`${styles.railSlot} ${counting && row.delta !== 0 ? styles.railFlash : ""}`}
      >
        <Rail state={railStateForDelta(shownDelta)} />
      </span>

      <span role="cell" className={`numeric ${styles.cell} ${styles.rank} ${grey}`}>
        {row.isTied ? <span className={styles.tie}>=</span> : null}
        {row.rank}
      </span>

      <span role="cell" className={`${styles.cell} ${styles.name} ${grey}`}>
        {row.displayName}
      </span>

      <span role="cell" className={`${styles.cell} ${styles.delta} ${grey}`}>
        <Delta value={shownDelta} />
      </span>

      <span role="cell" className={`numeric ${styles.cell} ${styles.penalty} ${grey}`}>
        <span className={styles.visuallyHidden}>penalty </span>+{row.penaltyMinutes}
      </span>

      <span role="cell" className={`numeric ${styles.cell} ${styles.score} ${grey}`}>
        {row.score}
      </span>
    </div>
  );
}
