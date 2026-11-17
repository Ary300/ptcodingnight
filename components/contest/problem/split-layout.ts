/**
 * The rules of the problem page's two layouts, as pure functions.
 *
 * "Stacked" is the page as it has always been: statement across the measure, editor below.
 * "Side by side" is HackerRank's test editor: under the site's top bar the workspace takes the
 * whole window, the statement in a pane on the left and the editor in a pane on the right, with
 * a full-height divider between them. Everything here is free of `window` so it is a unit test;
 * the parts that touch storage and media queries live in `split-preference.ts`.
 */

export type ProblemLayout = "stacked" | "side";

/** Below this width the page is always stacked and no toggle is offered. Tailwind's `lg`. */
export const SIDE_BY_SIDE_MIN_WIDTH_PX = 1024;

/** The left pane's share of the split, in percent. Each pane keeps at least a quarter. */
export const SPLIT_MIN = 25;
export const SPLIT_MAX = 75;
/** HackerRank's proportion: the statement a little narrower than the editor. */
export const SPLIT_DEFAULT = 40;
/** How far one arrow press moves the divider. */
export const SPLIT_STEP = 5;

/** A remembered choice, or `null` when the student has never chosen (or storage holds junk). */
export function parseLayout(raw: string | null): ProblemLayout | null {
  return raw === "side" || raw === "stacked" ? raw : null;
}

export interface LayoutFacts {
  /** What the student chose, if they ever did. */
  readonly choice: ProblemLayout | null;
  /** The window is at least `SIDE_BY_SIDE_MIN_WIDTH_PX` wide. */
  readonly wide: boolean;
}

/**
 * The layout the page shows. Too narrow wins over everything, then the student's own choice,
 * then stacked.
 *
 * Stacked is the default on every width, at the organizers' request: the statement reads first
 * and the editor sits under it, and side by side is one click away on the toggle. The stored
 * choice is still honoured, because the only thing that ever writes it is a click on that toggle
 * (`rememberLayout`, called from `LayoutToggle`'s onChange and nowhere else), so a stored "side"
 * is a student's own choice and never an old default that was saved for them.
 */
export function resolveLayout({ choice, wide }: LayoutFacts): ProblemLayout {
  if (!wide) return "stacked";
  return choice ?? "stacked";
}

/** Whole percent, inside the bounds. A non-finite value is the default rather than an edge. */
export function clampSplit(value: number): number {
  if (!Number.isFinite(value)) return SPLIT_DEFAULT;
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(value)));
}

/** A stored ratio, or the default when nothing usable is stored. */
export function parseSplit(raw: string | null): number {
  if (raw === null || raw.trim() === "") return SPLIT_DEFAULT;
  return clampSplit(Number(raw));
}

/** Where a pointer at `clientX` puts the divider, for a split box starting at `left`. */
export function splitFromPointer(clientX: number, left: number, width: number): number {
  if (!(width > 0)) return SPLIT_DEFAULT;
  return clampSplit(((clientX - left) / width) * 100);
}

/**
 * The window-splitter keys from the WAI-ARIA pattern: arrows step, Home and End jump to the
 * bounds. `null` means the key is not the divider's, so the caller leaves it alone.
 */
export function splitAfterKey(current: number, key: string): number | null {
  switch (key) {
    case "ArrowLeft":
      return clampSplit(current - SPLIT_STEP);
    case "ArrowRight":
      return clampSplit(current + SPLIT_STEP);
    case "Home":
      return SPLIT_MIN;
    case "End":
      return SPLIT_MAX;
    default:
      return null;
  }
}
