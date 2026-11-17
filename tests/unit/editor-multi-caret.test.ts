import { describe, expect, it } from "vitest";

import {
  addCaret,
  applyMultiKey,
  cloneCaret,
  columnSelection,
  secondaryCaretOffsets,
  type MultiCaret,
  type MultiKey,
} from "@/components/contest/editor/commands/multi-caret";

/**
 * Multiple carets: Alt+click, column selection and Clone Caret, and every editing key applied at
 * every caret as one Edit.
 */

function apply(text: string, carets: MultiCaret, key: MultiKey): { text: string; carets: MultiCaret } {
  const result = applyMultiKey(text, carets, key);
  if (result === null) return { text, carets };
  const { edit } = result;
  return { text: text.slice(0, edit.from) + edit.insert + text.slice(edit.to), carets: result.carets };
}

const THREE = "int a;\nint b;\nint c;";

describe("adding carets", () => {
  it("Alt+click adds a caret and makes it the primary", () => {
    const carets = addCaret(null, [0, 0], 7);
    expect(carets.ranges).toEqual([
      [0, 0],
      [7, 7],
    ]);
    expect(carets.primary).toBe(1);
    expect(secondaryCaretOffsets(carets)).toEqual([0]);
  });

  it("Alt+click on an existing caret removes it", () => {
    const two = addCaret(null, [0, 0], 7);
    expect(addCaret(two, [7, 7], 0).ranges).toEqual([[7, 7]]);
  });

  it("Clone Caret Below and Above keep the column, and stop at the edges", () => {
    const below = cloneCaret(THREE, null, [4, 4], 1, 4);
    expect(below.ranges).toEqual([
      [4, 4],
      [11, 11],
    ]);
    const again = cloneCaret(THREE, below, [11, 11], 1, 4);
    expect(again.ranges.map(([at]) => at)).toEqual([4, 11, 18]);
    expect(cloneCaret(THREE, again, [18, 18], 1, 4)).toEqual(again);
    expect(cloneCaret(THREE, null, [4, 4], -1, 4).ranges).toEqual([[4, 4]]);
  });

  it("a column selection takes the same columns on every line, clamped to short lines", () => {
    const text = "abcdef\nab\nabcdef";
    const carets = columnSelection(text, { row: 0, column: 1 }, { row: 2, column: 4 }, 4);
    expect(carets.ranges).toEqual([
      [1, 4],
      [8, 9],
      [11, 14],
    ]);
    expect(carets.primary).toBe(2);
  });
});

describe("editing at every caret", () => {
  const carets: MultiCaret = { ranges: [[4, 4], [11, 11], [18, 18]], primary: 2 };

  it("types at every caret as one edit", () => {
    const result = applyMultiKey(THREE, carets, { kind: "insert", text: "x" });
    expect(result?.edit.from).toBe(4);
    const typed = apply(THREE, carets, { kind: "insert", text: "x" });
    expect(typed.text).toBe("int xa;\nint xb;\nint xc;");
    expect(typed.carets.ranges).toEqual([
      [5, 5],
      [13, 13],
      [21, 21],
    ]);
  });

  it("Backspace and Delete remove one character at every caret", () => {
    expect(apply(THREE, carets, { kind: "backspace" }).text).toBe("inta;\nintb;\nintc;");
    expect(apply(THREE, carets, { kind: "delete" }).text).toBe("int ;\nint ;\nint ;");
  });

  it("Enter breaks every line, keeping its indent", () => {
    const text = "  ab\n  cd";
    const at: MultiCaret = { ranges: [[3, 3], [8, 8]], primary: 1 };
    expect(apply(text, at, { kind: "enter" }).text).toBe("  a\n  b\n  c\n  d");
  });

  it("a paste with one line per caret puts one line at each; otherwise the whole text at every caret", () => {
    expect(apply(THREE, carets, { kind: "paste", text: "1\n2\n3" }).text).toBe("int 1a;\nint 2b;\nint 3c;");
    expect(apply(THREE, carets, { kind: "paste", text: "z" }).text).toBe("int za;\nint zb;\nint zc;");
  });

  it("typing over a column selection replaces each line's slice", () => {
    const text = "abcdef\nab\nabcdef";
    const column = columnSelection(text, { row: 0, column: 1 }, { row: 2, column: 4 }, 4);
    expect(apply(text, column, { kind: "insert", text: "-" }).text).toBe("a-ef\na-\na-ef");
    expect(apply(text, column, { kind: "backspace" }).text).toBe("aef\na\naef");
  });

  it("two carets side by side never delete the same character twice", () => {
    const adjacent: MultiCaret = { ranges: [[2, 2], [3, 3]], primary: 1 };
    expect(apply("abcd", adjacent, { kind: "backspace" }).text).toBe("ad");
  });

  it("does nothing when no caret can change anything", () => {
    expect(applyMultiKey("ab", { ranges: [[0, 0]], primary: 0 }, { kind: "backspace" })).toBeNull();
  });
});
