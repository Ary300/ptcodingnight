"use client";

import styles from "./leaderboard.module.css";
import type { TeamTab } from "./team-tabs";

export interface TeamDivisionTabsProps {
  /** From `teamTabsFor`: one tab per division, plus Unassigned while any team has none. */
  tabs: readonly TeamTab[];
  activeTabId: string | null;
  onSelect: (tabId: string) => void;
  /** id of the standings region these tabs control. */
  panelId: string;
}

/**
 * The TEAM board's division strip: one tab per division, centred under the board's subtitle.
 *
 * There is deliberately NO merged "Teams" tab. Each division fields its own teams against its
 * own question sets, so an all-divisions ranking would compare teams that never faced the same
 * questions - the organizer's correction removed it in as many words. A contest with no
 * divisions never renders this strip at all.
 *
 * These are tabs over one table, not navigation - a previous pass made the division entries
 * LINKS to the individual board, and the organizer's mock has no such thing. The pattern
 * (real buttons in a `tablist`, roving tabindex, arrow keys wrapping) is `DivisionTabs.tsx`,
 * which remains the individual board's own strip.
 */
export function TeamDivisionTabs({
  tabs,
  activeTabId,
  onSelect,
  panelId,
}: TeamDivisionTabsProps) {
  if (tabs.length === 0) return null;

  /* Roving tabindex needs exactly one stop. If the active id names no tab (a transient poll
     where a division vanished), the first tab keeps the strip reachable by keyboard. */
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTabId));

  const move = (from: number, step: number): void => {
    const next = tabs[(from + step + tabs.length) % tabs.length];
    if (next !== undefined) onSelect(next.id);
  };

  return (
    <div className={styles.divisionStrip} role="tablist" aria-label="Division standings">
      {tabs.map((tab, index) => {
        const selected = index === activeIndex;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`team-division-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            className={`${styles.divisionStripTab} ${selected ? styles.divisionStripTabActive : ""}`}
            onClick={() => onSelect(tab.id)}
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
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
