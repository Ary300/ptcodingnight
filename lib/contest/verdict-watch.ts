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

/** How long a tick waits for the verdicts it started writing before it publishes. */
export const RECONCILE_WAIT_MS = 250;

/**
 * Verdict writes this watcher keeps in flight at once.
 *
 * Every write for one contest takes the contest's mutation lock, so they run one at a time
 * whatever this is. A write waiting on that lock still holds a connection from the web process's
 * pool of 20, though, and starting fifty at once (a burst's worth) parked the whole pool on the
 * lock: measured on a loaded host, polls then waited seconds for a connection and the median
 * verdict took 34 s to reach its page. A handful keeps the lock busy and leaves the pool to
 * everyone else. Oldest submission first, so the queue order is the order verdicts appear.
 */
export const MAX_RECONCILES_IN_FLIGHT = 4;

/** A write that lands after its tick published brings the next tick forward to this. */
export const WAKE_DELAY_MS = 25;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface WatchedSubmission {
  readonly id: string;
  readonly participantId: string;
  readonly verdict: string | null;
  readonly score: number;
  readonly submittedAt: Date;
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
    { id: string; participantId: string; verdict: string | null; score: number; submittedAt: Date }[]
  >`
    SELECT "id", "participantId", "verdict"::text AS "verdict", "score", "submittedAt"
    FROM (
      SELECT "id", "participantId", "verdict", "score", "submittedAt",
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
  /** A tick is in progress; the loop schedules the next one when it ends. */
  private running = false;
  /** Something asked for an early tick while one was running. */
  private wakeSoon = false;

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

    const room = MAX_RECONCILES_IN_FLIGHT - this.reconciling.size;
    const pending = rows
      .filter((row) => row.verdict === null && !this.reconciling.has(row.id))
      .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime() || (a.id < b.id ? -1 : 1))
      .map((row) => row.id);
    if (pending.length > 0 && room > 0) {
      const ready = await this.deps.readyToReconcile(pending);
      const next = pending.filter((id) => ready.has(id)).slice(0, room);
      if (next.length > 0) {
        const writes = next.map((id) => {
          const write = { landed: false, done: Promise.resolve() };
          write.done = this.startReconcile(id, now).finally(() => {
            write.landed = true;
          });
          return write;
        });
        /*
          Wait for the writes, but only briefly. Verdict writes for one contest serialize on its
          mutation lock, so a burst of fifty finished jobs can take seconds to persist; a tick that
          waited for all of them would hold back the first verdict until the last was written, and
          hold every later tick behind it. Whatever lands inside the budget goes out on THIS tick;
          anything slower keeps writing in the background (never started twice, see
          `reconciling`) and brings the next tick forward the moment it lands.
        */
        await Promise.race([Promise.all(writes.map((w) => w.done)), delay(RECONCILE_WAIT_MS)]);
        for (const write of writes) {
          if (!write.landed) void write.done.then(() => this.wake());
        }
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

  /** Submissions whose verdict this watcher is writing right now. */
  private readonly reconciling = new Set<string>();

  private startReconcile(submissionId: string, now: Date): Promise<void> {
    this.reconciling.add(submissionId);
    return this.deps
      .reconcile(submissionId, now)
      .catch((error: unknown) => logTickError(error))
      .finally(() => this.reconciling.delete(submissionId));
  }

  /** At most one timer and at most one running tick, ever. */
  private schedule(delayMs: number = this.tickMs): void {
    if (this.running || this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.loop();
    }, delayMs);
  }

  /** Tick soon rather than on the schedule: a verdict write just landed. */
  private wake(): void {
    if (this.listeners.size === 0) return;
    if (this.running) {
      this.wakeSoon = true;
      return;
    }
    this.stop();
    this.schedule(WAKE_DELAY_MS);
  }

  private async loop(): Promise<void> {
    this.running = true;
    try {
      await this.tick();
    } catch (error: unknown) {
      // One bad tick is not a reason to stop watching; the next one retries.
      logTickError(error);
    } finally {
      this.running = false;
    }
    if (this.listeners.size === 0) return;
    const soon = this.wakeSoon;
    this.wakeSoon = false;
    this.schedule(soon ? WAKE_DELAY_MS : this.tickMs);
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
