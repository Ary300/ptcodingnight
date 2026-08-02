"use client";

import { useMemo } from "react";

import type { PublicTestResult, QueuePosition } from "@/lib/schemas/api";
import type { Verdict } from "@/lib/schemas/judge";

import { sanitizeTestResults } from "../data/leak-guard";
import type { StreamTransport } from "../data/useVerdictStream";
import type { VerdictTone } from "./verdict-display";
import {
  judgingProgressLabel,
  queuePositionLabel,
  TONE_COLOR,
  VERDICT_DISPLAY,
} from "./verdict-display";

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
  /**
   * Where the submission stands in the judge queue, when the server could read it. Null or
   * absent renders nothing: the wire field is optional and absence means "no claim", so the
   * panel must not invent one.
   */
  queuePosition?: QueuePosition | null;
}

function Chip({ verdict }: { verdict: Verdict }) {
  const presentation = VERDICT_DISPLAY[verdict];
  return (
    <span
      className="rounded-chip px-2 py-0.5 font-semibold"
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

/**
 * HackerRank's per-case marker: a filled circle carrying a check or a cross. Inline SVG, not
 * a font glyph — check and cross characters sit outside the vendored woff2 subsets and would
 * tofu on an unknown machine (DESIGN.md §3). The glyph is inked so it reads against any of
 * the three tone fills.
 *
 * The `internal` tone deliberately gets a dash, not a cross. An IE case is our problem, and a
 * red-adjacent cross is the exact "your code failed" signal the IE rule forbids.
 */
function CaseMark({ tone }: { tone: VerdictTone }) {
  const color = TONE_COLOR[tone];
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
      <circle cx="8" cy="8" r="8" fill={color} />
      {tone === "pass" && (
        <path
          d="M4.5 8.5 7 11l4.5-5.5"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {tone === "fail" && (
        <path
          d="M5.5 5.5l5 5m0-5l-5 5"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
      {(tone === "compile" || tone === "internal") && (
        <path
          d="M5 8h6"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function TestRow({ result }: { result: PublicTestResult }) {
  const presentation = VERDICT_DISPLAY[result.verdict];
  const passed = result.verdict === "AC";
  // `ordinal` is 1-based (lib/schemas/api.ts). Adding one here labelled the first sample of
  // every problem "Sample 2" — correct only against the stub, which was 0-based.
  const name = result.isSample ? `Sample ${result.ordinal}` : `Test case ${result.ordinal}`;

  return (
    <li className="motion-swap-in border-t border-rule-hair-inverse py-2 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <CaseMark tone={presentation.tone} />
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

      {/*
        Samples are published by definition, so a full diff is fine here — and only here;
        `sanitizeTestResults` has already stripped anything a hidden case tried to carry.

        HackerRank folds each case's detail behind the row and opens the first failing one;
        this does the same with a native disclosure. A failing sample opens itself because
        that diff is the reason the student is looking at this panel. `open` never changes
        after mount, so React never writes the attribute again and the student's own
        toggling wins from then on.
      */}
      {result.isSample && result.diffSnippet !== null && (
        <details className="mt-2" open={passed ? undefined : true}>
          <summary
            className="cursor-pointer text-paper/70 hover:text-paper"
            style={{ fontSize: "var(--text-xs)" }}
          >
            Difference from the expected output
          </summary>
          <pre
            tabIndex={0}
            role="region"
            aria-label={`Difference for sample ${result.ordinal}`}
            className="mt-2 overflow-x-auto rounded-flat bg-paper/5 p-2 font-mono text-paper/80"
            style={{ fontSize: "var(--text-xs)" }}
          >
            {result.diffSnippet}
          </pre>
        </details>
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
  queuePosition = null,
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
      className="rounded-panel border border-rule-edge bg-ink p-4 text-paper"
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

        {/*
          Which test is executing and how many wait behind it — not a spinner. A sample run
          is a single request with no per-case progress to report, so it says only what is
          true: the run is in flight. See `judgingProgressLabel` for the two honesty rules.

          Suppressed entirely when the judge is offline: "running the first test…" beside
          "the judge is offline" is the exact false working line the offline state exists to
          remove, and the offline sentence below carries everything the student needs.
        */}
        {busy && queuePosition?.state !== "offline" && (
          <span className="text-paper/60" style={{ fontSize: "var(--text-xs)" }}>
            {mode === "samples"
              ? "Running the samples…"
              : judgingProgressLabel(safeResults.length, totalCases)}
          </span>
        )}
      </header>

      {/*
        Where the wait is coming from, while there is a wait. A slow submission must look
        slow, never broken: "3 submissions ahead of yours" turns a silent spinner into a
        queue the student can see moving. Gated on `verdict === null` so a settled panel can
        never carry a stale position, and on the field being present at all - the server
        omits it when Redis could not answer, and this line says nothing rather than guessing.
      */}
      {mode === "judged" && busy && verdict === null && queuePosition !== null && (
        <p className="mt-2 text-paper/60" style={{ fontSize: "var(--text-xs)" }}>
          {queuePositionLabel(queuePosition)}
        </p>
      )}

      {/* One announcement when it settles, not one per test row. */}
      <p aria-live="polite" className="sr-only">
        {verdict === null
          ? ""
          : `${VERDICT_DISPLAY[verdict].label}. ${VERDICT_DISPLAY[verdict].detail}`}
      </p>

      {/*
        A second, separate live region for the start of the wait. Its text changes only when
        `busy` flips, never per test — putting the per-test counter in here would read out
        every case to a screen reader, which is noise nobody asked for.
      */}
      <p aria-live="polite" className="sr-only">
        {busy
          ? mode === "samples"
            ? "Running the samples."
            : "Judging your submission."
          : ""}
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
          className="mt-3 rounded-chip p-2"
          style={{ fontSize: "var(--text-xs)", color: "var(--color-gold)", border: "1px solid var(--color-gold)" }}
        >
          {error}
        </p>
      )}

      {leakedOrdinals.length > 0 && (
        <p
          role="alert"
          className="mt-3 rounded-chip p-2"
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
          className="mt-3 max-h-64 overflow-auto rounded-flat bg-paper/5 p-3 font-mono text-paper/85"
          style={{ fontSize: "var(--text-xs)" }}
        >
          {compileError}
        </pre>
      )}

      {/*
        A sample run is all-or-nothing (`RunSamplesResponseSchema` is one array, not a
        stream), so any rows on screen while a sample run is busy belong to the PREVIOUS
        run — the workspace keeps them until the response lands. Leaving them full-strength
        would let a student read last run's passes as this run's. Say so, and dim them.
        Judged rows are the opposite: they stream in one by one, so while judging they are
        current and stay at full strength.
      */}
      {safeResults.length > 0 && mode === "samples" && busy && (
        <p className="mt-3 text-paper/50" style={{ fontSize: "var(--text-xs)" }}>
          The rows below are from the previous run and will be replaced.
        </p>
      )}

      {safeResults.length > 0 && (
        /*
          `motion-stagger` + each row's own `motion-swap-in`: results land 35ms apart instead of
          appearing in one frame, which is the difference between "the judge answered" and "the
          page glitched". The stagger is keyed off nth-child, so streamed rows appearing one at a
          time each animate once and never re-run the ones above.
        */
        <ul className={mode === "samples" && busy ? "motion-stagger mt-3 opacity-50" : "motion-stagger mt-3"}>
          {safeResults.map((result) => (
            <TestRow key={`${result.isSample ? "s" : "h"}-${result.ordinal}`} result={result} />
          ))}
        </ul>
      )}

      {hasHidden && (
        <p className="mt-3 border-t border-rule-hair-inverse pt-3 text-paper/50" style={{ fontSize: "var(--text-xs)" }}>
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
