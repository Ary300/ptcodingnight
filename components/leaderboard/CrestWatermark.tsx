import Image from "next/image";

import styles from "./leaderboard.module.css";

/** Rendered square, as drawn. The supplied files are a 46×46 viewBox circle. */
const CREST_PX = 720;

export interface CrestWatermarkProps {
  /** True while the public board is frozen — the mark drops to its outline variant. */
  frozen: boolean;
  /** True from the champion reveal onward. The one moment the crest is full colour. */
  lit: boolean;
}

/**
 * The crest, bleeding off the bottom-left corner. docs/DESIGN.md §5, §6, §8.
 *
 * Three states, one element:
 *   live      the mark as a watermark at low opacity
 *   frozen    outline variant — the board is visibly holding its breath
 *   lit       full colour at full opacity, gold ring first, then the field
 *
 * This is the school's mark, not decoration. It is never recoloured, stretched, rotated or
 * cropped: the only things that change are opacity and which of the two supplied files is
 * on top. Full colour at full opacity happens exactly once all night, and this is it.
 */
export function CrestWatermark({ frozen, lit }: CrestWatermarkProps) {
  const state = lit ? styles.crestLit : frozen ? styles.crestFrozen : "";

  return (
    <div className={`${styles.crest} ${state}`} aria-hidden="true">
      <span className={styles.crestRing} />

      <Image
        src="/brand/pt-crest-outline.svg"
        alt=""
        width={CREST_PX}
        height={CREST_PX}
        priority
        className={`${styles.crestLayer} ${styles.crestOutlineLayer}`}
      />

      <Image
        src="/brand/pt-crest-color.svg"
        alt=""
        width={CREST_PX}
        height={CREST_PX}
        priority
        className={`${styles.crestLayer} ${styles.crestColorLayer}`}
      />
    </div>
  );
}
