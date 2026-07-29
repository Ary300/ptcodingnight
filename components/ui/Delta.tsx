/**
 * Rank-change indicator. Shared by the projector and the competitor board.
 *
 * This component exists so the two rules behind it are implemented once:
 *
 *  1. **Colour is never the only channel.** `--rise` and `--fall` differ in luminance by a
 *     factor of 1.04 (docs/DESIGN.md §3) — near-identical brightness, separated almost
 *     entirely by hue, on a low-contrast projector, in a room where roughly one boy in
 *     twelve has a colour-vision deficiency. The glyph carries the meaning; colour
 *     reinforces it.
 *  2. **The glyphs are U+2191 / U+2193 / U+2212**, not the more obvious triangles and em
 *     dash. Those are outside the Latin subset of the vendored woff2 files and would fall
 *     back to whatever font the projector machine happens to have.
 *
 * Do not reimplement this per surface.
 */

const UP = "↑";
const DOWN = "↓";
const NONE = "−";

export interface DeltaProps {
  /** Positions gained (positive) or lost (negative) since the last published board. */
  value: number;
  className?: string;
}

export function Delta({ value, className }: DeltaProps) {
  const glyph = value > 0 ? `${UP}${value}` : value < 0 ? `${DOWN}${Math.abs(value)}` : NONE;

  const color =
    value > 0
      ? "var(--color-rise)"
      : value < 0
        ? "var(--color-fall)"
        : "color-mix(in srgb, currentColor 45%, transparent)";

  const label =
    value > 0 ? `up ${value}` : value < 0 ? `down ${Math.abs(value)}` : "no change";

  return (
    <span
      className={`numeric ${className ?? ""}`}
      style={{ color }}
      role="img"
      aria-label={label}
    >
      {glyph}
    </span>
  );
}
