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

  /*
    NOT `--rise` and `--fall` any more, on either surface.

    Those two are dark-surface colours: on `--paper` they measure 2.02 and 1.94, and axe flags both
    as serious at projector sizes. They were legal while the projector was an `--ink` stage; the
    stage is Codeforces white now, so there is no ground left in this product on which they pass.

    There is no green in the palette that clears AA on paper, and inventing one to keep a
    green-up/red-down convention would be choosing a convention over legibility on a wall. So: up
    is `--ink` at weight, down is `--panther` at 5.08, unchanged is muted.

    Nothing is lost, and the reason is in this file's own docstring: the GLYPH carries the meaning.
    `--rise` and `--fall` differ in luminance by a factor of 1.04 — near-identical brightness
    separated almost entirely by hue — so for the roughly one boy in twelve in that room with a
    colour-vision deficiency, they never carried it in the first place.
  */
  const color =
    value > 0
      ? "var(--color-ink)"
      : value < 0
        ? "var(--color-panther)"
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
