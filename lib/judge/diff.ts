import { DIFF_SNIPPET_MAX_CHARS } from "@/lib/schemas/judge";

/**
 * Diff snippets for a wrong answer.
 *
 * This is the file where a careless change leaks the hidden test data. Students will diff
 * their way to it if you let them (docs/PRD.md §7.2), so:
 *
 *  - Sample cases may show a full diff. They are published anyway.
 *  - Hidden cases get **nothing but the fact that they failed**. Not a truncated expected
 *    value, not a length, not a first-differing-character index — each of those is an oracle
 *    that can be queried repeatedly until the whole case is reconstructed.
 *
 * The 200-character cap applies to what we store even for samples, so an accidental
 * multi-megabyte diff cannot end up in the database or on the wire.
 */

/** Trim to the cap, marking that truncation happened so nobody mistakes it for the whole. */
function cap(text: string): string {
  if (text.length <= DIFF_SNIPPET_MAX_CHARS) return text;
  return `${text.slice(0, DIFF_SNIPPET_MAX_CHARS - 1)}…`;
}

function firstDifferingLine(actual: string, expected: string): number {
  const a = actual.split("\n");
  const e = expected.split("\n");
  const limit = Math.max(a.length, e.length);
  for (let i = 0; i < limit; i += 1) {
    if (a[i] !== e[i]) return i + 1;
  }
  return 0;
}

/**
 * Build the snippet to store for a failing test.
 *
 * @param isSample whether the student may see the expected output at all.
 */
export function buildDiffSnippet(
  actual: string,
  expected: string,
  isSample: boolean,
): string | null {
  if (!isSample) {
    // Hidden case: pass/fail and timing only. Nothing derived from `expected` may appear
    // here — not even indirectly.
    return null;
  }

  const line = firstDifferingLine(actual, expected);
  const header = line > 0 ? `line ${line}` : "output";
  return cap(`${header}\n  expected: ${expected.trim()}\n  actual:   ${actual.trim()}`);
}

/**
 * Snippet for a runtime or compile failure. Compile errors are returned verbatim to the
 * student (PRD §7.2) — the compiler is talking about their own code, so nothing leaks.
 */
export function buildErrorSnippet(stderr: string): string {
  return cap(stderr.trim());
}
