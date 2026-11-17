import { describe, expect, it } from "vitest";

import {
  clampSplit,
  parseLayout,
  parseSplit,
  SPLIT_DEFAULT,
  SPLIT_MAX,
  SPLIT_MIN,
  SPLIT_MIN_HEIGHT_PX,
  splitAfterKey,
  splitBoxFor,
  splitFromPointer,
} from "@/components/contest/problem/split-layout";

describe("parseLayout", () => {
  it("reads both stored layouts", () => {
    expect(parseLayout("side")).toBe("side");
    expect(parseLayout("stacked")).toBe("stacked");
  });

  it("falls back to stacked for nothing or anything else", () => {
    expect(parseLayout(null)).toBe("stacked");
    expect(parseLayout("")).toBe("stacked");
    expect(parseLayout("Side")).toBe("stacked");
  });
});

describe("clampSplit and parseSplit", () => {
  it("keeps each pane between 30% and 70%", () => {
    expect(clampSplit(10)).toBe(SPLIT_MIN);
    expect(clampSplit(95)).toBe(SPLIT_MAX);
    expect(clampSplit(42.4)).toBe(42);
  });

  it("treats a non-number as the default rather than an edge", () => {
    expect(clampSplit(Number.NaN)).toBe(SPLIT_DEFAULT);
    expect(clampSplit(Number.POSITIVE_INFINITY)).toBe(SPLIT_DEFAULT);
    expect(parseSplit("banana")).toBe(SPLIT_DEFAULT);
    expect(parseSplit(null)).toBe(SPLIT_DEFAULT);
    expect(parseSplit("  ")).toBe(SPLIT_DEFAULT);
  });

  it("clamps a stored value that was written out of range", () => {
    expect(parseSplit("62")).toBe(62);
    expect(parseSplit("5")).toBe(SPLIT_MIN);
  });
});

describe("splitFromPointer", () => {
  it("measures from the split box's left edge", () => {
    expect(splitFromPointer(600, 100, 1000)).toBe(50);
    expect(splitFromPointer(400, 100, 1000)).toBe(30);
  });

  it("clamps past either edge, and survives a box with no width", () => {
    expect(splitFromPointer(0, 100, 1000)).toBe(SPLIT_MIN);
    expect(splitFromPointer(5000, 100, 1000)).toBe(SPLIT_MAX);
    expect(splitFromPointer(300, 100, 0)).toBe(SPLIT_DEFAULT);
  });
});

describe("splitAfterKey", () => {
  it("steps with the arrows and stops at the bounds", () => {
    expect(splitAfterKey(50, "ArrowLeft")).toBe(45);
    expect(splitAfterKey(50, "ArrowRight")).toBe(55);
    expect(splitAfterKey(32, "ArrowLeft")).toBe(SPLIT_MIN);
    expect(splitAfterKey(68, "ArrowRight")).toBe(SPLIT_MAX);
  });

  it("jumps to the bounds with Home and End", () => {
    expect(splitAfterKey(50, "Home")).toBe(SPLIT_MIN);
    expect(splitAfterKey(50, "End")).toBe(SPLIT_MAX);
  });

  it("leaves every other key to the page", () => {
    expect(splitAfterKey(50, "ArrowUp")).toBeNull();
    expect(splitAfterKey(50, "Tab")).toBeNull();
  });
});

describe("splitBoxFor", () => {
  it("widens past the content column to a 16px gutter and fills the window below its top", () => {
    const box = splitBoxFor({
      viewportWidth: 1440,
      viewportHeight: 900,
      columnWidth: 1120,
      topInDocument: 240,
    });
    expect(box.bleed).toBe(144);
    expect(box.height).toBe(900 - 240 - 16);
  });

  it("never narrows the column, and keeps a floor on a short window", () => {
    const box = splitBoxFor({
      viewportWidth: 1024,
      viewportHeight: 500,
      columnWidth: 1100,
      topInDocument: 300,
    });
    expect(box.bleed).toBe(0);
    expect(box.height).toBe(SPLIT_MIN_HEIGHT_PX);
  });
});
