import { describe, expect, it } from "vitest";

import {
  nextTabId,
  rotationHold,
  rotationNote,
  ROTATE_MS,
} from "@/components/leaderboard/division-rotation";

/**
 * The projector stayed on the first division forever. The night has two divisions and one wall,
 * so half the room never saw its own board. These pin when the wall moves and what it says.
 */

const FREE = { pinned: false, tabCount: 2, chosenRecently: false, breakdownOpen: false };

describe("rotationHold", () => {
  it("rotates two or more divisions when nothing holds it", () => {
    expect(rotationHold(FREE)).toBeNull();
    expect(rotationHold({ ...FREE, tabCount: 3 })).toBeNull();
  });

  it("never rotates a ?division= kiosk URL", () => {
    expect(rotationHold({ ...FREE, pinned: true })).toBe("pinned");
  });

  it("has nothing to rotate with one division or none", () => {
    expect(rotationHold({ ...FREE, tabCount: 1 })).toBe("single");
    expect(rotationHold({ ...FREE, tabCount: 0 })).toBe("single");
  });

  it("holds while the viewer has just chosen a tab, or a breakdown is open", () => {
    expect(rotationHold({ ...FREE, chosenRecently: true })).toBe("chosen");
    expect(rotationHold({ ...FREE, breakdownOpen: true })).toBe("breakdown");
  });
});

describe("nextTabId", () => {
  it("advances and wraps", () => {
    expect(nextTabId(["a", "b", "c"], "a")).toBe("b");
    expect(nextTabId(["a", "b", "c"], "c")).toBe("a");
  });

  it("restarts at the first tab when the current one has vanished", () => {
    expect(nextTabId(["a", "b"], "gone")).toBe("a");
    expect(nextTabId(["a", "b"], null)).toBe("a");
  });

  it("has nothing to move to with no tabs", () => {
    expect(nextTabId([], "a")).toBeNull();
  });
});

describe("rotationNote", () => {
  it("says the wall rotates, and how often, while it does", () => {
    expect(ROTATE_MS).toBe(20_000);
    expect(rotationNote(null)).toBe("Divisions rotate every 20 seconds.");
  });

  it("says rotation is paused, and why, while it is held by the viewer", () => {
    expect(rotationNote("chosen")).toMatch(/^Rotation paused\./);
    expect(rotationNote("breakdown")).toMatch(/^Rotation paused while/);
  });

  it("says nothing about rotating on a wall that never rotates", () => {
    expect(rotationNote("pinned")).toBeNull();
    expect(rotationNote("single")).toBeNull();
  });
});
