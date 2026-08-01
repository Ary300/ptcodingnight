import styles from "./leaderboard.module.css";

export interface FrozenPlateProps {
  /** True during the lift itself — the plate animates away and then unmounts. */
  lifting: boolean;
  /** Duration of the lift, from the active timing profile. */
  liftMs: number;
  /** The instant the board is showing, already formatted. */
  asOfLabel: string;
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
export function FrozenPlate({ lifting, liftMs, asOfLabel }: FrozenPlateProps) {
  return (
    <div
      role="status"
      className={`${styles.plate} ${lifting ? styles.plateLifting : ""}`}
      style={{ "--plate-ms": `${liftMs}ms` } as React.CSSProperties}
    >
      <span className={styles.plateTitle}>BOARD FROZEN</span>
      <span className={styles.plateNote}>
        {/* A comma, not an em dash: no em dash appears in anything a person using this site can
            read, and this plate is the largest sentence on the largest screen in the building. */}
        standings as of <span className="numeric">{asOfLabel}</span>, judging continues
      </span>
    </div>
  );
}
