import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The process-wide verdict watcher (`lib/contest/verdict-watch.ts`) and the per-stream frame diff
 * it feeds (`verdictFrames` in `lib/contest/stream.ts`).
 *
 * What has to hold: the database work per tick does not grow with the number of open pages; a
 * verdict reaches its student within one tick of the judge finishing; and every student receives
 * exactly the frames their own stream used to send, never another student's.
 */

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/contest/queue", () => ({ jobsReadyToReconcile: vi.fn() }));
vi.mock("@/lib/contest/submissions", () => ({
  reconcile: vi.fn(),
  getSubmissionView: vi.fn(async (submissionId: string) => ({
    submissionId,
    verdict: views.get(submissionId)?.verdict ?? null,
    score: views.get(submissionId)?.score ?? 0,
    testResults: [],
  })),
}));

const views = new Map<string, { verdict: string; score: number }>();

const { VerdictWatch, WATCH_TICK_MS } = await import("@/lib/contest/verdict-watch");
type WatchedSubmission = import("@/lib/contest/verdict-watch").WatchedSubmission;
type VerdictWatchDeps = import("@/lib/contest/verdict-watch").VerdictWatchDeps;
const { verdictFrames } = await import("@/lib/contest/stream");

/** A fake database and queue: submission rows, and the set of jobs the judge has finished. */
function fakeWorld(rows: WatchedSubmission[]) {
  const finished = new Set<string>();
  const calls = { reads: 0, readyChecks: 0, reconciles: [] as string[] };
  const deps: VerdictWatchDeps = {
    newestSubmissions: async (participantIds) => {
      calls.reads += 1;
      return rows.filter((row) => participantIds.includes(row.participantId)).map((r) => ({ ...r }));
    },
    readyToReconcile: async (ids) => {
      calls.readyChecks += 1;
      return new Set(ids.filter((id) => finished.has(id)));
    },
    reconcile: async (id) => {
      calls.reconciles.push(id);
      const row = rows.find((r) => r.id === id);
      if (row !== undefined) rows[rows.indexOf(row)] = { ...row, verdict: "AC", score: 100 };
    },
  };
  return { deps, finished, calls, rows };
}

function pending(id: string, participantId: string): WatchedSubmission {
  return { id, participantId, verdict: null, score: 0 };
}

describe("one database read per tick, however many pages are open", () => {
  it("fifty subscribed students cost one read and no queue check when nothing is pending", async () => {
    const world = fakeWorld(
      Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, participantId: `p${i}`, verdict: "WA", score: 0 })),
    );
    const watch = new VerdictWatch(world.deps);
    const received = new Map<string, number>();
    for (let i = 0; i < 50; i += 1) {
      watch.subscribe(`p${i}`, (rows) => received.set(`p${i}`, rows.length));
    }

    await watch.tick();

    expect(world.calls.reads).toBe(1);
    expect(world.calls.readyChecks).toBe(0);
    expect(received.size).toBe(50);
  });

  it("reconciles only the jobs the judge has finished, in one queue check, then re-reads once", async () => {
    const world = fakeWorld(Array.from({ length: 57 }, (_, i) => pending(`s${i}`, `p${i % 50}`)));
    world.finished.add("s3");
    world.finished.add("s40");
    const watch = new VerdictWatch(world.deps);
    const seen: WatchedSubmission[] = [];
    for (let i = 0; i < 50; i += 1) watch.subscribe(`p${i}`, (rows) => seen.push(...rows));

    await watch.tick();

    expect(world.calls.readyChecks).toBe(1);
    expect(world.calls.reconciles.sort()).toEqual(["s3", "s40"]);
    expect(world.calls.reads).toBe(2);
    // The verdicts written on this tick go out on this tick.
    expect(seen.find((r) => r.id === "s3")?.verdict).toBe("AC");
    expect(seen.find((r) => r.id === "s4")?.verdict).toBeNull();
  });

  it("a reconcile that throws does not stop the rest of the tick", async () => {
    const world = fakeWorld([pending("s1", "p1"), pending("s2", "p2")]);
    world.finished.add("s1");
    world.finished.add("s2");
    const reconcile = world.deps.reconcile;
    const deps: VerdictWatchDeps = {
      ...world.deps,
      reconcile: async (id, now) => {
        if (id === "s1") throw new Error("judge log unreadable");
        return reconcile(id, now);
      },
    };
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const watch = new VerdictWatch(deps);
    const got: WatchedSubmission[] = [];
    watch.subscribe("p2", (rows) => got.push(...rows));

    await watch.tick();

    expect(got.find((r) => r.id === "s2")?.verdict).toBe("AC");
    errors.mockRestore();
  });
});

