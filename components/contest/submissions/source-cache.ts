"use client";

/**
 * Remembers the source a student submitted, keyed by submission id.
 *
 * This exists because of a gap in the frozen contract: `SubmissionViewSchema` carries the
 * verdict, the score and the per-test results, but **not the source code** — while PRD §9.1
 * asks "My submissions" for "full history with code, verdict, and score". The request to add
 * a `sourceCode` field is in the report.
 *
 * Until then this is an honest stopgap, not a substitute: it covers submissions made in this
 * tab, and the history says plainly when it cannot show the code rather than rendering an
 * empty box. `sessionStorage`, like every other identity-adjacent thing here, because the
 * machines are shared.
 */

const PREFIX = "ptcn.source.";

export function rememberSource(submissionId: string, sourceCode: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${PREFIX}${submissionId}`, sourceCode);
  } catch {
    // Quota. The history degrades to "code not available", which it already handles.
  }
}

export function recallSource(submissionId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(`${PREFIX}${submissionId}`);
}
