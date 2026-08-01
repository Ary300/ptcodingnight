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
 *
 * ## `brand` is division identity. It is not a card accent.
 *
 * `brand` drifted into being page furniture: `components/admin/Panel.tsx` put one on EVERY
 * section of EVERY admin page, so `/admin` rendered six identical railed cards and `/admin/console`
 * four. A mark that appears on everything marks nothing, and it spent the accent that the one
 * primary action on each screen needed (DESIGN.md §2).
 *
 * So `brand` is licensed for exactly two things: telling one division apart from another, and
 * the status edge of a problem card. A section heading separates itself with whitespace and
 * type size — see the three intervals in DESIGN.md §5c — not with a red bar.
 */

export type RailState = "rise" | "fall" | "rest" | "brand";

const BACKGROUND: Record<RailState, string> = {
  rise: "var(--color-rise)",
  fall: "var(--color-fall)",
  rest: "color-mix(in srgb, var(--color-paper) 22%, transparent)",
  // Division identity and problem-card status only. Never a rank state, and never a card accent.
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
