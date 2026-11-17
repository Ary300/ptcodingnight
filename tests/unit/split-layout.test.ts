import { describe, expect, it } from "vitest";

import {
  clampSplit,
  parseLayout,
  parseSplit,
  resolveLayout,
  SPLIT_DEFAULT,
  SPLIT_MAX,
  SPLIT_MIN,
  splitAfterKey,
  splitFromPointer,
} from "@/components/contest/problem/split-layout";
import { resultsSummary, type ResultsSummaryInput } from "@/components/contest/problem/results-summary";

describe("parseLayout", () => {
  it("reads both stored layouts", () => {
    expect(parseLayout("side")).toBe("side");
    expect(parseLayout("stacked")).toBe("stacked");
  });

  it("reads nothing or anything else as no choice", () => {
    expect(parseLayout(null)).toBeNull();
    expect(parseLayout("")).toBeNull();
    expect(parseLayout("Side")).toBeNull();
  });
});

describe("resolveLayout", () => {
  it("is always stacked below 1024px, whatever was chosen", () => {
    expect(resolveLayout({ choice: "side", wide: false, roomy: false })).toBe("stacked");
    expect(resolveLayout({ choice: null, wide: false, roomy: false })).toBe("stacked");
  });

  it("defaults to side by side from 1280px and stacked between 1024 and 1280", () => {
    expect(resolveLayout({ choice: null, wide: true, roomy: true })).toBe("side");
    expect(resolveLayout({ choice: null, wide: true, roomy: false })).toBe("stacked");
  });

  it("keeps the student's choice wherever two panes fit", () => {
    expect(resolveLayout({ choice: "stacked", wide: true, roomy: true })).toBe("stacked");
    expect(resolveLayout({ choice: "side", wide: true, roomy: false })).toBe("side");
  });
});

describe("clampSplit and parseSplit", () => {
  it("defaults the statement to 40% and keeps each pane between 25% and 75%", () => {
    expect(SPLIT_DEFAULT).toBe(40);
    expect(SPLIT_MIN).toBe(25);
    expect(SPLIT_MAX).toBe(75);
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
    expect(splitAfterKey(27, "ArrowLeft")).toBe(SPLIT_MIN);
    expect(splitAfterKey(73, "ArrowRight")).toBe(SPLIT_MAX);
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

describe("resultsSummary", () => {
  const idle: ResultsSummaryInput = {
    action: null,
    error: null,
    sampleBusy: false,
    sampleResults: [],
    submitBusy: false,
    judging: false,
    verdict: null,
  };
  const row = (ordinal: number, verdict: "AC" | "WA") => ({
    ordinal,
    isSample: true,
    verdict,
    runtimeMs: 12,
    diffSnippet: null,
  });

  it("says nothing before the first run, so the header reads just Results", () => {
    expect(resultsSummary(idle)).toBeNull();
  });

  it("counts passing samples, and says when they are still running", () => {
    expect(resultsSummary({ ...idle, action: "samples", sampleBusy: true })).toBe("Running samples");
    expect(
      resultsSummary({ ...idle, action: "samples", sampleResults: [row(1, "AC"), row(2, "WA")] }),
    ).toBe("1 of 2 samples passed");
  });

  it("follows a submission from submitting to its verdict", () => {
    expect(resultsSummary({ ...idle, action: "judged", submitBusy: true })).toBe("Submitting");
    expect(resultsSummary({ ...idle, action: "judged", judging: true })).toBe("Judging");
    expect(resultsSummary({ ...idle, action: "judged", verdict: "AC" })).toBe("Accepted");
    // IE is never a failure to the student.
    expect(resultsSummary({ ...idle, action: "judged", verdict: "IE" })).toBe("Rechecking");
  });

  it("puts an error ahead of everything else", () => {
    expect(resultsSummary({ ...idle, action: "samples", error: "The judge is busy" })).toBe(
      "Did not finish",
    );
  });
});
