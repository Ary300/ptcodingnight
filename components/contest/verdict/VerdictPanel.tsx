"use client";

import { useMemo } from "react";

import type { PublicTestResult } from "@/lib/schemas/api";
import type { Verdict } from "@/lib/schemas/judge";

import { sanitizeTestResults } from "../data/leak-guard";
import type { StreamTransport } from "../data/useVerdictStream";
import { TONE_COLOR, VERDICT_DISPLAY } from "./verdict-display";

/**
 * The verdict panel — dark by necessity, not by taste. Rise, fall and gold all fail AA on
 * `--paper` (docs/DESIGN.md §2), so the only surface where a verdict can be coloured at all
 * is `--ink`.
 *
 * ## What a hidden test is allowed to show
 *
 * Pass/fail and timing. Nothing else, ever. `PublicTestResultSchema` has no field for
 * expected output, so the only remaining channel is `diffSnippet`, and `sanitizeTestResults`
 * strips it from any hidden case before this component sees it. If that ever fires, the
 * banner below is not decoration — it is a server bug that needs reporting, and it says so.
 *
 * The panel also states the rule to the student rather than leaving them to infer it. A
 * competitor who knows hidden tests are opaque stops trying to reverse them and goes back to
 * reasoning about their code.
 */

export interface VerdictPanelProps {
  mode: "samples" | "judged";
  verdict: Verdict | null;
  score: number | null;
  results: readonly PublicTestResult[];
  compileError: string | null;
  busy: boolean;
  transport?: StreamTransport | null;
  error?: string | null;
  /** Total case count when known, so "3 of 12" is possible while judging. */
  totalCases?: number | null;
}

function Chip({ verdict }: { verdict: Verdict }) {
  const presentation = VERDICT_DISPLAY[verdict];
  return (
    <span
      className="rounded px-2 py-0.5 font-semibold"
      style={{
        fontSize: "var(--text-xs)",
        color: TONE_COLOR[presentation.tone],
        border: `1px solid ${TONE_COLOR[presentation.tone]}`,
      }}
    >
      {presentation.label}
    </span>
  );
}

function TestRow({ result }: { result: PublicTestResult }) {
  const presentation = VERDICT_DISPLAY[result.verdict];
  const passed = result.verdict === "AC";
  // `ordinal` is 1-based (lib/schemas/api.ts). Adding one here labelled the first sample of
  // every problem "Sample 2" — correct only against the stub, which was 0-based.
  const name = result.isSample ? `Sample ${result.ordinal}` : `Test ${result.ordinal}`;

  return (
    <li className="border-t border-paper/10 py-2 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* A CSS-drawn mark, not a font glyph: check and cross characters sit outside the
            vendored woff2 subsets and would tofu on an unknown machine (DESIGN.md §3). */}
        <span
          aria-hidden="true"
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{
            background: passed ? TONE_COLOR.pass : "transparent",
            border: passed ? "none" : `2px solid ${TONE_COLOR[presentation.tone]}`,
          }}
        />
        <span className="numeric text-paper/85" style={{ fontSize: "var(--text-xs)" }}>
          {name}
        </span>
        {!result.isSample && (
          <span className="text-paper/55" style={{ fontSize: "var(--text-xs)" }}>
            hidden
          </span>
        )}
        <span
          className="font-semibold"
          style={{ fontSize: "var(--text-xs)", color: TONE_COLOR[presentation.tone] }}
        >
          {presentation.label}
        </span>
        <span className="numeric ml-auto text-paper/55" style={{ fontSize: "var(--text-xs)" }}>
          {result.runtimeMs === null ? "-" : `${result.runtimeMs} ms`}
        </span>
      </div>

      {/* Samples are published by definition, so a full diff is fine here. */}
      {result.isSample && result.diffSnippet !== null && (
        <pre
          tabIndex={0}
          role="region"
          aria-label={`Difference for sample ${result.ordinal}`}
          className="mt-2 overflow-x-auto rounded bg-paper/5 p-2 font-mono text-paper/80"
          style={{ fontSize: "var(--text-xs)" }}
        >
          {result.diffSnippet}
        </pre>
      )}
    </li>
  );
}

