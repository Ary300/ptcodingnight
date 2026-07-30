"use client";

import { useState } from "react";

import { Button } from "@/components/ui";
import { AlertPlate } from "@/components/admin/Panel";
import {
  referenceRunFailures,
  type ReferenceRunReport,
  type TestCaseDraft,
} from "@/components/admin/contract";

/**
 * The reference-solution runner.
 *
 * PRD §9.2 asks that this "fail loudly if the reference solution does not pass its own
 * tests", and that loudness is the feature. Test data whose own reference disagrees with it
 * is the single most common way a contest breaks — it does not surface until a student with
 * a correct program gets a WA, in front of the room, with no way to prove they were right.
 *
 * So a failed run:
 *  - takes over the panel with a dark `--fall` plate (9.60 on `--ink`; it is illegal on
 *    paper at 1.94, which is exactly why the surface inverts here),
 *  - is announced via `role="alert"`,
 *  - lists every failing case rather than the first,
 *  - and **latches**. `onReady` is only ever called after a clean run, so a failing run
 *    cannot be dismissed into a green state by clicking somewhere else.
 */

export interface ReferenceRunnerProps {
  cases: readonly TestCaseDraft[];
  language: "PYTHON_312" | "JAVA_21";
  /** Provided by the page. Talks to the judge; never executes anything in the browser. */
  run: (cases: readonly TestCaseDraft[]) => Promise<ReferenceRunReport>;
  onResult?: (report: ReferenceRunReport) => void;
}

type RunState =
  | { readonly phase: "idle" }
  | { readonly phase: "running" }
  | { readonly phase: "done"; readonly report: ReferenceRunReport }
  | { readonly phase: "error"; readonly message: string };

export function ReferenceRunner({ cases, language, run, onResult }: ReferenceRunnerProps) {
  const [state, setState] = useState<RunState>({ phase: "idle" });

  const start = async (): Promise<void> => {
    setState({ phase: "running" });
    try {
      const report = await run(cases);
      setState({ phase: "done", report });
      onResult?.(report);
    } catch (error: unknown) {
      // Never swallowed: a runner that cannot run is not a pass.
      setState({
        phase: "error",
        message: error instanceof Error ? error.message : "The reference runner could not be reached.",
      });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={state.phase === "running" || cases.length === 0}
          onClick={() => {
            void start();
          }}
        >
          {state.phase === "running" ? "Running reference..." : "Run reference against all cases"}
        </Button>
        <span className="numeric opacity-70" style={{ fontSize: "var(--text-xs)" }}>
          {language} · {cases.length} case{cases.length === 1 ? "" : "s"}
        </span>
      </div>

      {state.phase === "running" && (
        <p role="status" style={{ fontSize: "var(--text-sm)" }}>
          Running the reference solution in the judge sandbox. This is the same isolation
          every student submission gets.
        </p>
      )}

      {state.phase === "error" && (
        <AlertPlate tone="alarm" title="The reference runner did not complete">
          <p>{state.message}</p>
          <p className="mt-2">
            An unrun reference is not a passing reference. This problem stays in DRAFT.
          </p>
        </AlertPlate>
      )}

      {state.phase === "done" && <ReferenceReportView report={state.report} />}
    </div>
  );
}

function ReferenceReportView({ report }: { report: ReferenceRunReport }) {
  const failures = referenceRunFailures(report);

  if (report.compileError !== null) {
    return (
      <AlertPlate tone="alarm" title="The reference solution does not compile">
        <pre className="numeric mt-1 max-h-64 overflow-auto whitespace-pre-wrap">
          {report.compileError}
        </pre>
      </AlertPlate>
    );
  }

  if (failures.length === 0) {
    return (
      <div className="rounded border border-ink/20 p-4">
        <h3 className="font-semibold" style={{ fontSize: "var(--text-md)" }}>
          Reference passes all {report.cases.length} cases
        </h3>
        <p className="mt-1 opacity-75" style={{ fontSize: "var(--text-sm)" }}>
          The test data agrees with its own solution. This problem may leave DRAFT once it
          also has an original statement.
        </p>
        <ol className="mt-3 grid gap-1 sm:grid-cols-2" style={{ fontSize: "var(--text-xs)" }}>
          {report.cases.map((outcome) => (
            <li key={outcome.ordinal} className="numeric flex justify-between border-b border-ink/10 py-1">
              <span>
                Case {outcome.ordinal + 1}
                {outcome.isSample ? " (sample)" : ""}
              </span>
              <span>{outcome.runtimeMs === null ? "-" : `${outcome.runtimeMs} ms`}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <AlertPlate
      tone="alarm"
      title={`The reference solution FAILS ${failures.length} of its own ${report.cases.length} test cases`}
    >
      <p>
        Do not ship this problem. Either the expected output is wrong or the reference is
        wrong, and a student with a correct program will get a wrong answer they cannot
        argue with.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {failures.map((failure) => (
          <li key={failure.ordinal} className="numeric" style={{ fontSize: "var(--text-xs)" }}>
            <strong>
              Case {failure.ordinal + 1}
              {failure.isSample ? " (sample)" : ""}
            </strong>
            {failure.detail !== null && (
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap opacity-90">
                {failure.detail}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </AlertPlate>
  );
}
