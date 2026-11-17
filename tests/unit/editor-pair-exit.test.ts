import { describe, expect, it } from "vitest";

import { handleKey, profileFor, type KeyInput, type LanguageProfile } from "@/components/contest/editor/smart";
import { exitableCloserAt, pairCreatedBy, prunePairs, type PairStack } from "@/components/contest/editor/smart/pair-exit";

/**
 * Tab out of an auto-inserted closer only while the caret has stayed inside that pair.
 */

function java(): LanguageProfile {
  const profile = profileFor("JAVA_21");
  if (profile === null) throw new Error("no Java profile");
  return profile;
}

function tab(exitCloserAt: number | null | undefined): KeyInput {
  const base = { key: "Tab", isMac: false, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
  return exitCloserAt === undefined ? base : { ...base, exitCloserAt };
}

describe("pairCreatedBy", () => {
  it("records an opener and its closer typed together with the caret between", () => {
    const pair = pairCreatedBy({ from: 1, to: 1, insert: "()", selectionStart: 2, selectionEnd: 2 }, "f()");
    expect(pair).toEqual({ opener: 1, closerFromEnd: 1, openChar: "(", closeChar: ")" });
  });

  it("records a completion that writes `name()` with the caret inside", () => {
    const pair = pairCreatedBy({ from: 0, to: 2, insert: "size()", selectionStart: 5, selectionEnd: 5 }, "size()");
    expect(pair?.opener).toBe(4);
  });

  it("ignores edits that are not a fresh pair", () => {
    expect(pairCreatedBy({ from: 0, to: 0, insert: "a", selectionStart: 1, selectionEnd: 1 }, "a")).toBeNull();
    expect(pairCreatedBy({ from: 0, to: 0, insert: "(]", selectionStart: 1, selectionEnd: 1 }, "(]")).toBeNull();
    expect(pairCreatedBy({ from: 0, to: 0, insert: "()", selectionStart: 0, selectionEnd: 2 }, "()")).toBeNull();
  });
});

describe("prunePairs and exitableCloserAt", () => {
  const pair = { opener: 1, closerFromEnd: 1, openChar: "(", closeChar: ")" } as const;

  it("keeps a pair while typing inside it, and offers its closer at the caret", () => {
    // "f()" became "f(abc)" by typing; the caret sits before ")".
    const kept = prunePairs([pair], "f(abc)", 5, 5);
    expect(kept).toHaveLength(1);
    expect(exitableCloserAt(kept, "f(abc)", 5)).toBe(5);
    expect(exitableCloserAt(kept, "f(abc)", 3)).toBeNull();
  });

  it("forgets a pair the caret left, for good", () => {
    const left = prunePairs([pair], "f()", 3, 3);
    expect(left).toEqual([]);
    // Coming back does not bring it back: the pair is gone from the stack.
    expect(exitableCloserAt(prunePairs(left, "f()", 2, 2), "f()", 2)).toBeNull();
  });

  it("forgets a pair whose bracket was deleted, and every pair when text is selected", () => {
    expect(prunePairs([pair], "f(", 2, 2)).toEqual([]);
    expect(prunePairs([pair], "f()", 1, 2)).toEqual([]);
  });

  it("steps out of nested pairs innermost first", () => {
    // "f(a[i])", caret after "i".
    const text = "f(a[i])";
    const stack: PairStack = [
      { opener: 1, closerFromEnd: 1, openChar: "(", closeChar: ")" },
      { opener: 3, closerFromEnd: 2, openChar: "[", closeChar: "]" },
    ];
    expect(exitableCloserAt(prunePairs(stack, text, 5, 5), text, 5)).toBe(5);
    const afterFirst = prunePairs(stack, text, 6, 6);
    expect(afterFirst).toHaveLength(1);
    expect(exitableCloserAt(afterFirst, text, 6)).toBe(6);
  });
});

describe("Tab in the engine", () => {
  const state = { text: "f(x)", selectionStart: 3, selectionEnd: 3 };

  it("steps over the tracked closer", () => {
    expect(handleKey(state, tab(3), java())).toMatchObject({ selectionStart: 4, selectionEnd: 4, insert: "" });
  });

  it("does not step over a closer the editor is not tracking", () => {
    expect(handleKey(state, tab(null), java())).toBeNull();
  });

  it("keeps the line-ending rule for callers that track nothing", () => {
    expect(handleKey(state, tab(undefined), java())).toMatchObject({ selectionStart: 4 });
  });
});
