/**
 * The rail — the device tying the app and the projector together (docs/DESIGN.md §5).
 *
 * A 6px bar on the leading edge of every standings row and problem card. On the projector
 * it gives the eye a column to track straight down the board from the back of the room.
 *
 * The resting state is deliberately NEUTRAL, never `--panther`. A brand-red rail sits in
 * the same warm family as `--fall`, and at projector distance a row that had dropped and a
 * row that had not moved read alike — which defeats the point of the rail. This was caught
 * by looking at the rendered specimen, not by reasoning about it.
 */

export type RailState = "rise" | "fall" | "rest" | "brand";

const BACKGROUND: Record<RailState, string> = {
  rise: "var(--color-rise)",
  fall: "var(--color-fall)",
  rest: "color-mix(in srgb, var(--color-paper) 22%, transparent)",
  // Chrome only — division identity, card accents. Never a rank state.
  brand: "var(--color-panther)",
};

export interface RailProps {
  state?: RailState;
  className?: string;
}

export function Rail({ state = "rest", className }: RailProps) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        width: "var(--rail-width)",
        alignSelf: "stretch",
        flex: "0 0 var(--rail-width)",
        background: BACKGROUND[state],
        borderRadius: 1,
      }}
    />
  );
}

/** Map a rank delta to a rail state, so the two are never derived inconsistently. */
export function railStateForDelta(delta: number): RailState {
  return delta > 0 ? "rise" : delta < 0 ? "fall" : "rest";
}
