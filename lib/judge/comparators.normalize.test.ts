import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { normalizeForTest } from "./comparators";

/** The definition, as the judge wrote it before. Quadratic in a run of blanks; test-only. */
function normalizeReference(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

/**
 * The single-pass `normalize` must equal the chained definition on every input, because it decides
 * AC or WA. Checked on hand-picked edge cases, on every expected output in the repository, and on
 * many random strings over the characters that matter.
 */
describe("normalize", () => {
  const same = (text: string) => expect(normalizeForTest(text), JSON.stringify(text)).toBe(normalizeReference(text));

  it("matches the definition on the edge cases", () => {
    for (const text of [
      "", "\n", "\n\n\n", "\r", "\r\n", "\r\r\n", "\n\r", "a", "a\n", "a\r\n", "a \r\n", "a\r \n", "a\t \t\n",
      " a", "\ta\t", "a\r", "a \r", "a\n\n b \n\n", "a\r\n\r\n", "  \n  \n", "x\r\r", "x\r\r\r\n", "1 2 3\n4 5 6 \n",
      " a \n", "a\f\n", "a\v\n",
    ]) {
      same(text);
    }
  });

  it("matches the definition on every expected output in fixtures and content", () => {
    const root = path.resolve(__dirname, "..", "..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".out")) files.push(full);
      }
    };
    walk(path.join(root, "fixtures"));
    walk(path.join(root, "content", "problems"));
    expect(files.length).toBeGreaterThan(1000);
    for (const file of files) same(readFileSync(file, "utf8"));
  }, 60_000); // Reads every expected output in fixtures and content: about 4 s alone, more beside the full suite.

  it("matches the definition on random strings of newlines, CRs, blanks and text", () => {
    const alphabet = ["\n", "\r", " ", "\t", "a", "b", "1", "\r\n", "  "];
    let seed = 12345;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed;
    };
    for (let k = 0; k < 20000; k += 1) {
      const length = next() % 24;
      let text = "";
      for (let i = 0; i < length; i += 1) text += alphabet[next() % alphabet.length];
      same(text);
    }
  });

  it("is linear in a long run of blanks that does not end the line", () => {
    const text = `${" ".repeat(200_000)}x\n`;
    const started = performance.now();
    normalizeForTest(text);
    expect(performance.now() - started).toBeLessThan(50);
  });
});