export function VerdictPanel({
  mode,
  verdict,
  score,
  results,
  compileError,
  busy,
  transport = null,
  error = null,
  totalCases = null,
}: VerdictPanelProps) {
  const { results: safeResults, leakedOrdinals } = useMemo(
    () => sanitizeTestResults(results),
    [results],
  );

  const hasHidden = safeResults.some((result) => !result.isSample);
  const heading = mode === "samples" ? "Sample run" : "Verdict";

  return (
    <section
      aria-label={heading}
      className="rounded border border-ink/20 bg-ink p-4 text-paper"
    >
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
          {heading}
        </h2>

        {verdict !== null && <Chip verdict={verdict} />}

        {mode === "judged" && score !== null && verdict !== null && (
          <span className="numeric text-paper/80" style={{ fontSize: "var(--text-sm)" }}>
            {score} pts
          </span>
        )}

        {busy && (
          <span className="text-paper/60" style={{ fontSize: "var(--text-xs)" }}>
            {totalCases === null
              ? "Judging…"
              : `Judging ${safeResults.length} of ${totalCases} tests`}
          </span>
        )}
      </header>

      {/* One announcement when it settles, not one per test row. */}
      <p aria-live="polite" className="sr-only">
        {verdict === null
          ? ""
          : `${VERDICT_DISPLAY[verdict].label}. ${VERDICT_DISPLAY[verdict].detail}`}
      </p>

      {verdict !== null && (
        <p className="mt-2 text-paper/75" style={{ fontSize: "var(--text-xs)" }}>
          {VERDICT_DISPLAY[verdict].detail}
        </p>
      )}

      {mode === "samples" && (
        <p className="mt-2 text-paper/60" style={{ fontSize: "var(--text-xs)" }}>
          Sample runs are free and are not scored.
        </p>
      )}

      {transport === "polling" && busy && (
        <p className="mt-2 text-paper/50" style={{ fontSize: "var(--text-xs)" }}>
          Live updates are unavailable, so this is refreshing on a timer. Your submission is
          saved either way.
        </p>
      )}

      {error !== null && (
        <p
          className="mt-3 rounded p-2"
          style={{ fontSize: "var(--text-xs)", color: "var(--color-gold)", border: "1px solid var(--color-gold)" }}
        >
          {error}
        </p>
      )}

      {leakedOrdinals.length > 0 && (
        <p
          role="alert"
          className="mt-3 rounded p-2"
          style={{ fontSize: "var(--text-xs)", color: "var(--color-gold)", border: "1px solid var(--color-gold)" }}
        >
          The server sent detail for {leakedOrdinals.length} hidden{" "}
          {leakedOrdinals.length === 1 ? "test" : "tests"}. It has been withheld. Please tell
          an organizer. This is a platform bug, not something you did.
        </p>
      )}

      {compileError !== null && (
        <pre
          tabIndex={0}
          role="region"
          aria-label="Compiler output"
          className="mt-3 max-h-64 overflow-auto rounded bg-paper/5 p-3 font-mono text-paper/85"
          style={{ fontSize: "var(--text-xs)" }}
        >
          {compileError}
        </pre>
      )}

      {safeResults.length > 0 && (
        <ul className="mt-3">
          {safeResults.map((result) => (
            <TestRow key={`${result.isSample ? "s" : "h"}-${result.ordinal}`} result={result} />
          ))}
        </ul>
      )}

      {hasHidden && (
        <p className="mt-3 border-t border-paper/10 pt-3 text-paper/50" style={{ fontSize: "var(--text-xs)" }}>
          Hidden tests report pass/fail and timing only, never their input or expected
          output. That is the same for everyone.
        </p>
      )}

      {!busy && verdict === null && safeResults.length === 0 && error === null && (
        <p className="mt-3 text-paper/50" style={{ fontSize: "var(--text-xs)" }}>
          {mode === "samples"
            ? "Run the samples to check your code without using a submission."
            : "No submission yet."}
        </p>
      )}
    </section>
  );
}
