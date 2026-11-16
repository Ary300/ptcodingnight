import { prisma } from "@/lib/db";
import { jobsReadyToReconcile } from "@/lib/contest/queue";
import { reconcile } from "@/lib/contest/submissions";

/**
 * One watcher for every open verdict stream in this process.
 *
 * Each competitor's stream used to poll for its own verdicts: every 2 s, two reads of the
 * student's newest submissions plus a `reconcile` (a read and two Redis calls) per pending one.
 * Fifty open pages during a burst made that the largest thing the web process asked of Postgres,
 * and it grew with the number of pages rather than with the number of verdicts.
 *
 * Here one tick serves them all. It reads the newest `WATCHED_SUBMISSIONS` of every subscribed
 * participant in ONE query, asks Redis in ONE round trip which pending jobs have finished, runs
 * `reconcile` only for those, and hands each subscriber its own participant's rows. A stream then
 * does exactly what it did with its own rows before: compare each verdict and score to what it
 * last announced, and send a frame for what changed. What a student sees is unchanged; the tick is
 * 1 s instead of 2 s, so a verdict reaches the page sooner, not later.
 *
 * `reconcile` stays the only writer and stays idempotent, so the plain GET, the admin console and
 * this watcher can all race it safely, exactly as the per-stream calls already did.
 */

export const WATCH_TICK_MS = 1_000;

/** Newest submissions considered per participant per tick. Nobody has more than a few in flight. */
export const WATCHED_SUBMISSIONS = 25;

export interface WatchedSubmission {
  readonly id: string;
  readonly participantId: string;
  readonly verdict: string | null;
  readonly score: number;
}

export type VerdictListener = (rows: readonly WatchedSubmission[], now: Date) => void;

/** Everything the watcher touches outside itself, so a test can count it. */
export interface VerdictWatchDeps {
  readonly newestSubmissions: (
    participantIds: readonly string[],
    perParticipant: number,
  ) => Promise<WatchedSubmission[]>;
  readonly readyToReconcile: (submissionIds: readonly string[]) => Promise<ReadonlySet<string>>;
  readonly reconcile: (submissionId: string, now: Date) => Promise<void>;
}

/**
 * The newest submissions of each participant, in one statement.
 *
 * A window function rather than `findMany` because the bound is PER participant: the practice
 * arena keeps a participant for months, and reading all of everybody's history every second would
 * grow without limit. Ordered newest first with the id as tie-break, so a participant's rows come
 * back in one stable order.
 */
async function newestSubmissionsFromDb(
  participantIds: readonly string[],
  perParticipant: number,
): Promise<WatchedSubmission[]> {
  const rows = await prisma.$queryRaw<
    { id: string; participantId: string; verdict: string | null; score: number }[]
  >`
    SELECT "id", "participantId", "verdict"::text AS "verdict", "score"
    FROM (
      SELECT "id", "participantId", "verdict", "score",
             row_number() OVER (
               PARTITION BY "participantId" ORDER BY "submittedAt" DESC, "id" DESC
             ) AS "position"
      FROM "Submission"
      WHERE "participantId" = ANY(${[...participantIds]}::text[])
    ) AS "ranked"
    WHERE "position" <= ${perParticipant}
    ORDER BY "participantId", "position"`;
  return rows.map((row) => ({ ...row, score: Number(row.score) }));
}

const DB_DEPS: VerdictWatchDeps = {
  newestSubmissions: newestSubmissionsFromDb,
  readyToReconcile: jobsReadyToReconcile,
  reconcile,
};

export class VerdictWatch {
  private readonly listeners = new Map<string, Set<VerdictListener>>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly deps: VerdictWatchDeps = DB_DEPS,
    private readonly tickMs: number = WATCH_TICK_MS,
  ) {}

  /** Start receiving a participant's newest rows every tick. Returns the unsubscribe. */
  subscribe(participantId: string, listener: VerdictListener): () => void {
    const set = this.listeners.get(participantId) ?? new Set<VerdictListener>();
    set.add(listener);
    this.listeners.set(participantId, set);
    this.schedule();

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      set.delete(listener);
      if (set.size === 0 && this.listeners.get(participantId) === set) {
        this.listeners.delete(participantId);
      }
      if (this.listeners.size === 0) this.stop();
    };
  }

  /** Test seam, and the number an operator would want: how many students are being watched. */
  watchedParticipantCount(): number {
    return this.listeners.size;
  }

  /**
   * One pass for every subscriber. Public so a test can drive it without a timer; the scheduled
   * loop calls nothing else.
   */
  async tick(now: Date = new Date()): Promise<void> {
    const participantIds = [...this.listeners.keys()];
    if (participantIds.length === 0) return;

    let rows = await this.deps.newestSubmissions(participantIds, WATCHED_SUBMISSIONS);

    const pending = rows.filter((row) => row.verdict === null).map((row) => row.id);
    if (pending.length > 0) {
      const ready = await this.deps.readyToReconcile(pending);
      if (ready.size > 0) {
        await Promise.all(
          [...ready].map((id) =>
            this.deps.reconcile(id, now).catch((error: unknown) => logTickError(error)),
          ),
        );
        // Re-read so the verdicts just written go out on THIS tick, not a second later.
        rows = await this.deps.newestSubmissions(participantIds, WATCHED_SUBMISSIONS);
      }
    }

    const byParticipant = new Map<string, WatchedSubmission[]>();
    for (const row of rows) {
      const list = byParticipant.get(row.participantId) ?? [];
      list.push(row);
      byParticipant.set(row.participantId, list);
    }

    for (const participantId of participantIds) {
      const mine = byParticipant.get(participantId) ?? [];
      for (const listener of this.listeners.get(participantId) ?? []) {
        try {
          listener(mine, now);
        } catch (error: unknown) {
          logTickError(error);
        }
      }
    }
  }

  private schedule(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => void this.loop(), this.tickMs);
  }

  private async loop(): Promise<void> {
    try {
      await this.tick();
    } catch (error: unknown) {
      // One bad tick is not a reason to stop watching; the next one retries.
      logTickError(error);
    }
    this.timer = null;
    if (this.listeners.size > 0) this.schedule();
  }

  private stop(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}

function logTickError(error: unknown): void {
  console.error(
    JSON.stringify({
      level: "error",
      event: "verdict_watch.tick_failed",
      message: error instanceof Error ? error.message : String(error),
    }),
  );
}

/**
 * The process-wide watcher. Memoised on globalThis so Next's dev-mode module reloading cannot
 * leave a second loop ticking against the database beside the first.
 */
const globalForWatch = globalThis as unknown as { verdictWatch: VerdictWatch | undefined };

export function verdictWatch(): VerdictWatch {
  globalForWatch.verdictWatch ??= new VerdictWatch();
  return globalForWatch.verdictWatch;
}
