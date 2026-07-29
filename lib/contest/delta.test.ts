import { describe, expect, it } from "vitest";

import { RankSnapshotStore, computeDeltas, ranksOf } from "@/lib/contest/delta";

const START = new Date("2026-07-29T19:00:00.000Z");

function at(ms: number): Date {
  return new Date(START.getTime() + ms);
}

describe("computeDeltas", () => {
  it("reports a climb as positive and a fall as negative", () => {
    const previous = new Map([
      ["p-1", 3],
      ["p-2", 1],
    ]);
    const deltas = computeDeltas(
      [
        { participantId: "p-1", rank: 1 },
        { participantId: "p-2", rank: 2 },
      ],
      previous,
    );

    expect(deltas.get("p-1")).toBe(2);
    expect(deltas.get("p-2")).toBe(-1);
  });

  it("gives a newcomer zero rather than a jump from nowhere", () => {
    const deltas = computeDeltas([{ participantId: "new", rank: 4 }], new Map());
    expect(deltas.get("new")).toBe(0);
  });
});

describe("RankSnapshotStore", () => {
  it("holds the baseline steady inside a tick, so every client sees the same movement", () => {
    const store = new RankSnapshotStore(10_000);
    const first = [
      { participantId: "p-1", rank: 1 },
      { participantId: "p-2", rank: 2 },
    ];
    store.deltasFor("c-1:public", first, at(0));

    const swapped = [
      { participantId: "p-1", rank: 2 },
      { participantId: "p-2", rank: 1 },
    ];

    // Two clients polling a second apart get the same answer; the first does not consume it.
    expect(store.deltasFor("c-1:public", swapped, at(1000)).get("p-2")).toBe(1);
    expect(store.deltasFor("c-1:public", swapped, at(2000)).get("p-2")).toBe(1);
  });

  it("advances the baseline once the tick has elapsed", () => {
    const store = new RankSnapshotStore(10_000);
    const first = [{ participantId: "p-1", rank: 2 }];
    store.deltasFor("c-1:public", first, at(0));

    const moved = [{ participantId: "p-1", rank: 1 }];
    expect(store.deltasFor("c-1:public", moved, at(10_000)).get("p-1")).toBe(1);
    expect(store.deltasFor("c-1:public", moved, at(10_500)).get("p-1")).toBe(0);
  });

  it("keeps the admin and public baselines apart, since a freeze makes them differ", () => {
    const store = new RankSnapshotStore(10_000);
    store.deltasFor("c-1:public", [{ participantId: "p-1", rank: 5 }], at(0));

    // The admin view has never been seen before; it starts at zero rather than borrowing.
    expect(store.deltasFor("c-1:admin", [{ participantId: "p-1", rank: 1 }], at(0)).get("p-1")).toBe(0);
  });

  it("forgets a contest's baselines so an unfreeze reveals real movement", () => {
    const store = new RankSnapshotStore(10_000);
    store.deltasFor("c-1:public", [{ participantId: "p-1", rank: 5 }], at(0));
    store.forget("c-1:");

    expect(store.deltasFor("c-1:public", [{ participantId: "p-1", rank: 1 }], at(0)).get("p-1")).toBe(0);
  });
});

describe("ranksOf", () => {
  it("indexes rows by participant", () => {
    expect(ranksOf([{ participantId: "p-1", rank: 3 }])).toEqual(new Map([["p-1", 3]]));
  });
});
