import { describe, expect, it } from "vitest";

import {
  findAll,
  initialQuery,
  matchAtOrAfter,
  matchCountLabel,
  offsetOf,
  parseLineColumn,
  replaceAll,
  replaceOne,
  stepMatch,
  wordAt,
} from "@/components/contest/editor/commands/find";
import { layerPieces } from "@/components/contest/editor/commands/MatchLayer";

/** Find, Replace and Go to Line as pure text operations. */

function apply(text: string, edit: { from: number; to: number; insert: string }): string {
  return text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
}

describe("findAll", () => {
  const text = "int count = 0;\ncount++;\nCount the counter";

  it("ignores case unless asked", () => {
    expect(findAll(text, "count", { caseSensitive: false, wholeWord: false })).toHaveLength(4);
    expect(findAll(text, "count", { caseSensitive: true, wholeWord: false })).toHaveLength(3);
  });

  it("matches whole words only when asked", () => {
    expect(findAll(text, "count", { caseSensitive: false, wholeWord: true })).toEqual([
      [4, 9],
      [15, 20],
      [24, 29],
    ]);
  });

  it("finds nothing for an empty query", () => {
    expect(findAll(text, "", { caseSensitive: false, wholeWord: false })).toEqual([]);
  });

  it("never overlaps matches", () => {
    expect(findAll("aaaa", "aa", { caseSensitive: true, wholeWord: false })).toEqual([
      [0, 2],
      [2, 4],
    ]);
  });
});

describe("stepping through matches", () => {
  it("starts at the first match at or after the caret, wrapping to the first", () => {
    const matches = [
      [2, 4],
      [10, 12],
    ] as const;
    expect(matchAtOrAfter(matches, 5)).toBe(1);
    expect(matchAtOrAfter(matches, 11)).toBe(0);
    expect(matchAtOrAfter([], 0)).toBe(-1);
  });

  it("wraps around in both directions", () => {
    expect(stepMatch(3, 2, 1)).toBe(0);
    expect(stepMatch(3, 0, -1)).toBe(2);
    expect(stepMatch(0, 0, 1)).toBe(-1);
  });

  it("labels the count the way the bar shows it", () => {
    expect(matchCountLabel(12, 2)).toBe("3 of 12");
    expect(matchCountLabel(0, -1)).toBe("No results");
  });
});

describe("replace", () => {
  it("replaces one match and selects the replacement", () => {
    const edit = replaceOne([4, 9], "total");
    expect(apply("int count = 0;", edit)).toBe("int total = 0;");
    expect([edit.selectionStart, edit.selectionEnd]).toEqual([4, 9]);
  });

  it("replaces every match as one edit", () => {
    const text = "a = a + b * a";
    const matches = findAll(text, "a", { caseSensitive: true, wholeWord: true });
    const edit = replaceAll(text, matches, "sum");
    expect(edit).not.toBeNull();
    if (edit === null) return;
    expect(apply(text, edit)).toBe("sum = sum + b * sum");
  });

  it("has nothing to replace when nothing matches", () => {
    expect(replaceAll("x", [], "y")).toBeNull();
  });
});

describe("the find field's first query", () => {
  it("is the selection on one line", () => {
    expect(initialQuery("int total = 0;", 4, 9)).toBe("total");
  });

  it("is empty for a selection across lines", () => {
    expect(initialQuery("a\nb", 0, 3)).toBe("");
  });

  it("is the word at the caret", () => {
    expect(initialQuery("int total = 0;", 6, 6)).toBe("total");
    expect(wordAt("a + b", 2)).toBeNull();
  });
});

describe("go to line", () => {
  it("parses line and line:column", () => {
    expect(parseLineColumn("12")).toEqual({ line: 12, column: 1 });
    expect(parseLineColumn(" 3:7 ")).toEqual({ line: 3, column: 7 });
    expect(parseLineColumn("3,7")).toEqual({ line: 3, column: 7 });
    expect(parseLineColumn("0")).toBeNull();
    expect(parseLineColumn("x")).toBeNull();
  });

  it("clamps to the text", () => {
    const text = "ab\ncdef\ng";
    expect(offsetOf(text, 2, 3)).toBe(5);
    expect(offsetOf(text, 2, 99)).toBe(7);
    expect(offsetOf(text, 99, 1)).toBe(8);
    expect(offsetOf(text, 1, 1)).toBe(0);
  });
});

describe("the match layer", () => {
  it("reproduces the text exactly, cut at each mark", () => {
    const text = "a = a + b";
    const pieces = layerPieces(text, [[0, 1], [4, 5]], 1, []);
    const joined = pieces.map((piece) => (piece.kind === "caret" ? "" : piece.value)).join("");
    expect(joined).toBe(text);
    expect(pieces.filter((piece) => piece.kind === "mark" && piece.current)).toHaveLength(1);
  });

  it("draws extra carets without adding text", () => {
    const pieces = layerPieces("abc", [], -1, [1]);
    expect(pieces.map((piece) => piece.kind)).toEqual(["text", "caret", "text"]);
  });
});
