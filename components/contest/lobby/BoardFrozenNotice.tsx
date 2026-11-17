import {
  BOARD_FROZEN_EXPLANATION,
  FINAL_STANDINGS_TITLE,
  SUBMISSIONS_CLOSED_LINE,
  boardFrozenTitle,
} from "@/lib/contest/board-freeze-copy";

/**
 * The frozen-board notice for a student screen on the paper ground: /standings, /team and the
 * lobby's team card all render this one component, so the three can never word the freeze
 * differently.
 *
 * The chip names the instant ("Board frozen at 8:00 PM", Indiana time), and the sentence under it
 * says what the freeze means for THIS student. After End on a frozen board the notice stays, with
 * "Submissions are closed." added, because the board is still frozen until the reveal.
 *
 * Gold with ink type is 13.44:1. The sentence is `text-ink/75`, above the AA floor on paper.
 */
export const BOARD_FROZEN_LINE = BOARD_FROZEN_EXPLANATION;

export interface BoardFrozenNoticeProps {
  /** The freeze instant. A frozen board's `asOf` is exactly this. */
  readonly frozenAt: string;
  /** True once the window has closed while the board is still frozen. */
  readonly submissionsClosed?: boolean;
}

export function BoardFrozenNotice({ frozenAt, submissionsClosed = false }: BoardFrozenNoticeProps) {
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
        {boardFrozenTitle(frozenAt)}
      </span>
      <p className="text-ink/75" style={{ fontSize: "var(--text-sm)" }}>
        {submissionsClosed && (
          <>
            <strong className="font-semibold text-ink">{SUBMISSIONS_CLOSED_LINE}</strong>{" "}
          </>
        )}
        {BOARD_FROZEN_LINE}
      </p>
    </div>
  );
}

/**
 * After "Unfreeze and reveal": the same place on the screen, saying the board is final.
 *
 * Panther on paper is 5.08:1, so the label keeps its colour and still passes AA as small text.
 */
export function FinalStandingsNotice() {
  return (
    <p
      role="status"
      data-testid="final-standings-notice"
      className="self-start rounded-chip border border-panther px-2 py-0.5 font-bold text-panther uppercase"
      style={{ fontSize: "var(--text-xs)", letterSpacing: "0.08em" }}
    >
      {FINAL_STANDINGS_TITLE}
    </p>
  );
}
