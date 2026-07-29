import type { PublicTestResult } from "@/lib/schemas/api";

/**
 * The last gate before hidden test data reaches a pixel.
 *
 * `PublicTestResultSchema` has no field that could carry expected output, input, or a hash
 * of either — a leak is not expressible in the type. That leaves exactly one channel open:
 * `diffSnippet` set on a case where `isSample` is false. The contract says that is always
 * null; this function assumes it might not be.
 *
 * Two gates already exist (the worker, then the API edge). This is the third, and it is
 * here because the cost of being wrong is that students diff their way to the test data
 * (PRD §7.2) — and because a UI that trusts its input is the reason third gates exist.
 *
 * A detected leak is a REPORTABLE BUG, not a display quirk. `sanitize` strips it and
 * reports it; it does not quietly render it.
 */

export interface SanitizedResults {
  results: readonly PublicTestResult[];
  /** Ordinals of hidden cases that arrived carrying a diff. Non-empty means a server bug. */
  leakedOrdinals: readonly number[];
}

export function sanitizeTestResults(
  results: readonly PublicTestResult[],
): SanitizedResults {
  const leakedOrdinals: number[] = [];

  const safe = results.map((result) => {
    if (result.isSample || result.diffSnippet === null) return result;

    leakedOrdinals.push(result.ordinal);
    // Strip, never render. Immutable — the original object is left alone.
    return { ...result, diffSnippet: null };
  });

  return { results: safe, leakedOrdinals };
}

/** A sample case is the only case a diff may be shown for. */
export function mayShowDiff(result: PublicTestResult): boolean {
  return result.isSample && result.diffSnippet !== null;
}
