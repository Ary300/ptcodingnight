"use client";

import styles from "./leaderboard.module.css";

export interface DivisionTabsProps {
  divisions: ReadonlyArray<{ divisionId: string; name: string; rows: ReadonlyArray<unknown> }>;
  activeId: string | null;
  onSelect: (divisionId: string) => void;
  /** id of the standings region these tabs control. */
  panelId: string;
}

/**
 * Division tabs (PRD §9.3). Divisions rank independently — there is an Intermediate winner
 * and an Advanced winner — so the board never merges them into one list.
 *
 * The projector has no login and no nav, but these are still real buttons in a real
 * `tablist`: an organiser standing at the machine needs to pin a division during the
 * reveal, and G9 does not exempt a screen for being unattended. Arrow keys move between
 * tabs, focus is visible (`app/globals.css` never sets `outline: none`).
 */
export function DivisionTabs({ divisions, activeId, onSelect, panelId }: DivisionTabsProps) {
  const move = (from: number, step: number) => {
    const next = divisions[(from + step + divisions.length) % divisions.length];
    if (next) onSelect(next.divisionId);
  };

  return (
    <div className={styles.tabs} role="tablist" aria-label="Divisions">
      {divisions.map((division, index) => {
        const selected = division.divisionId === activeId;

        return (
          <button
            key={division.divisionId}
            type="button"
            role="tab"
            id={`division-tab-${division.divisionId}`}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            className={`${styles.tab} ${selected ? styles.tabActive : ""}`}
            onClick={() => onSelect(division.divisionId)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                event.preventDefault();
                move(index, 1);
              } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                event.preventDefault();
                move(index, -1);
              }
            }}
          >
            {division.name}
            <span className={`numeric ${styles.tabCount}`}>{division.rows.length}</span>
          </button>
        );
      })}
    </div>
  );
}
