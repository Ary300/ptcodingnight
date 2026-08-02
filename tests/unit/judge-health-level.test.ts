import { describe, expect, it } from "vitest";

import {
  judgeHealthLevel,
  STALLED_AFTER_MS,
} from "@/components/admin/contract";
import type { JudgeHealthView } from "@/lib/schemas/api";

/**
 * The worker-down alarm's decision table.
 *
 * The case that earns this file is "stalled": jobs waiting, zero active, oldest past 30 s.
 * That exact condition sat unnoticed on the dev machine - the worker is a hand-started
 * process here, nobody had started one, and a submission waited 12 minutes for a verdict
 * while every individual number on the health bar looked explicable. The level has to go to
 * the loudest state on the numbers alone, including when Redis's client list still shows a
 * worker connection, because a wedged or half-dead worker keeps its connection while taking
 * nothing.
 */

function health(overrides: Partial<JudgeHealthView> = {}): JudgeHealthView {
  return {
    reachable: true,
    queueDepth: 0,
    active: 0,
    failed: 0,
    workersOnline: 1,
    oldestWaitingMs: null,
    ...overrides,
  };
}

describe("judgeHealthLevel", () => {
  it("reports ok when nothing is wrong", () => {
    expect(judgeHealthLevel(health())).toBe("ok");
  });

  it("reports stalled when jobs queue, none is active, and the oldest is past the grace", () => {
    const view = health({
      queueDepth: 3,
      active: 0,
      oldestWaitingMs: STALLED_AFTER_MS + 1,
    });
    expect(judgeHealthLevel(view)).toBe("stalled");
  });

  it("reports stalled even while Redis still lists a worker connection", () => {
    // A wedged worker keeps its connection. The observed condition outranks the inferred one.
    const view = health({
      queueDepth: 5,
      active: 0,
      workersOnline: 2,
      oldestWaitingMs: STALLED_AFTER_MS + 1,
    });
    expect(judgeHealthLevel(view)).toBe("stalled");
  });

  it("does not report stalled inside the 30 s grace, when a worker may be between jobs", () => {
    const view = health({ queueDepth: 3, active: 0, oldestWaitingMs: STALLED_AFTER_MS - 1 });
    // Falls through to the ordinary ladder; with a worker online and a young queue this is ok.
    expect(judgeHealthLevel(view)).toBe("ok");
  });

  it("does not report stalled while something is actually being judged", () => {
    // A 90 s Go compile can legitimately age the queue past 30 s with active >= 1.
    const view = health({ queueDepth: 3, active: 1, oldestWaitingMs: 45_000 });
    expect(judgeHealthLevel(view)).toBe("ok");
  });

  it("reports down when no worker is online, before any job has aged", () => {
    expect(judgeHealthLevel(health({ workersOnline: 0 }))).toBe("down");
  });

  it("reports down when Redis is unreachable, whatever the zeros claim", () => {
    const view = health({ reachable: false, workersOnline: 0 });
    expect(judgeHealthLevel(view)).toBe("down");
  });

  it("keeps the watch states for failed jobs and slow-but-moving queues", () => {
    expect(judgeHealthLevel(health({ failed: 1 }))).toBe("watch");
    expect(judgeHealthLevel(health({ active: 1, queueDepth: 2, oldestWaitingMs: 61_000 }))).toBe(
      "watch",
    );
    expect(judgeHealthLevel(health({ active: 1, queueDepth: 26 }))).toBe("watch");
  });
});
