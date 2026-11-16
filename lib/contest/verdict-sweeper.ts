import { prisma } from "@/lib/db";
import { reconcile } from "@/lib/contest/submissions";

/**
 * Moves finished verdicts into the database whether or not anybody is looking.
 *
 * The worker writes nothing to Postgres; a verdict lands when `reconcile` reads it out of the
 * queue. Until this existed only three things called it: the submitting student's own stream, a
 * GET on that one submission, and the organizer's live console. The projector calls none of them.
 * So a student who submitted and closed the laptop, or walked to a teammate's desk, left an `AC`
 * sitting in Redis while the board on the wall showed them without it, until an organizer happened
 * to open the console. After 500 newer jobs the queue drops a finished one entirely.
 *
 * Every two seconds this reconciles the oldest unjudged submissions, the same function the stream
 * calls, so it can only do what a reader would have done sooner. `reconcile` writes conditionally
 * and is safe to run beside every other caller.
 */

/** How often. A verdict a student is not watching for may wait this long; one they are does not. */
export const SWEEP_INTERVAL_MS = 2_000;

/** Bounded, oldest first, because the queue is FIFO and the oldest are the ones finished first. */
export const SWEEP_BATCH = 40;

/** Submissions older than this are history, not work. Keeps the query off a whole season's rows. */
const SWEEP_LOOKBACK_MS = 12 * 60 * 60 * 1000;

const globalForSweeper = globalThis as unknown as { ptcnVerdictSweeper?: ReturnType<typeof setInterval> };

let running = false;
let lastErrorLoggedMs = 0;

/** One pass. Exported for tests and for anything that wants a sweep now rather than in 2 s. */
export async function sweepVerdicts(now: Date = new Date()): Promise<number> {
  const unjudged = await prisma.submission.findMany({
    where: {
      verdict: null,
      submittedAt: { gte: new Date(now.getTime() - SWEEP_LOOKBACK_MS) },
    },
    select: { id: true },
    orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
    take: SWEEP_BATCH,
  });
  for (const row of unjudged) {
    await reconcile(row.id, now);
  }
  return unjudged.length;
}

async function tick(): Promise<void> {
  // A tick that is still waiting on Redis (a restart holds every command until it reconnects)
  // must not have a second one stacked behind it every two seconds.
  if (running) return;
  running = true;
  try {
    await sweepVerdicts();
  } catch (error: unknown) {
    const nowMs = Date.now();
    // Once a minute is enough to say the sweep is failing; every two seconds buries the log.
    if (nowMs - lastErrorLoggedMs > 60_000) {
      lastErrorLoggedMs = nowMs;
      console.error(
        JSON.stringify({
          level: "error",
          event: "verdicts.sweep_failed",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  } finally {
    running = false;
  }
}

/** Start the sweep in this process. Idempotent: dev reloads and a second `register` start nothing. */
export function startVerdictSweeper(): void {
  if (globalForSweeper.ptcnVerdictSweeper !== undefined) return;
  const timer = setInterval(() => void tick(), SWEEP_INTERVAL_MS);
  // Never the reason a process stays alive.
  timer.unref();
  globalForSweeper.ptcnVerdictSweeper = timer;
}
