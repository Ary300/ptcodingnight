"use client";

import { useCallback, useMemo } from "react";

import type { ProblemSummary, SubmissionView } from "@/lib/schemas/api";

import { contestApi } from "../data/backend";
import { sanitizeTestResults } from "../data/leak-guard";
import { useResource } from "../data/useResource";
import { LANGUAGE_LABEL } from "../editor/types";
import { TONE_COLOR, VERDICT_DISPLAY } from "../verdict/verdict-display";
import { recallSource } from "./source-cache";

/**
 * "My submissions" — the full history (PRD §9.1).
 *
 * Two things the contract does not give this screen, both filed in the report:
 *
 *  - `SubmissionViewSchema` has no `sourceCode`, so the code column falls back to a
 *    tab-local cache and says so when it has nothing.
 *  - It has no problem title or slot label either, only `contestProblemId`, so the titles
 *    here come from a second call to `listProblems()` and joining client-side.
 *
 * The per-test results run through `sanitizeTestResults` for the same reason the verdict
 * panel does. History is a second render path for the same data, and a leak guard that only
 * covers one path is not a leak guard.
 */

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function Row({ submission, title }: { submission: SubmissionView; title: string }) {
  const source = recallSource(submission.submissionId);
  const { results, leakedOrdinals } = sanitizeTestResults(submission.testResults);

  const presentation = submission.verdict === null ? null : VERDICT_DISPLAY[submission.verdict];
  const passed = results.filter((result) => result.verdict === "AC").length;

  return (
    <li className="rounded border border-ink/15">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3">
        <span className="numeric text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          {formatTime(submission.submittedAt)}
        </span>
        <span className="flex-1 font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
          {title}
        </span>
        <span className="text-ink/65" style={{ fontSize: "var(--text-xs)" }}>
          {LANGUAGE_LABEL[submission.language]}
        </span>

        {/* The verdict word carries the meaning; the panther chip is chrome. On --paper,
            rise/fall/gold are all below AA (DESIGN.md §2), so no verdict colour here. */}
        <span
          className={presentation === null ? "text-ink/60" : "font-semibold"}
          style={{ fontSize: "var(--text-xs)" }}
        >
          {presentation === null ? "Judging…" : presentation.label}
        </span>

        <span className="numeric w-16 text-right" style={{ fontSize: "var(--text-xs)" }}>
          {submission.score} pts
        </span>
        <span className="numeric w-24 text-right text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          {results.length === 0 ? "—" : `${passed}/${results.length} tests`}
        </span>
        <span className="numeric w-20 text-right text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          {submission.runtimeMs === null ? "—" : `${submission.runtimeMs} ms`}
        </span>
      </div>

      {leakedOrdinals.length > 0 && (
        <p role="alert" className="px-3 pb-2 text-panther" style={{ fontSize: "var(--text-xs)" }}>
          Detail for {leakedOrdinals.length} hidden{" "}
          {leakedOrdinals.length === 1 ? "test was" : "tests were"} withheld. Please tell an
          organizer.
        </p>
      )}

      <details className="border-t border-ink/10">
        <summary className="cursor-pointer px-3 py-2 text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
          Code
        </summary>
        {source === null ? (
          <p className="px-3 pb-3 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            The code for this submission is not available in this tab.
          </p>
        ) : (
          <pre
            tabIndex={0}
            role="region"
            aria-label={`Source for the ${formatTime(submission.submittedAt)} submission`}
            className="mx-3 mb-3 max-h-80 overflow-auto rounded bg-ink p-3 font-mono text-paper"
            style={{ fontSize: "var(--text-xs)", lineHeight: "1.6" }}
          >
            {source}
          </pre>
        )}
      </details>

      {submission.compileError !== null && (
        <pre
          tabIndex={0}
          role="region"
          aria-label="Compiler output"
          className="mx-3 mb-3 max-h-48 overflow-auto rounded p-3 font-mono"
          style={{
            fontSize: "var(--text-xs)",
            background: "var(--color-ink)",
            color: TONE_COLOR.compile,
          }}
        >
          {submission.compileError}
        </pre>
      )}
    </li>
  );
}

export function SubmissionHistory() {
  const loadSubmissions = useCallback(() => contestApi.listSubmissions(), []);
  const loadProblems = useCallback(() => contestApi.listProblems(), []);

  const submissions = useResource(loadSubmissions);
  const problems = useResource(loadProblems);

  const titleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const problem of problems.data ?? ([] as ProblemSummary[])) {
      map.set(problem.contestProblemId, `${problem.slotLabel} — ${problem.title}`);
    }
    return map;
  }, [problems.data]);

  if (submissions.status === "loading") {
    return (
      <p role="status" className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
        Loading your submissions…
      </p>
    );
  }

  if (submissions.status === "error") {
    return (
      <p role="alert" className="text-panther" style={{ fontSize: "var(--text-sm)" }}>
        {submissions.error}
      </p>
    );
  }

  if (submissions.data.length === 0) {
    return (
      <p className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
        You have not submitted anything yet. Running samples does not appear here — it is free
        and unjudged.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {submissions.data.map((submission) => (
        <Row
          key={submission.submissionId}
          submission={submission}
          title={titleById.get(submission.contestProblemId) ?? submission.contestProblemId}
        />
      ))}
    </ul>
  );
}
