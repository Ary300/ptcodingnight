/**
 * The frozen-board notice for a student screen on the paper ground.
 *
 * The same gold "Board frozen" chip the lobby's standings card wears, with a sentence that says
 * what the freeze means for THIS student. /team showed no notice at all during a freeze, so a
 * student whose AC after the freeze read "Solved, 200 pts" on the problem list saw 0 for it on
 * the team page with nothing to say why, which reads as lost points.
 */
export const BOARD_FROZEN_LINE =
  "The board shows the standings as of the freeze. Points scored after the freeze still count, and they appear at the reveal.";

export function BoardFrozenNotice() {
  return (
    <div role="status" data-testid="board-frozen-notice" className="flex flex-col gap-1">
      <span
        className="self-start px-2 py-0.5 font-bold uppercase"
        style={{
          background: "var(--color-gold)",
          color: "var(--color-ink)",
          fontSize: "var(--text-xs)",
          letterSpacing: "0.08em",
        }}
      >
        Board frozen
      </span>
      <p className="text-ink/75" style={{ fontSize: "var(--text-sm)" }}>
        {BOARD_FROZEN_LINE}
      </p>
    </div>
  );
}
