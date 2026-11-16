import type { Comparator } from "@/lib/schemas/judge";

/**
 * Output comparison strategies (docs/PRD.md §7.2).
 *
 * The default is whitespace-normalized: PRD defines `AC` as "stdout matches expected after
 * trailing-whitespace normalization". Being stricter than that fails correct solutions over
 * a trailing newline, which is the fastest way to lose a student's trust in the judge.
 */

/**
 * Trailing whitespace on each line, plus trailing blank lines, plus CRLF, are all
 * insignificant. Leading whitespace is NOT — indentation can be part of a correct answer.
 *
 * Exactly the chained definition kept in comparators.normalize.test.ts, in one pass: lines are
 * found with a native indexOf and only each line's end is examined. The chained version's per-line
 * `/[ \t]+$/` is quadratic in a run of blanks that does not end the line: 17.7 s for one line of
 * 200,000 spaces and an "x", on the worker's event loop, and the output cap allows a megabyte.
 */
function normalize(text: string): string {
  const lines: string[] = [];
  const n = text.length;
  let start = 0;
  while (start <= n) {
    // indexOf is a native scan; only each line's END is then looked at character by character.
    const found = text.indexOf("\n", start);
    const i = found === -1 ? n : found;
    let end = i;
    // A CR directly before an LF is the CRLF pair, and only that one CR goes.
    if (i < n && end > start && text.charCodeAt(end - 1) === CR) end -= 1;
    while (end > start) {
      const c = text.charCodeAt(end - 1);
      if (c !== SPACE && c !== TAB) break;
      end -= 1;
    }
    lines.push(text.slice(start, end));
    start = i + 1;
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

const CR = 13;
const SPACE = 32;
const TAB = 9;

/** Exposed for the equivalence test only. */
export const normalizeForTest = (text: string): string => normalize(text);

function tokenize(text: string): string[] {
  return normalize(text).split(/\s+/).filter((t) => t.length > 0);
}

/** Compare token-wise, allowing numeric tokens to differ by up to `epsilon`. */
function compareFloat(actual: string, expected: string, epsilon: number): boolean {
  const a = tokenize(actual);
  const e = tokenize(expected);
  if (a.length !== e.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    const actualToken = a[i];
    const expectedToken = e[i];
    if (actualToken === undefined || expectedToken === undefined) return false;
    if (actualToken === expectedToken) continue;

    const actualNumber = Number(actualToken);
    const expectedNumber = Number(expectedToken);
    if (Number.isNaN(actualNumber) || Number.isNaN(expectedNumber)) return false;
    if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false;
    if (Math.abs(actualNumber - expectedNumber) > epsilon) return false;
  }

  return true;
}

/**
 * A special judge for problems with multiple valid answers. Registered by checker
 * reference; none ship yet.
 */
export type SpecialChecker = (actual: string, input: string) => boolean;

const specialCheckers = new Map<string, SpecialChecker>();

export function registerSpecialChecker(ref: string, checker: SpecialChecker): void {
  specialCheckers.set(ref, checker);
}

/** Exposed for tests; not part of the judging path. */
export function clearSpecialCheckers(): void {
  specialCheckers.clear();
}

export class UnknownCheckerError extends Error {
  constructor(ref: string) {
    super(`No special checker registered for "${ref}"`);
    this.name = "UnknownCheckerError";
  }
}

/**
 * True when `actual` is an acceptable answer.
 *
 * @throws UnknownCheckerError when a `special` comparator names a checker that is not
 * registered. Deliberately throws rather than returning false: silently marking every
 * submission wrong because of a configuration mistake would look like a hard problem, not
 * a broken one. The caller turns this into `IE`, which alerts an admin.
 */
export function matches(
  comparator: Comparator,
  actual: string,
  expected: string,
  input = "",
): boolean {
  switch (comparator.kind) {
    case "exact":
      return actual === expected;
    // Identical strings normalize identically, so an exact match is an answer without building
    // two normalized copies. Most accepted outputs are byte-identical to the expected file.
    case "whitespace":
      return actual === expected || normalize(actual) === normalize(expected);
    case "float":
      return actual === expected || compareFloat(actual, expected, comparator.epsilon);
    case "special": {
      const checker = specialCheckers.get(comparator.checkerRef);
      if (checker === undefined) throw new UnknownCheckerError(comparator.checkerRef);
      return checker(actual, input);
    }
  }
}

export const DEFAULT_COMPARATOR: Comparator = { kind: "whitespace" };
