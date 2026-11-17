import { BOARD_FROZEN_EXPLANATION, SUBMISSIONS_CLOSED_LINE } from "@/lib/contest/board-freeze-copy";

import styles from "./leaderboard.module.css";

export interface FrozenPlateProps {
  /** True during the lift itself — the plate animates away and then unmounts. */
  lifting: boolean;
  /** Duration of the lift, from the active timing profile. */
  liftMs: number;
  /** The instant the board is showing, already formatted. A frozen board's `asOf` is the freeze. */
  asOfLabel: string;
  /** True once the window has closed while the board stays frozen. */
  submissionsClosed?: boolean;
}

/**
 * `BOARD FROZEN`. docs/DESIGN.md §6, PRD §6.3.
 *
 * Gold ground with `--ink` type — 13.44:1, the strongest pairing in the palette, because
 * this is the one message the room must not miss. Judging is still running underneath;
 * everybody can see that positions are moving and that they cannot see them.
 *
 * Step 1 of the Unfreeze is this plate lifting away. `role="status"` so a screen reader
 * hears the state change rather than only seeing it.
 */
export function FrozenPlate({ lifting, liftMs, asOfLabel, submissionsClosed = false }: FrozenPlateProps) {
  return (
    <div
      role="status"
      className={`${styles.plate} ${lifting ? styles.plateLifting : ""}`}
      style={{ "--plate-ms": `${liftMs}ms` } as React.CSSProperties}
    >
      {/* The same words as the students' own screens (lib/contest/board-freeze-copy.ts), so the
          wall and a laptop in another room cannot disagree. No em dash, no middle dot. */}
      <span className={styles.plateTitle} data-testid="frozen-plate-title">
        BOARD FROZEN AT <span className="numeric">{asOfLabel}</span>
      </span>
      <span className={styles.plateNote}>
        {submissionsClosed ? `${SUBMISSIONS_CLOSED_LINE} ` : ""}
        {BOARD_FROZEN_EXPLANATION}
      </span>
    </div>
  );
}
