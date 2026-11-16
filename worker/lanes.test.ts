import { describe, expect, it } from "vitest";

import { LaneScheduler } from "./lanes";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("LaneScheduler", () => {
  it("raises the worker's concurrency when a job parks, and lowers it when the parked job ends", () => {
    const seen: number[] = [];
    const lanes = new LaneScheduler({ main: 6, slow: 2, maxParked: 2, onConcurrency: (n) => seen.push(n) });
    const a = lanes.enter();
    expect(lanes.concurrency()).toBe(6);
    expect(a.demote()).toBe(true);
    expect(a.parked).toBe(true);
    expect(lanes.concurrency()).toBe(7);
    expect(a.demote()).toBe(false);
    a.finish();
    expect(lanes.concurrency()).toBe(6);
    expect(seen).toEqual([7, 6]);
  });

  it("keeps a job in its main lane when every parked place is taken", () => {
    const lanes = new LaneScheduler({ main: 6, slow: 2, maxParked: 1 });
    const a = lanes.enter();
    const b = lanes.enter();
    expect(a.demote()).toBe(true);
    expect(b.demote()).toBe(false);
    expect(b.parked).toBe(false);
    expect(lanes.stats()).toMatchObject({ main: 1, parked: 1 });
  });

  it("runs at most `slow` parked tests at once while every main lane is busy", async () => {
    const lanes = new LaneScheduler({ main: 2, slow: 2, maxParked: 4 });
    const parked = [lanes.enter(), lanes.enter(), lanes.enter()];
    for (const p of parked) p.demote();
    lanes.enter();
    lanes.enter(); // both main lanes busy with ordinary jobs
    const got: (() => void)[] = [];
    for (const p of parked) void p.testSlot().then((release) => got.push(release));
    await tick();
    expect(got.length).toBe(2);
    expect(lanes.stats()).toMatchObject({ slowRunning: 2, borrowed: 0, waiting: 1 });
    got[0]?.();
    await tick();
    expect(got.length).toBe(3);
    expect(lanes.stats()).toMatchObject({ slowRunning: 2, waiting: 0 });
  });

  it("lets parked tests borrow main lanes nobody ordinary is using, and hands them back", async () => {
    const lanes = new LaneScheduler({ main: 3, slow: 1, maxParked: 4 });
    const parked = [lanes.enter(), lanes.enter(), lanes.enter()];
    for (const p of parked) p.demote();
    const got: (() => void)[] = [];
    for (const p of parked) void p.testSlot().then((release) => got.push(release));
    await tick();
    // One reserved slot and two idle main lanes.
    expect(got.length).toBe(3);
    expect(lanes.stats()).toMatchObject({ slowRunning: 1, borrowed: 2 });
    // An ordinary job arrives: borrowed lanes are not pre-empted, but no new borrow is allowed
    // beyond what is free.
    lanes.enter();
    for (const release of got) release();
    const more: (() => void)[] = [];
    for (const p of parked) void p.testSlot().then((release) => more.push(release));
    await tick();
    expect(lanes.stats()).toMatchObject({ main: 1, slowRunning: 1, borrowed: 2 });
    expect(more.length).toBe(3);
  });

  it("releases a slot once however often its release is called", async () => {
    const lanes = new LaneScheduler({ main: 1, slow: 1, maxParked: 2 });
    lanes.enter(); // the main lane is busy
    const p = lanes.enter();
    p.demote();
    const release = await p.testSlot();
    release();
    release();
    expect(lanes.stats().slowRunning).toBe(0);
  });
});
