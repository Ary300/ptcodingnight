import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseSeedRows, type SeedRow } from "@/lib/schemas/seed";
import { mergeRows } from "@/lib/seed/merge";

/**
 * Runs the real dedup against the real data/problems_seed.csv, with no database.
 *
 * These numbers are the ones docs/PRD.md §16 states. If someone changes the dedup key or
 * edits the CSV, this test is what tells them the problem bank changed shape.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const CSV = path.join(ROOT, "data", "problems_seed.csv");

function loadRows(): SeedRow[] {
  const text = readFileSync(CSV, "utf8").replace(/\r\n/g, "\n").trim();
  const [headerLine, ...lines] = text.split("\n");
  if (headerLine === undefined) throw new Error("seed csv is empty");
  const headers = headerLine.split(",").map((h) => h.trim());

  return parseSeedRows(
    lines.map((line) => {
      const cells = line.split(",");
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = (cells[i] ?? "").trim();
      });
      return row;
    }),
  );
}

describe("seed merge against the real CSV", () => {
  const rows = loadRows();
  const merged = mergeRows(rows);

  it("reads 136 rows", () => {
    expect(rows).toHaveLength(136);
  });

  it("collapses them to 125 distinct problems", () => {
    expect(merged).toHaveLength(125);
  });

  it("produces a unique slug per problem, which the DB requires", () => {
    const slugs = merged.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("matches the per-type distinct counts in PRD §16", () => {
    const count = (type: string) => merged.filter((p) => p.type === type).length;

    // 63 + 60 + 2 = 125. The group total is 2 rather than the 3 distinct group TITLES,
    // because Fraudulent Activity Notifications also appears as an `algorithm` row and
    // merges into that record. It keeps isGroupProblem = true, which is the field that
    // actually drives hint behaviour — see the dedicated test below. PRD §16 documents
    // this overlap.
    expect(count("ALGORITHM")).toBe(63);
    expect(count("CODINGBAT")).toBe(60);
    expect(count("GROUP")).toBe(2);
    expect(count("ALGORITHM") + count("CODINGBAT") + count("GROUP")).toBe(125);
  });

  it("keeps both sum67 warmups, one per language", () => {
    const sum67 = merged.filter((p) => p.title === "sum67");
    expect(sum67).toHaveLength(2);
    expect(sum67.map((p) => p.language).sort()).toEqual(["JAVA", "PYTHON"]);
  });

  it("merges Bill Division across two divisions into one problem", () => {
    const billDivision = merged.filter((p) => p.title === "Bill Division");
    expect(billDivision).toHaveLength(1);
    expect(billDivision[0]?.rows).toHaveLength(2);
  });

  it("keeps the used-but-zero-points warning on the group-round Fraudulent entry", () => {
    // The row this test exists for: three rows, two types, and the flag PRD §8 most wants
    // surfaced would be lost if the merge just took the last value it saw.
    const fraudulent = merged.filter((p) => p.title === "Fraudulent Activity Notifications");

    expect(fraudulent).toHaveLength(1);
    expect(fraudulent[0]?.rows).toHaveLength(3);
    expect(fraudulent[0]?.isGroupProblem).toBe(true);
    expect(fraudulent[0]?.pastStatus).toBe("USED_BUT_ZERO_POINTS");
  });

  it("marks all three group-round problems as group problems", () => {
    const group = merged.filter((p) => p.isGroupProblem);
    expect(group.map((p) => p.title).sort()).toEqual([
      "Cards Permutation",
      "Fraudulent Activity Notifications",
      "Insertion Sort Advanced Analysis",
    ]);
  });

  it("finds the 20 solved-in-past problems Phase 4 must author", () => {
    const solved = merged.filter((p) => p.pastStatus === "SOLVED_IN_PAST");
    expect(solved).toHaveLength(20);
  });

  it("is idempotent — merging twice yields the same shape", () => {
    const again = mergeRows(rows);
    expect(again.map((p) => p.slug).sort()).toEqual(merged.map((p) => p.slug).sort());
  });
});
