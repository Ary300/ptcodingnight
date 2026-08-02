import { z } from "zod";

/**
 * The worker heartbeat: "a judge is alive" as a positive, queryable fact.
 *
 * The worst real failure this platform has had was an ABSENT worker that nothing could log —
 * submissions queueing for 12 minutes while every individual number on the health bar looked
 * explicable. Every earlier answer to "is a judge running?" was an inference: BullMQ's client
 * list (shows a connection for a wedged worker, or a stale one for a dead worker), or the shape
 * of the queue (waiting > 0 with active === 0, which is also what a worker between jobs looks
 * like for a moment). A key the worker itself writes every {@link HEARTBEAT_INTERVAL_MS} with a
 * {@link HEARTBEAT_TTL_SECONDS} expiry inverts that: zero live keys IS "no worker", within one
 * TTL of it becoming true, and multiple workers are simply multiple keys.
 *
 * Both sides import this file — the worker writes, `judgeHealth()` and `queuePositionOf()` read —
 * so the key shape cannot drift into two halves that never meet.
 */

/** Every worker's key starts with this; counting live workers is counting keys under it. */
export const WORKER_HEARTBEAT_PREFIX = "judge:worker:";

/** How often a live worker rewrites its key. */
export const HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * How long a key outlives its last write. Three missed beats: one is a GC pause or a busy
 * event loop, three is a process that is gone. A crash (no orderly DEL) reads as "no worker"
 * within 30 seconds; an orderly shutdown deletes the key and reads as it immediately.
 */
export const HEARTBEAT_TTL_SECONDS = 30;

/** What a heartbeat key holds. Parsed on read, never cast — the writer may be another build. */
export const WorkerHeartbeatSchema = z.object({
  /** ISO instant the worker finished its preflight and started consuming. */
  startedAt: z.string(),
  pid: z.number().int().positive(),
  concurrency: z.number().int().positive(),
});
export type WorkerHeartbeat = z.infer<typeof WorkerHeartbeatSchema>;

export function heartbeatKey(workerId: string): string {
  return `${WORKER_HEARTBEAT_PREFIX}${workerId}`;
}

/**
 * The slices of the two Redis handles these functions actually use, typed structurally so the
 * unit tests can hand in a fake without a Redis — and because the two sides genuinely hold
 * different clients. The heartbeat adds no client of its own:
 *
 *  - the WRITER is the worker's own raw `IORedis` connection, whose commands are
 *    ioredis-style varargs (`set(key, value, "EX", 30)`);
 *  - the READER is `await queue.client` on the web side, which BullMQ 5 types as its
 *    `IRedisClient` adapter with structured options (`scan(cursor, { MATCH, COUNT })`).
 */
export interface HeartbeatWriter {
  set(key: string, value: string, secondsToken: "EX", seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export interface HeartbeatReader {
  scan(
    cursor: string | number,
    options: { MATCH?: string; COUNT?: number },
  ): Promise<[string, string[]]>;
}

export interface WorkerIdentity {
  /** Unique per process — multiple workers must be multiple keys, never one contested key. */
  readonly workerId: string;
  readonly startedAt: string;
  readonly pid: number;
  readonly concurrency: number;
}

/**
 * Start beating. Writes immediately, then every {@link HEARTBEAT_INTERVAL_MS}, each write with
 * the TTL attached — the expiry is part of the SAME command as the value, so there is no window
 * where a crash leaves an immortal key.
 *
 * A failed beat is logged and survived: the worker's job is judging, and a Redis hiccup that
 * BullMQ itself will ride out must not take the worker down. The key simply ages toward its
 * TTL, which is the honest signal.
 *
 * Returns the stop function. Stopping clears the timer and deletes the key, so an orderly
 * shutdown is visible to the console immediately rather than after a TTL of doubt.
 */
export function startWorkerHeartbeat(
  client: HeartbeatWriter,
  identity: WorkerIdentity,
): () => Promise<void> {
  const key = heartbeatKey(identity.workerId);
  const payload = JSON.stringify({
    startedAt: identity.startedAt,
    pid: identity.pid,
    concurrency: identity.concurrency,
  } satisfies WorkerHeartbeat);

  const beat = async (): Promise<void> => {
    try {
      await client.set(key, payload, "EX", HEARTBEAT_TTL_SECONDS);
    } catch (error: unknown) {
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "judge.heartbeat_failed",
          key,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };

  void beat();
  const timer = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
  // The heartbeat must never be what keeps a closed worker's event loop alive.
  timer.unref();

  return async (): Promise<void> => {
    clearInterval(timer);
    try {
      await client.del(key);
    } catch {
      // The TTL retires the key within 30 seconds either way; failing a shutdown over it
      // would be the wrong trade.
    }
  };
}

/**
 * How many workers are alive right now: the count of unexpired heartbeat keys.
 *
 * SCAN, not KEYS — this runs on the same Redis that carries every judge job, and KEYS blocks it.
 * SCAN may return a key more than once across iterations, so the count goes through a Set.
 * Errors propagate: every caller already owns a "Redis could not answer" path, and answering
 * "0 workers" for "could not ask" would put the loudest alarm on the wrong condition.
 */
export async function countLiveWorkers(client: HeartbeatReader): Promise<number> {
  const keys = new Set<string>();
  let cursor = "0";
  do {
    const [next, batch] = await client.scan(cursor, {
      MATCH: `${WORKER_HEARTBEAT_PREFIX}*`,
      COUNT: 100,
    });
    cursor = next;
    for (const key of batch) keys.add(key);
  } while (cursor !== "0");
  return keys.size;
}
