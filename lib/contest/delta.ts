/**
 * Rank movement.
 *
 * `StandingRow.delta` drives the rail and the movement glyph on the projector (docs/PRD.md
 * §11), so it answers "how far has this participant moved since the board the room last saw",
 * not "since the last HTTP request". Those differ: with twenty phones polling, a per-request
 * baseline would let one student's poll consume everybody else's animation.
 *
 * So the baseline advances on a tick. Every client within a tick sees the same deltas, and the
 * board moves in steps the room can follow.
 *
 * The snapshot is in-process and intentionally not persisted. It is presentation state: losing
 * it on a restart costs one tick of animation and nothing else, and `Standing` — the schema's
 * materialized cache — requires a division id that participants are allowed not to have.
 */

export interface RankedRow {
  readonly participantId: string;
  readonly rank: number;
}

/** Positive means "moved up the board". Unknown participants start at zero, not at their rank. */
export function computeDeltas(
  rows: readonly RankedRow[],
  previous: ReadonlyMap<string, number>,
): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const row of rows) {
    const before = previous.get(row.participantId);
    deltas.set(row.participantId, before === undefined ? 0 : before - row.rank);
  }
  return deltas;
}

export function ranksOf(rows: readonly RankedRow[]): Map<string, number> {
  return new Map(rows.map((row) => [row.participantId, row.rank]));
}

/** How long a published board stays the baseline for movement. */
export const PUBLISH_TICK_MS = 10_000;

interface Snapshot {
  takenAtMs: number;
  ranks: Map<string, number>;
}

export class RankSnapshotStore {
  private readonly snapshots = new Map<string, Snapshot>();

  constructor(private readonly tickMs: number = PUBLISH_TICK_MS) {}

  /**
   * Deltas against the last published board, advancing the baseline when the tick has elapsed.
   *
   * @param key one baseline per contest **and per view** — the admin board and the public
   *   board have different ranks during a freeze and must not share a baseline.
   */
  deltasFor(key: string, rows: readonly RankedRow[], now: Date): Map<string, number> {
    const nowMs = now.getTime();
    const snapshot = this.snapshots.get(key);

    if (snapshot === undefined) {
      this.snapshots.set(key, { takenAtMs: nowMs, ranks: ranksOf(rows) });
      return computeDeltas(rows, new Map());
    }

    const deltas = computeDeltas(rows, snapshot.ranks);

    if (nowMs - snapshot.takenAtMs >= this.tickMs) {
      this.snapshots.set(key, { takenAtMs: nowMs, ranks: ranksOf(rows) });
    }

    return deltas;
  }

  /** Drop a contest's baselines — used when an organizer unfreezes, so the reveal shows real movement. */
  forget(keyPrefix: string): void {
    for (const key of this.snapshots.keys()) {
      if (key.startsWith(keyPrefix)) this.snapshots.delete(key);
    }
  }
}

export const rankSnapshots = new RankSnapshotStore();
