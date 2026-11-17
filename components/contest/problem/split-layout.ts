/**
 * The rules of the problem page's two layouts, as pure functions.
 *
 * "Stacked" is the page as it has always been: statement across the measure, editor below.
 * "Side by side" is HackerRank's split, statement on the left and the editor on the right with a
 * divider between them. Everything here is free of `window` so it is a unit test, and the parts
 * that touch storage and media queries live in `split-preference.ts`.
 */

export type ProblemLayout = "stacked" | "side";

export const DEFAULT_LAYOUT: ProblemLayout = "stacked";

/** Below this width the page is always stacked. Tailwind's `lg`, so CSS and JS agree. */
export const SIDE_BY_SIDE_MIN_WIDTH_PX = 1024;

/** The left pane's share of the split, in percent. Each pane keeps at least 30%. */
export const SPLIT_MIN = 30;
export const SPLIT_MAX = 70;
export const SPLIT_DEFAULT = 50;
/** How far one arrow press moves the divider. */
export const SPLIT_STEP = 5;

export function parseLayout(raw: string | null): ProblemLayout {
  return raw === "side" || raw === "stacked" ? raw : DEFAULT_LAYOUT;
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

/**
 * The box the split occupies, from facts the caller measures.
 *
 * `bleed` widens the split past the page's content column on each side, up to a 16px gutter
 * from the window edge, because two panes inside a 1120px column leave each about 560px and the
 * editor needs the room. `height` fills the window below the split's top edge, with a floor so a
 * short window scrolls the page rather than squashing the editor into a strip.
 */
export interface SplitBoxInput {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly columnWidth: number;
  readonly topInDocument: number;
}

export interface SplitBox {
  readonly bleed: number;
  readonly height: number;
}

export const SPLIT_SIDE_GUTTER_PX = 16;
export const SPLIT_MAX_WIDTH_PX = 1760;
export const SPLIT_MIN_HEIGHT_PX = 448;
export const SPLIT_BOTTOM_GAP_PX = 16;

export function splitBoxFor(input: SplitBoxInput): SplitBox {
  const target = Math.min(input.viewportWidth - 2 * SPLIT_SIDE_GUTTER_PX, SPLIT_MAX_WIDTH_PX);
  const bleed = Math.max(0, Math.floor((target - input.columnWidth) / 2));
  const height = Math.max(
    SPLIT_MIN_HEIGHT_PX,
    Math.floor(input.viewportHeight - input.topInDocument - SPLIT_BOTTOM_GAP_PX),
  );
  return { bleed, height };
}
