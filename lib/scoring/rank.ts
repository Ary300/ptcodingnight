/**
 * Ranking and tie handling, shared by both presets.
 *
 * Two properties this file exists to guarantee:
 *
 *  1. **Genuine ties are displayed as ties** (PRD §6.1). Two participants level on every
 *     ranking key get the same rank number and both are flagged `isTied`. Nothing is broken
 *     arbitrarily to force a strict order.
 *  2. **Output order is deterministic anyway.** Ties must not make the output order depend
 *     on input order, or G6's byte-for-byte replay fails. Once the ranking keys are
 *     exhausted, entries are ordered by `participantId` purely for stability — that
 *     tiebreak affects the order rows are printed in, never the rank they are assigned.
 */

/** Ranking keys, most significant first. Higher `primary` is better; lower others are better. */
export interface RankKey {
  readonly participantId: string;
  /** Points in Coding Night Classic, solve count in ICPC. Sorted DESC. */
  readonly primary: number;
  /** Total penalty minutes. Sorted ASC. */
  readonly penalty: number;
  /** Time of the last score-increasing submission, ms since epoch. Sorted ASC. */
  readonly lastScoreIncreaseMs: number | null;
}

export interface RankedEntry {
  readonly participantId: string;
  readonly rank: number;
  readonly isTied: boolean;
}

/** A participant who never increased their score sorts behind everyone who did. */
function lastIncreaseSortValue(key: RankKey): number {
  return key.lastScoreIncreaseMs ?? Number.POSITIVE_INFINITY;
}

/** True when two entries are level on every key that affects rank. */
function sameRankKeys(a: RankKey, b: RankKey): boolean {
  return (
    a.primary === b.primary &&
    a.penalty === b.penalty &&
    lastIncreaseSortValue(a) === lastIncreaseSortValue(b)
  );
}

function compare(a: RankKey, b: RankKey): number {
  if (a.primary !== b.primary) return b.primary - a.primary;
  if (a.penalty !== b.penalty) return a.penalty - b.penalty;

  const aLast = lastIncreaseSortValue(a);
  const bLast = lastIncreaseSortValue(b);
  if (aLast !== bLast) return aLast - bLast;

  // Ranking keys are exhausted and these two are a genuine tie. Ordering by id keeps the
  // output stable across runs; it deliberately does NOT feed into the rank below.
  return a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0;
}

/**
 * Rank one division. Uses standard competition ranking, so two participants tied for 2nd
 * are both 2nd and the next is 4th — never 3rd.
 */
export function rankDivision(keys: readonly RankKey[]): RankedEntry[] {
  const sorted = [...keys].sort(compare);

  return sorted.map((key, index) => {
    const previous = sorted[index - 1];
    const next = sorted[index + 1];

    // Same rank number as the entry above when level with it, otherwise this position.
    let rank = index + 1;
    if (previous !== undefined && sameRankKeys(key, previous)) {
      // Walk back to the first entry of this tie group.
      let first = index;
      while (first > 0) {
        const candidate = sorted[first - 1];
        if (candidate === undefined || !sameRankKeys(key, candidate)) break;
        first -= 1;
      }
      rank = first + 1;
    }

    const isTied =
      (previous !== undefined && sameRankKeys(key, previous)) ||
      (next !== undefined && sameRankKeys(key, next));

    return { participantId: key.participantId, rank, isTied };
  });
}
