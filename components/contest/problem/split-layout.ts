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

/**
 * From this width up, a student who has never chosen gets side by side. Between 1024 and this
 * the split is offered but not the default: two panes in a 1100px window leave the editor about
 * 650px, which works, but is a choice a student should make rather than find.
 */
export const SIDE_BY_SIDE_DEFAULT_MIN_WIDTH_PX = 1280;

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
  /** The window is at least `SIDE_BY_SIDE_DEFAULT_MIN_WIDTH_PX` wide. */
  readonly roomy: boolean;
}

/**
 * The layout the page shows. Too narrow wins over everything, then the student's own choice,
 * then the width-based default.
 */
export function resolveLayout({ choice, wide, roomy }: LayoutFacts): ProblemLayout {
  if (!wide) return "stacked";
  if (choice !== null) return choice;
  return roomy ? "side" : "stacked";
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
