"use client";

import type { z } from "zod";

import type { PublicTestResult, SampleCaseSchema } from "@/lib/schemas/api";

import { CopyButton } from "../CopyButton";
import { mayShowDiff } from "../data/leak-guard";
import { Disclosure } from "../Disclosure";
import { Markdown } from "../markdown/Markdown";
import { VERDICT_DISPLAY } from "../verdict/verdict-display";
import { ExampleMark } from "./ExampleMark";

/**
 * The problem's examples: one disclosure per published sample, holding its input, its expected
 * output, the statement's explanation of it when the author wrote one, and the result of the
 * last "Run examples".
 *
 * The organizers found a statement "Example" section beside a "Samples" list redundant: the same
 * data twice, and only one of them runnable. `mergeStatementExamples` moves each explanation onto
 * the sample it describes, matched by data, and this is the one section a student reads and runs.
 *
 * Samples are published by definition, so full I/O here is correct and is the one place a
 * student may see expected output. Hidden cases have no such component and no such field, and a
 * result is only ever drawn for a SAMPLE row (`mayShowDiff`), so a hidden case cannot appear here
 * even if a response carried one by mistake.
 *
 * The copy buttons exist because the alternative is students retyping input by hand and then
 * debugging their transcription instead of their algorithm.
 */

type SampleCase = z.infer<typeof SampleCaseSchema>;

function Block({ title, value, what }: { title: string; value: string; what: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-ink/70 uppercase" style={{ fontSize: "var(--text-xs)", letterSpacing: "0.06em" }}>
          {title}
        </h4>
        <CopyButton value={value} what={what} />
      </div>
      {/*
        `whitespace-pre-wrap`, and it is a correctness fix rather than a style choice: a
        horizontal scroller on macOS overlay scrollbars looked exactly like a truncated value,
        and a student diffing against data they cannot fully see debugs the wrong thing. Every
        newline is kept, `break-words` covers one token longer than the line, and the copy button
        still yields the exact bytes. The 384px cap keeps a long example from pushing the editor
        off the screen.
      */}
      <pre
        tabIndex={0}
        role="region"
        aria-label={what}
        className="mt-1 max-h-96 overflow-y-auto rounded-flat bg-ink/[0.04] p-3 font-mono break-words whitespace-pre-wrap text-ink"
        style={{ fontSize: "var(--text-xs)", lineHeight: "1.6" }}
      >
        {value}
      </pre>
    </div>
  );
}

/** What the last run says about one example, in words. Null when it has not run. */
function statusLabel(result: PublicTestResult | undefined, running: boolean): string | null {
  if (running) return "Running";
  if (result === undefined) return null;
  return result.verdict === "AC" ? "Passed" : VERDICT_DISPLAY[result.verdict].label;
}

function RunResult({ result, number }: { result: PublicTestResult; number: number }) {
  const passed = result.verdict === "AC";
  const time = result.runtimeMs === null ? "" : ` in ${String(result.runtimeMs)} ms`;
  return (
    <div className="mt-4 border-t border-rule-hair pt-3">
      <h4 className="text-ink/70 uppercase" style={{ fontSize: "var(--text-xs)", letterSpacing: "0.06em" }}>
        Your result
      </h4>
      <p className="mt-1 flex items-center gap-2 text-ink" style={{ fontSize: "var(--text-xs)" }}>
        <ExampleMark verdict={result.verdict} />
        <span>
          {passed
            ? `Passed${time}.`
            : result.verdict === "CE"
              ? "Did not compile. The compiler output is in the results."
              : `${VERDICT_DISPLAY[result.verdict].label}${time}. ${VERDICT_DISPLAY[result.verdict].detail}`}
        </span>
      </p>
      {mayShowDiff(result) && !passed && (
        <pre
          tabIndex={0}
          role="region"
          aria-label={`Difference for example ${String(number)}`}
          className="mt-2 max-h-96 overflow-y-auto rounded-flat bg-ink/[0.04] p-3 font-mono break-words whitespace-pre-wrap text-ink"
          style={{ fontSize: "var(--text-xs)", lineHeight: "1.6" }}
        >
          {result.diffSnippet}
        </pre>
      )}
    </div>
  );
}

export interface ExamplesProps {
  samples: readonly SampleCase[];
  /** Explanation markdown by sample ordinal, from `mergeStatementExamples`. */
  explanations: Readonly<Record<number, string>>;
  /** The last "Run examples" rows. Empty before the first run. */
  results: readonly PublicTestResult[];
  /** A run is in flight, so the rows on hand belong to the previous one and are not shown. */
  running: boolean;
  /** The last run did not compile, so no example ran. The compiler output is in the results. */
  compileFailed: boolean;
}

/** Every example's row when the code did not compile: no example ran, and none has a diff. */
function compileFailedRow(ordinal: number): PublicTestResult {
  return { ordinal, isSample: true, verdict: "CE", runtimeMs: null, diffSnippet: null };
}

export function Examples({ samples, explanations, results, running, compileFailed }: ExamplesProps) {
  if (samples.length === 0) {
    return (
      <p className="text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
        This problem has no published examples.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/*
        Each example folds behind its own heading, and every one starts closed, the first
        included: the organizers asked that nothing open by itself, so the page stays short and
        the student opens what they want to read. A run marks each closed row, so a student sees
        which one failed without opening any of them.
      */}
      {samples.map((sample, index) => {
        const number = index + 1;
        const result = compileFailed
          ? compileFailedRow(sample.ordinal)
          : results.find((row) => row.isSample && row.ordinal === sample.ordinal);
        const shown = running ? undefined : result;
        const status = statusLabel(shown, running);
        const explanation = explanations[sample.ordinal] ?? "";
        return (
          <Disclosure
            key={sample.ordinal}
            kind="example"
            defaultOpen={false}
            summary={
              <>
                <h3 className="font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
                  Example {number}
                </h3>
                {status !== null && (
                  <span
                    data-example-status={shown?.verdict === "AC" ? "passed" : running ? "running" : "failed"}
                    className="ml-auto flex items-center gap-1.5 text-ink/75"
                    style={{ fontSize: "var(--text-xs)" }}
                  >
                    {shown !== undefined && <ExampleMark verdict={shown.verdict} />}
                    {status}
                  </span>
                )}
              </>
            }
          >
            {/*
              Stacks unless the BOX is 32rem wide, rather than the window: in the side-by-side
              view the problem pane can be 300px on a wide screen.
            */}
            <div className="@container">
              <div className="flex flex-col gap-4 @lg:flex-row">
                <Block title="Input" value={sample.input} what={`example ${String(number)} input`} />
                <Block
                  title="Expected output"
                  value={sample.expectedOutput}
                  what={`example ${String(number)} expected output`}
                />
              </div>
            </div>
            {explanation !== "" && (
              <div className="mt-4">
                <h4 className="text-ink/70 uppercase" style={{ fontSize: "var(--text-xs)", letterSpacing: "0.06em" }}>
                  Explanation
                </h4>
                <Markdown source={explanation} className="mt-1 max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" />
              </div>
            )}
            {shown !== undefined && <RunResult result={shown} number={number} />}
          </Disclosure>
        );
      })}
    </div>
  );
}
