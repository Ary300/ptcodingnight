import { GRID_SIZE, guestMark } from "./guest-avatar";

/**
 * A practice guest's picture: a mirrored 5 by 5 mark on a paper tile, drawn as inline SVG.
 *
 * The tile is `--paper` on the `--ink` header (18.65:1) and the squares are `--panther` (5.08:1
 * on paper) or `--ink`, so the mark clears the 3:1 non-text floor against everything it touches.
 * Decorative: the account button's `aria-label` and the visible "Guest" beside it already name
 * the viewer, so the picture is hidden from assistive technology rather than announced twice.
 */

const TONE_FILL = {
  panther: "var(--color-panther)",
  ink: "var(--color-ink)",
} as const;

/** One unit of paper around the grid, so the mark never touches the tile's rounded edge. */
const PAD = 1;
const VIEW = GRID_SIZE + PAD * 2;

export interface GuestAvatarProps {
  readonly seed: string;
  readonly sizeClass?: string;
}

export function GuestAvatar({ seed, sizeClass = "h-7 w-7" }: GuestAvatarProps) {
  const { cells, tone } = guestMark(seed);

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-guest-avatar
      viewBox={`0 0 ${String(VIEW)} ${String(VIEW)}`}
      className={`${sizeClass} shrink-0`}
      shapeRendering="crispEdges"
    >
      <rect width={VIEW} height={VIEW} rx={1.4} fill="var(--color-paper)" />
      {cells.flatMap((row, rowIndex) =>
        row.map((on, columnIndex) =>
          on ? (
            <rect
              key={`${String(rowIndex)}-${String(columnIndex)}`}
              x={columnIndex + PAD}
              y={rowIndex + PAD}
              width={1}
              height={1}
              fill={TONE_FILL[tone]}
            />
          ) : null,
        ),
      )}
    </svg>
  );
}