describe("each student receives their own rows and nobody else's", () => {
  it("routes rows by participant, to every stream that participant has open", async () => {
    const world = fakeWorld([
      { id: "a1", participantId: "ada", verdict: "AC", score: 100 },
      { id: "c1", participantId: "cy", verdict: "WA", score: 0 },
    ]);
    const watch = new VerdictWatch(world.deps);
    const ada: string[] = [];
    const adaSecondTab: string[] = [];
    const cy: string[] = [];
    watch.subscribe("ada", (rows) => ada.push(...rows.map((r) => r.id)));
    watch.subscribe("ada", (rows) => adaSecondTab.push(...rows.map((r) => r.id)));
    watch.subscribe("cy", (rows) => cy.push(...rows.map((r) => r.id)));

    await watch.tick();

    expect(ada).toEqual(["a1"]);
    expect(adaSecondTab).toEqual(["a1"]);
    expect(cy).toEqual(["c1"]);
  });

  it("stops reading for a participant whose last stream closed, and stops ticking when none are open", async () => {
    const world = fakeWorld([{ id: "a1", participantId: "ada", verdict: "AC", score: 100 }]);
    const watch = new VerdictWatch(world.deps);
    const calls: number[] = [];
    const unsubscribe = watch.subscribe("ada", () => calls.push(1));
    unsubscribe();
    unsubscribe();

    await watch.tick();

    expect(watch.watchedParticipantCount()).toBe(0);
    expect(world.calls.reads).toBe(0);
    expect(calls).toEqual([]);
  });
});

describe("latency", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a verdict the judge finishes reaches the student's listener within one tick", async () => {
    const world = fakeWorld([pending("s1", "ada")]);
    const watch = new VerdictWatch(world.deps);
    const verdicts: (string | null)[] = [];
    const unsubscribe = watch.subscribe("ada", (rows) => verdicts.push(rows[0]?.verdict ?? null));

    await vi.advanceTimersByTimeAsync(WATCH_TICK_MS);
    expect(verdicts).toEqual([null]);

    world.finished.add("s1");
    await vi.advanceTimersByTimeAsync(WATCH_TICK_MS);
    expect(verdicts).toEqual([null, "AC"]);

    unsubscribe();
    await vi.advanceTimersByTimeAsync(WATCH_TICK_MS * 5);
    expect(world.calls.reads).toBe(3);
  });

  it("ticks at most once a second, so a 1 s tick is the bound", () => {
    expect(WATCH_TICK_MS).toBeLessThanOrEqual(1_000);
  });
});

describe("verdictFrames sends what the per-stream poll sent", () => {
  const ada = {
    kind: "competitor" as const,
    participantId: "ada",
    contestId: "c1",
    displayName: "Ada",
    sessionId: "sess",
    userId: null,
  };

  it("skips pending rows, announces a verdict once, and again when an override changes it", async () => {
    const announced = new Map<string, string>([["old", "AC:100"]]);
    const now = new Date();
    views.set("s1", { verdict: "WA", score: 0 });

    const rows: WatchedSubmission[] = [
      { id: "old", participantId: "ada", verdict: "AC", score: 100 },
      { id: "s1", participantId: "ada", verdict: "WA", score: 0 },
      { id: "s2", participantId: "ada", verdict: null, score: 0 },
    ];
    const first = await verdictFrames(ada, rows, announced, now);
    expect(first).toHaveLength(1);
    expect(first[0]).toContain('"submissionId":"s1"');

    expect(await verdictFrames(ada, rows, announced, now)).toEqual([]);

    views.set("s1", { verdict: "AC", score: 100 });
    const overridden = rows.map((r) => (r.id === "s1" ? { ...r, verdict: "AC", score: 100 } : r));
    const second = await verdictFrames(ada, overridden, announced, now);
    expect(second).toHaveLength(1);
    expect(second[0]).toContain('"verdict":"AC"');
  });

  it("two overlapping ticks cannot announce the same verdict twice", async () => {
    const announced = new Map<string, string>();
    views.set("s9", { verdict: "AC", score: 100 });
    const rows: WatchedSubmission[] = [{ id: "s9", participantId: "ada", verdict: "AC", score: 100 }];
    const [a, b] = await Promise.all([
      verdictFrames(ada, rows, announced, new Date()),
      verdictFrames(ada, rows, announced, new Date()),
    ]);
    expect(a.length + b.length).toBe(1);
  });
});
