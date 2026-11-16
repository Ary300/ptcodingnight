/**
 * The projector's division rotation: which division the wall shows next, and whether it should be
 * moving at all.
 *
 * The night has two divisions and one wall. The board used to open on the first division's tab and
 * stay there, so half the room never saw its own standings unless somebody walked to the laptop.
 * Now the wall cycles through its tabs on its own.
 *
 * Pure, so the rules can be pinned without a browser: the screen owns the timers, this owns the
 * decisions.
 */

/** How long each division stays on the wall. */
export const ROTATE_MS = 20_000;

/**
 * How long a tab chosen by hand holds the wall before rotation resumes.
 *
 * Resuming matters as much as pausing. An organizer who clicks a tab to check one team and walks
 * away would otherwise leave the wall pinned to one division for the rest of the night, which is the
 * bug this rotation exists to fix.
 */
export const RESUME_AFTER_MS = 60_000;

/** Why the wall is not moving right now, or null when it is. */
export type RotationHold = "pinned" | "single" | "chosen" | "breakdown" | null;

export interface RotationFacts {
  /** `?division=` was given: the kiosk URL names one division and the wall stays on it. */
  readonly pinned: boolean;
  /** Tabs on the strip. One tab, or none, is nothing to rotate between. */
  readonly tabCount: number;
  /** The viewer picked a tab within the last `RESUME_AFTER_MS`. */
  readonly chosenRecently: boolean;
  /** A team's breakdown is open. Rotating away would take it off the wall mid-read. */
  readonly breakdownOpen: boolean;
}

/** Whether the wall rotates, and if not, the reason it holds still. */
export function rotationHold(facts: RotationFacts): RotationHold {
  if (facts.pinned) return "pinned";
  if (facts.tabCount < 2) return "single";
  if (facts.chosenRecently) return "chosen";
  if (facts.breakdownOpen) return "breakdown";
  return null;
}

/**
 * The tab after `current`, wrapping from the last back to the first.
 *
 * An id that names no tab (a division removed between polls) restarts at the first tab rather
 * than sticking, so the wall keeps moving.
 */
export function nextTabId(tabIds: readonly string[], current: string | null): string | null {
  if (tabIds.length === 0) return null;
  const at = current === null ? -1 : tabIds.indexOf(current);
  return tabIds[(at + 1) % tabIds.length] ?? null;
}

/**
 * What the wall says about the rotation, in words. Null when there is nothing to say: a pinned
 * kiosk and a single-division contest never rotate, so a sentence about rotating would be untrue.
 */
export function rotationNote(hold: RotationHold): string | null {
  switch (hold) {
    case null:
      return `Divisions rotate every ${String(ROTATE_MS / 1000)} seconds.`;
    case "chosen":
      return "Rotation paused. It resumes in one minute.";
    case "breakdown":
      return "Rotation paused while a breakdown is open.";
    case "pinned":
    case "single":
      return null;
  }
}
