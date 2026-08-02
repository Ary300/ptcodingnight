import { describe, expect, it } from "vitest";

import {
  judgeHealthLevel,
  LAGGING_AFTER_MS,
} from "@/components/admin/contract";
import type { JudgeHealthView } from "@/lib/schemas/api";

/**
 * The alarm ladder, now standing on the heartbeat.
 *
 * The case that earns this file used to be inferred: jobs waiting, zero active, oldest past a
 * grace, and the inference sat unnoticed on the dev machine for 12 minutes. `workerCount` is
 * now a positive fact (live heartbeat keys, lib/judge/heartbeat.ts), so the decision table is
 * simpler and louder: zero live workers IS the emergency, with an empty queue or a full one.
 * The second rung is age with workers alive — the judge running but not keeping up — because
 * age, not depth, is what distinguishes a catastrophic queue from a healthy burst.
 */

function health(overrides: Partial<JudgeHealthView> = {}): JudgeHealthView {
  return {
    reachable: true,
    queueDepth: 0,
    active: 0,
    failed: 0,
    workerCount: 1,
    oldestWaitingMs: null,
    ...overrides,
  };
}

describe("judgeHealthLevel", () => {
  it("reports ok when nothing is wrong", () => {
    expect(judgeHealthLevel(health())).toBe("ok");
  });

  it("reports offline the moment no heartbeat is live, before any job has aged", () => {
    // The positive fact needs no corroborating queue shape: a dead judge over an empty queue
    // is exactly as dead, and the alarm must not wait for the first student to submit.
    expect(judgeHealthLevel(health({ workerCount: 0 }))).toBe("offline");
  });

  it("reports offline over any queue shape, including one that looks busy", () => {
    // `active` can be nonzero with no live worker: a job left active by a worker that died
    // mid-judge. The heartbeat outranks the inference that something is being worked on.
    const view = health({ workerCount: 0, queueDepth: 12, active: 3, failed: 2 });
    expect(judgeHealthLevel(view)).toBe("offline");
  });

  it("reports lagging when workers are alive but the oldest submission is past the threshold", () => {
    const view = health({
      queueDepth: 3,
      active: 1,
      oldestWaitingMs: LAGGING_AFTER_MS + 1,
    });
    expect(judgeHealthLevel(view)).toBe("lagging");
  });

  it("lags on AGE, not depth: three stale jobs alarm while three hundred fresh ones do not", () => {
    expect(
      judgeHealthLevel(health({ queueDepth: 3, oldestWaitingMs: LAGGING_AFTER_MS + 1 })),
    ).toBe("lagging");
    expect(
      // Deep but draining: a burst just went in and the oldest job is seconds old. Watch-level
      // by depth, never the not-keeping-up alarm.
      judgeHealthLevel(health({ queueDepth: 300, active: 2, oldestWaitingMs: 4_000 })),
    ).toBe("watch");
  });

  it("does not lag inside the threshold, when a full slate plus a Go compile is legitimate", () => {
    const view = health({ queueDepth: 3, active: 1, oldestWaitingMs: LAGGING_AFTER_MS - 1 });
    expect(judgeHealthLevel(view)).toBe("ok");
  });

  it("offline outranks lagging: a dead judge must not read as a slow one", () => {
    const view = health({
      workerCount: 0,
      queueDepth: 3,
      oldestWaitingMs: LAGGING_AFTER_MS + 1,
    });
    expect(judgeHealthLevel(view)).toBe("offline");
  });

  it("reports unreachable when Redis is gone, whatever the zeros claim", () => {
    // `workerCount: 0` here means "could not count", not "no worker" — sending the organizer
    // to restart a worker when Redis is down would be the wrong fix, loudly.
    const view = health({ reachable: false, workerCount: 0 });
    expect(judgeHealthLevel(view)).toBe("unreachable");
  });

  it("keeps the watch states for failed jobs and deep-but-moving queues", () => {
    expect(judgeHealthLevel(health({ failed: 1 }))).toBe("watch");
    expect(judgeHealthLevel(health({ active: 1, queueDepth: 26 }))).toBe("watch");
  });
});
