import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  countLiveWorkers,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TTL_SECONDS,
  heartbeatKey,
  startWorkerHeartbeat,
  WorkerHeartbeatSchema,
  type HeartbeatReader,
  type HeartbeatWriter,
} from "@/lib/judge/heartbeat";

/**
 * The heartbeat's whole value is its shape: every write carries the TTL in the same command,
 * a stop deletes the key, and the reader counts distinct keys. Each of those is a property a
 * refactor could silently lose while the worker still "works", so each is pinned here against
 * a fake client — the liveness of the real thing is proved by reading Redis after a worker
 * restart, not by a unit test.
 */

interface SetCall {
  readonly key: string;
  readonly value: string;
  readonly seconds: number;
}

function fakeWriter(): HeartbeatWriter & { sets: SetCall[]; dels: string[] } {
  const sets: SetCall[] = [];
  const dels: string[] = [];
  return {
    sets,
    dels,
    set(key, value, _token, seconds) {
      sets.push({ key, value, seconds });
      return Promise.resolve("OK");
    },
    del(key) {
      dels.push(key);
      return Promise.resolve(1);
    },
  };
}

const IDENTITY = {
  workerId: "test-host-123",
  startedAt: "2026-08-02T00:00:00.000Z",
  pid: 123,
  concurrency: 2,
} as const;

describe("startWorkerHeartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes immediately, with the TTL attached to the same command as the value", async () => {
    const client = fakeWriter();
    const stop = startWorkerHeartbeat(client, IDENTITY);
    await vi.advanceTimersByTimeAsync(0);

    expect(client.sets).toHaveLength(1);
    const first = client.sets[0];
    expect(first?.key).toBe(heartbeatKey(IDENTITY.workerId));
    expect(first?.seconds).toBe(HEARTBEAT_TTL_SECONDS);
    await stop();
  });

  it("writes a payload the reader's schema accepts, carrying pid and concurrency", async () => {
    const client = fakeWriter();
    const stop = startWorkerHeartbeat(client, IDENTITY);
    await vi.advanceTimersByTimeAsync(0);

    const parsed = WorkerHeartbeatSchema.parse(JSON.parse(client.sets[0]?.value ?? ""));
    expect(parsed).toEqual({
      startedAt: IDENTITY.startedAt,
      pid: IDENTITY.pid,
      concurrency: IDENTITY.concurrency,
    });
    await stop();
  });

  it("beats on the interval, and each beat renews the TTL", async () => {
    const client = fakeWriter();
    const stop = startWorkerHeartbeat(client, IDENTITY);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3);

    expect(client.sets).toHaveLength(4); // the immediate write plus three ticks
    expect(client.sets.every((s) => s.seconds === HEARTBEAT_TTL_SECONDS)).toBe(true);
    // The interval must be comfortably inside the TTL, or a healthy worker flickers "dead".
    expect(HEARTBEAT_INTERVAL_MS).toBeLessThan(HEARTBEAT_TTL_SECONDS * 1000);
    await stop();
  });

  it("stop deletes the key and ends the beats, so an orderly shutdown is visible immediately", async () => {
    const client = fakeWriter();
    const stop = startWorkerHeartbeat(client, IDENTITY);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);

    await stop();
    const writesAtStop = client.sets.length;
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 5);

    expect(client.dels).toEqual([heartbeatKey(IDENTITY.workerId)]);
    expect(client.sets).toHaveLength(writesAtStop);
  });

  it("survives a failed beat: the worker's job is judging, not heartbeating", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = fakeWriter();
    const failing: HeartbeatWriter = {
      set: () => Promise.reject(new Error("redis hiccup")),
      del: client.del.bind(client),
    };

    const stop = startWorkerHeartbeat(failing, IDENTITY);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
    // No throw reached the timer, and the failure was logged rather than swallowed.
    expect(warn).toHaveBeenCalled();
    await stop();
    warn.mockRestore();
  });
});

describe("countLiveWorkers", () => {
  function readerOf(pages: readonly (readonly [string, string[]])[]): HeartbeatReader {
    let call = 0;
    return {
      scan: (): Promise<[string, string[]]> => {
        const page = pages[call] ?? (["0", []] as const);
        call += 1;
        return Promise.resolve([page[0], [...page[1]]]);
      },
    };
  }

  it("counts zero keys as zero workers — the positive fact 'no judge is running'", async () => {
    expect(await countLiveWorkers(readerOf([["0", []]]))).toBe(0);
  });

  it("counts one key per worker across SCAN pages", async () => {
    const reader = readerOf([
      ["17", ["judge:worker:a", "judge:worker:b"]],
      ["0", ["judge:worker:c"]],
    ]);
    expect(await countLiveWorkers(reader)).toBe(3);
  });

  it("does not double-count a key SCAN returns twice", async () => {
    const reader = readerOf([
      ["9", ["judge:worker:a"]],
      ["0", ["judge:worker:a", "judge:worker:b"]],
    ]);
    expect(await countLiveWorkers(reader)).toBe(2);
  });

  it("propagates a Redis error instead of answering zero for 'could not ask'", async () => {
    const reader: HeartbeatReader = { scan: () => Promise.reject(new Error("down")) };
    await expect(countLiveWorkers(reader)).rejects.toThrow("down");
  });
});
