import { describe, expect, it } from "vitest";

import {
  addAllOccurrences,
  addNextOccurrence,
  moveInOccurrences,
  removeOccurrence,
  secondaryCarets,
  startOccurrences,
  typeInOccurrences,
  type OccurrenceSession,
} from "@/components/contest/editor/commands/occurrences";

/**
 * Select Next Occurrence and Select All Occurrences, then typing once to change every picked copy.
 * Each keystroke is ONE edit, so one undo takes it back everywhere.
 */

function apply(text: string, edit: { from: number; to: number; insert: string }): string {
  return text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
}

const TEXT = "int n = 5;\nfor (int i = 0; i < n; i++) sum += n;\nint nn = n;";

function started(caret: number): OccurrenceSession {
  const step = startOccurrences(TEXT, caret, caret);
  if (step === null) throw new Error("no word at the caret");
  return step.session;
}

describe("picking copies", () => {
  it("starts on the word at the caret, selected", () => {
    const step = startOccurrences(TEXT, 4, 4);
    expect(step?.session.word).toBe("n");
    expect([step?.selectionStart, step?.selectionEnd]).toEqual([4, 5]);
  });

  it("starts on nothing when the caret touches no word", () => {
    expect(startOccurrences("a + b", 2, 2)).toBeNull();
  });

  it("adds the next whole-word copy, never part of a longer name", () => {
    const step = addNextOccurrence(TEXT, started(4));
    expect(step.session.ranges).toHaveLength(2);
    expect(TEXT.slice(step.selectionStart, step.selectionEnd)).toBe("n");
    expect(step.session.ranges.every(([start, end]) => TEXT.slice(start, end) === "n")).toBe(true);
  });

  it("adds every copy at once", () => {
    const step = addAllOccurrences(TEXT, started(4));
    // n in `int n`, `i < n`, `+= n` and `= n;`; never the n inside `nn`.
    expect(step.session.ranges).toHaveLength(4);
  });

  it("unselects the last picked copy", () => {
    const two = addNextOccurrence(TEXT, started(4)).session;
    expect(removeOccurrence(two)?.session.ranges).toHaveLength(1);
    expect(removeOccurrence(started(4))).toBeNull();
  });
});

describe("typing into every copy", () => {
  it("replaces every selected copy with the first key, as one edit", () => {
    const all = addAllOccurrences(TEXT, started(4)).session;
    const typed = typeInOccurrences(TEXT, all, { kind: "insert", text: "c" });
    expect(typed).not.toBeNull();
    if (typed === null) return;
    const next = apply(TEXT, typed.edit);
    expect(next).toBe("int c = 5;\nfor (int i = 0; i < c; i++) sum += c;\nint nn = c;");

    const more = typeInOccurrences(next, typed.session, { kind: "insert", text: "t" });
    expect(more).not.toBeNull();
    if (more === null) return;
    expect(apply(next, more.edit)).toBe("int ct = 5;\nfor (int i = 0; i < ct; i++) sum += ct;\nint nn = ct;");
  });

  it("Backspace removes the same character from every copy", () => {
    const text = "ab ab";
    const session: OccurrenceSession = { ranges: [[0, 2], [3, 5]], word: "ab", primary: 0, offset: 2, wholeWord: true };
    const typed = typeInOccurrences(text, session, { kind: "backspace" });
    expect(typed === null ? null : apply(text, typed.edit)).toBe("a a");
  });

  it("Backspace at the start of every copy changes nothing", () => {
    const session: OccurrenceSession = { ranges: [[0, 2]], word: "ab", primary: 0, offset: 0, wholeWord: true };
    expect(typeInOccurrences("ab", session, { kind: "backspace" })).toBeNull();
  });

  it("keeps the real caret in the primary copy", () => {
    const text = "x x x";
    const session: OccurrenceSession = { ranges: [[0, 1], [2, 3], [4, 5]], word: "x", primary: 1, offset: null, wholeWord: true };
    const typed = typeInOccurrences(text, session, { kind: "insert", text: "yy" });
    expect(typed?.edit.selectionStart).toBe(5);
    expect(typed === null ? [] : secondaryCarets(typed.session)).toEqual([2, 8]);
  });
});

describe("moving inside the copies", () => {
  it("Left from a selection goes to the start, and leaving the copy ends the session", () => {
    const session: OccurrenceSession = { ranges: [[0, 2]], word: "ab", primary: 0, offset: null, wholeWord: true };
    const left = moveInOccurrences(session, -1);
    expect(left?.session.offset).toBe(0);
    expect(left === null ? "gone" : moveInOccurrences(left.session, -1)).toBeNull();
  });
});
