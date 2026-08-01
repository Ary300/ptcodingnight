"use client";

import { useCallback, useMemo } from "react";

import type { ProblemSummary, SubmissionView } from "@/lib/schemas/api";

import { contestApi } from "../data/backend";
import { sanitizeTestResults } from "../data/leak-guard";
import { useParticipant } from "../data/participant";
import { useResource } from "../data/useResource";
import { LANGUAGE_LABEL } from "../editor/types";
import { SignInRequired } from "../lobby/SignInRequired";
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
 * ## The second read is now gated, and never falls back to a cuid
 *
 * The two reads used to be independent and only the first one gated the render, so a slow or
 * failed `listProblems()` painted `cms9iinaf002o3m8cq2vj0kd1` in Baskerville display type where
 * the problem name belongs — transient on a bad link, permanent if the call failed outright, and
 * silent either way because the component only surfaced `submissions.error`. A database key is
 * never a thing to show a student: it answers no question they have and it reads as a crash.
 *
 * So the loading state waits for both, and a failed join renders a named placeholder plus one
 * line saying what is missing. The submissions themselves still render — the verdicts and scores
 * are the point of the screen and they do not depend on the join.
 *
 * The per-test results run through `sanitizeTestResults` for the same reason the verdict
 * panel does. History is a second render path for the same data, and a leak guard that only
 * covers one path is not a leak guard.
 */

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function Row({ submission, title }: { submission: SubmissionView; title: string | null }) {
  const source = recallSource(submission.submissionId);
  const { results, leakedOrdinals } = sanitizeTestResults(submission.testResults);

  const presentation = submission.verdict === null ? null : VERDICT_DISPLAY[submission.verdict];
  const passed = results.filter((result) => result.verdict === "AC").length;

  return (
    <li>
      {/*
        Title first, then one quiet metadata run — HackerRank's list density, and the same shape
        the problem list now uses. The previous version was seven columns that each became their
        own line on a phone, so one submission was seven lines tall and a student scrolled past
        three of them to find the one they had just made.
      */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 pt-3 sm:px-4">
        {/*
          `title === null` means the problem list did not load, so this submission's problem has
          no name we can honestly print. It renders as a named gap, never as the raw
          `contestProblemId` — a cuid in display type is indistinguishable from a rendering fault
          and tells the student nothing either way.
        */}
        {title === null ? (
          <span className="min-w-0 flex-1 text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
            Problem name unavailable
          </span>
        ) : (
          <span
            className="min-w-0 flex-1 font-display font-bold"
            style={{ fontSize: "var(--text-sm)" }}
          >
            {title}
          </span>
        )}

        {/* The verdict word carries the meaning; the panther chip is chrome. On --paper,
            rise/fall/gold are all below AA (DESIGN.md §2), so no verdict colour here. */}
        <span
          className={presentation === null ? "text-ink/60" : "font-semibold"}
          style={{ fontSize: "var(--text-sm)" }}
        >
          {presentation === null ? "Judging…" : presentation.label}
        </span>
        <span className="numeric shrink-0 text-right" style={{ fontSize: "var(--text-sm)" }}>
          {submission.score} pts
        </span>
      </div>

      <div
        className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 pt-0.5 text-ink/60 sm:px-4"
        style={{ fontSize: "var(--text-xs)" }}
      >
        <span className="numeric">{formatTime(submission.submittedAt)}</span>
        <span aria-hidden="true" className="text-ink/40">
          &#183;
        </span>
        <span>{LANGUAGE_LABEL[submission.language]}</span>
        <span aria-hidden="true" className="text-ink/40">
          &#183;
        </span>
        <span className="numeric">
          {results.length === 0 ? "no tests reported" : `${passed}/${results.length} tests`}
        </span>
        <span aria-hidden="true" className="text-ink/40">
          &#183;
        </span>
        <span className="numeric">
          {submission.runtimeMs === null ? "no timing" : `${submission.runtimeMs} ms`}
        </span>
      </div>

      {leakedOrdinals.length > 0 && (
        <p
          role="alert"
          className="px-3 pt-2 text-panther sm:px-4"
          style={{ fontSize: "var(--text-xs)" }}
        >
          Detail for {leakedOrdinals.length} hidden{" "}
          {leakedOrdinals.length === 1 ? "test was" : "tests were"} withheld. Please tell an
          organizer.
        </p>
      )}

      <details>
        <summary
          className="cursor-pointer px-3 py-2 text-ink/60 sm:px-4"
          style={{ fontSize: "var(--text-xs)" }}
        >
          Code
        </summary>
        {source === null ? (
          <p className="px-3 pb-3 text-ink/60 sm:px-4" style={{ fontSize: "var(--text-xs)" }}>
            The code for this submission is not available in this tab.
          </p>
        ) : (
          <pre
            tabIndex={0}
            role="region"
            aria-label={`Source for the ${formatTime(submission.submittedAt)} submission`}
            className="mx-3 mb-3 max-h-80 overflow-auto rounded bg-ink p-3 font-mono text-paper sm:mx-4"
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
          className="mx-3 mb-3 max-h-48 overflow-auto rounded p-3 font-mono sm:mx-4"
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
  const participant = useParticipant();
  const loadSubmissions = useCallback(() => contestApi.listSubmissions(), []);
  const loadProblems = useCallback(() => contestApi.listProblems(), []);

  const submissions = useResource(loadSubmissions);
  const problems = useResource(loadProblems);

  const titleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const problem of problems.data ?? ([] as ProblemSummary[])) {
      map.set(problem.contestProblemId, `${problem.slotLabel}: ${problem.title}`);
    }
    return map;
  }, [problems.data]);

  // BOTH reads gate the render. Gating on `submissions` alone is what put database keys on the
  // screen: the rows arrived, the titles had not, and the fallback was the id.
  if (
    participant.status === "loading" ||
    submissions.status === "loading" ||
    problems.status === "loading"
  ) {
    return (
      <p role="status" className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
        Loading your submissions…
      </p>
    );
  }

  if (submissions.status === "error") {
    /*
      Signed out is reported only once the read has actually failed, never before it.

      `fetchParticipant()` cannot tell "not signed in" from "could not ask" — a timeout, a 500 and
      a genuine anonymous visitor all come back as null. Short-circuiting on that would tell a
      student with a valid cookie that they are not signed in, on a page whose data loaded fine,
      which is this project's worst-ever bug arriving from a new direction. The read wins; the
      anonymous answer only gets to explain a failure that already happened.

      What it replaces is `submissions.error` painted verbatim — for this state that string is
      "Join the contest first", a `ForbiddenError` from the route layer naming a flow that was
      deleted, in alert red, with nothing to click.
    */
    if (participant.status === "anonymous") {
      return <SignInRequired what="your submissions" />;
    }

    return (
      <p role="alert" className="text-panther" style={{ fontSize: "var(--text-sm)" }}>
        {submissions.error}
      </p>
    );
  }

  if (submissions.data.length === 0) {
    return (
      <p
        className="rounded border border-ink/15 bg-paper p-4 text-ink/70"
        style={{ fontSize: "var(--text-sm)" }}
      >
        You have not submitted anything yet. Running samples does not appear here, because it is free
        and unjudged.
      </p>
    );
  }

  return (
    <div>
      {/*
        The problem list failed, so the rows below have verdicts and scores but no names. Say so
        once, at the top, rather than letting six identical "Problem name unavailable" lines be
        the only evidence that anything went wrong. `status`, not `alert`: the screen still works.
      */}
      {problems.status === "error" && (
        <p role="status" className="mb-3 text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
          Problem names could not be loaded, so the rows below are unnamed. Verdicts and scores are
          unaffected.{" "}
          <button
            type="button"
            onClick={problems.reload}
            className="text-panther underline underline-offset-2"
          >
            Try again
          </button>
        </p>
      )}

      {/* One panel divided by hairlines, the same surface the problem list uses. Named, because a
          page with more than one list gives a screen reader nothing to tell them apart. */}
      <ul
        aria-label="Submissions"
        className="divide-y divide-ink/10 overflow-hidden rounded border border-ink/15 bg-paper"
      >
        {submissions.data.map((submission) => (
          <Row
            key={submission.submissionId}
            submission={submission}
            title={titleById.get(submission.contestProblemId) ?? null}
          />
        ))}
      </ul>
    </div>
  );
}
