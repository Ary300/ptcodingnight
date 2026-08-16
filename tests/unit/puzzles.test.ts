import { describe, expect, it } from "vitest";

import { checkSudoku, normalizePuzzleAnswer } from "@/lib/contest/puzzles";

/**
 * The two pure halves of puzzle marking.
 *
 * Both are the sole definition of "right answer" for their kind of puzzle, so a bug here is a
 * student told they are wrong when they are not. That is the failure worth spending tests on:
 * unlike a judged problem there is no verdict panel, no diff and no re-run to appeal to.
 */

describe("normalizePuzzleAnswer", () => {
  it("forgives the noise a person adds by accident", () => {
    // Case, outer spaces and runs of inner space are all typing, not answering.
    expect(normalizePuzzleAnswer("  Cider   Store ")).toBe("cider store");
    expect(normalizePuzzleAnswer("PANTHERS")).toBe("panthers");
    expect(normalizePuzzleAnswer("cider\tstore")).toBe("cider store");
  });

  it("is idempotent, which is what lets the key be stored normalised", () => {
    // The seed stores the key through this function and the checker runs it on the attempt. If
    // it were not idempotent, a stored key would fail to match its own answer forever, and it
    // would fail SILENTLY: the puzzle would simply be unsolvable.
    const once = normalizePuzzleAnswer(" Kylie  Oliver Navraj Dominic ");
    expect(normalizePuzzleAnswer(once)).toBe(once);
  });

  it("does not fold anything that changes the answer", () => {
    // Digits and inner punctuation are content. "228" must not match "22 8".
    expect(normalizePuzzleAnswer("228")).not.toBe(normalizePuzzleAnswer("22 8"));
  });
});

describe("checkSudoku", () => {
  const givens =
    "530070000" +
    "600195000" +
    "098000060" +
    "800060003" +
    "400803001" +
    "700020006" +
    "060000280" +
    "000419005" +
    "000080079";

  const solution =
    "534678912" +
    "672195348" +
    "198342567" +
    "859761423" +
    "426853791" +
    "713924856" +
    "961537284" +
    "287419635" +
    "345286179";

  it("accepts the completed grid", () => {
    expect(checkSudoku(givens, solution)).toEqual({ ok: true });
  });

  it("accepts a grid typed with the spacing a person would use", () => {
    // The board offers a textarea and students paste rows with line breaks and spaces in them.
    const pretty = (solution.match(/.{9}/g) ?? []).join("\n");
    expect(checkSudoku(givens, pretty)).toEqual({ ok: true });
  });

  it("refuses a grid that is not finished, and says which problem it is", () => {
    const shortGrid = checkSudoku(givens, solution.slice(0, 80));
    expect(shortGrid.ok).toBe(false);
    const blank = checkSudoku(givens, `0${solution.slice(1)}`);
    expect(blank).toEqual({ ok: false, reason: "Some squares are still empty." });
  });

  it("refuses a grid that overwrites a printed number", () => {
    // The givens are part of the puzzle. Changing one is a different puzzle, solved.
    const tampered = `9${solution.slice(1)}`;
    const verdict = checkSudoku(givens, tampered);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toContain("printed in the puzzle");
  });

  it("refuses a repeat, and names where it is", () => {
    // Two 5s in row 1: swap a cell for one that already appears in the same row.
    const chars = [...solution];
    chars[8] = chars[0] ?? "5";
    const verdict = checkSudoku(givens, chars.join(""));
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toMatch(/Row|Column|box/);
  });

  it("validates against the givens rather than one stored answer", () => {
    /*
      The property that makes the checker safe on a puzzle nobody verified for uniqueness: it
      never consults a solution, so a second legal completion of a looser grid is accepted too.
      Here an almost-empty grid is completed with a valid Latin-square pattern that no stored
      answer would have matched.
      */
    const emptyish = "0".repeat(81);
    const shifted = Array.from({ length: 9 }, (_unused, row) =>
      Array.from({ length: 9 }, (_u2, col) => {
        // A valid sudoku from a simple band/stack shift.
        const value = ((col + 3 * (row % 3) + Math.floor(row / 3)) % 9) + 1;
        return String(value);
      }).join(""),
    ).join("");
    expect(checkSudoku(emptyish, shifted)).toEqual({ ok: true });
  });
});
