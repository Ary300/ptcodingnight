"use client";

import { Fragment, useCallback, useMemo, useState } from "react";

import type { ProblemSummary, SubmissionView } from "@/lib/schemas/api";
import type { Verdict } from "@/lib/schemas/judge";

import { contestApi } from "../data/backend";
import { sanitizeTestResults } from "../data/leak-guard";
import { useParticipant } from "../data/participant";
import { useResource } from "../data/useResource";
import { LANGUAGE_LABEL } from "../editor/types";
import { SignInRequired } from "../lobby/SignInRequired";
import { TONE_COLOR, VERDICT_DISPLAY } from "../verdict/verdict-display";
import { recallSource } from "./source-cache";

/**
 * "My submissions" — the full history (PRD §9.1), as HackerRank draws it: a real table.
 *
 * ## What the reference actually shows
 *
 * HackerRank's submissions surface is one table under a quiet tinted header row, one submission
 * per line, and the empty state is a dashed box with a single centred sentence ("You have not
 * made any submissions yet."). The previous version here was a stacked card list — two wrapped
 * metadata runs per submission — which reads fine for three rows and turns to porridge at
 * fifteen, because nothing lines up vertically. A table is the fix precisely because everything
 * in a column shares an x-position: fifteen scores are one glance, not fifteen.
 *
 * Column order is Problem, Language, Verdict, Score, Time. Score and Time are right-aligned and
 * set in `.numeric` (tabular figures): a column of times that does not line up digit-for-digit
 * is the single most obvious tell that a table was not designed.
 *
 * ## Rows open in place
 *
 * There is no per-submission route in this app, so "view that submission" is an expansion: the
 * whole row is clickable and the problem-name button carries `aria-expanded`/`aria-controls`
 * for keyboard and screen-reader users. The detail panel holds everything the row's five cells
 * do not: the test tally, the source (tab-local cache, and it says when it has nothing), the
 * compiler output, and the leak-guard alert.
 *
 * ## Two contract gaps, both filed in the report
 *
 *  - `SubmissionViewSchema` has no `sourceCode`, so the code panel falls back to a tab-local
 *    cache and says so when it has nothing.
 *  - It has no problem title either, only `contestProblemId`, so titles come from a second call
 *    to `listProblems()` joined client-side.
 *
 * ## The second read is gated, and never falls back to a cuid
 *
 * The two reads used to be independent and only the first one gated the render, so a slow or
 * failed `listProblems()` painted `cms9iinaf002o3m8cq2vj0kd1` in display type where the problem
 * name belongs. A database key is never a thing to show a student: it answers no question they
 * have and it reads as a crash. So the loading state waits for both, and a failed join renders
 * a named placeholder plus one line saying what is missing. The submissions themselves still
 * render — the verdicts and scores are the point of the screen and do not depend on the join.
 *
 * The per-test results run through `sanitizeTestResults` for the same reason the verdict panel
 * does. History is a second render path for the same data, and a leak guard that only covers
 * one path is not a leak guard.
 */

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * The verdict cell: a compact token carrying the letter code, then the word.
 *
 * The letter code sits on an `--ink` chip because that is the only ground the verdict colours
 * are legal on — rise, fall and gold all fail AA on `--paper` (DESIGN.md §2), which rules out
 * HackerRank's green-text-on-white verbatim. And the code is never colour alone: the word
 * ("Accepted", "Too slow") rides next to it in plain ink, so a colour-blind student and a
 * greyscale projector read the same verdict (DESIGN.md §3).
 */
function VerdictToken({ verdict }: { verdict: Verdict | null }) {
  if (verdict === null) {
    return (
      <span className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
        Judging…
      </span>
    );
  }
  const presentation = VERDICT_DISPLAY[verdict];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        className="numeric rounded px-1.5 py-0.5 font-semibold"
        style={{
          fontSize: "var(--text-xs)",
          background: "var(--color-ink)",
          color: TONE_COLOR[presentation.tone],
        }}
      >
        {verdict}
      </span>
      <span style={{ fontSize: "var(--text-sm)" }}>{presentation.label}</span>
    </span>
  );
}

interface RowProps {
  readonly submission: SubmissionView;
  readonly title: string | null;
  readonly open: boolean;
  readonly onToggle: () => void;
}

function Row({ submission, title, open, onToggle }: RowProps) {
  const source = recallSource(submission.submissionId);
  const { results, leakedOrdinals } = sanitizeTestResults(submission.testResults);
  const passed = results.filter((result) => result.verdict === "AC").length;
  const detailId = `submission-detail-${submission.submissionId}`;

  return (
    <Fragment>
      {/*
        The whole row toggles — a 44px-tall target beats hunting for the one hot word — and the
        problem-name button is the accessible control, so keyboard focus lands on something that
        announces its expanded state. The button stops propagation or a click on it would bubble
        to the row and toggle twice, i.e. do nothing.
      */}
      <tr
        onClick={onToggle}
        className="cursor-pointer first:border-t-0 border-t border-rule-hair hover:bg-ink/[0.03]"
      >
        <td className="px-3 py-2.5 sm:px-4">
          {/*
            `title === null` means the problem list did not load, so this submission's problem
            has no name we can honestly print. It renders as a named gap, never as the raw
            `contestProblemId` — a cuid in display type is indistinguishable from a rendering
            fault and tells the student nothing either way.
          */}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            className={
              title === null
                ? "text-left text-ink/60"
                : "text-left font-display font-bold hover:text-panther"
            }
            style={{ fontSize: "var(--text-sm)" }}
          >
            {title ?? "Problem name unavailable"}
          </button>
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 sm:px-4" style={{ fontSize: "var(--text-sm)" }}>
          {LANGUAGE_LABEL[submission.language]}
        </td>
        <td className="px-3 py-2.5 sm:px-4">
          <VerdictToken verdict={submission.verdict} />
        </td>
        <td
          className="numeric whitespace-nowrap px-3 py-2.5 text-right sm:px-4"
          style={{ fontSize: "var(--text-sm)" }}
        >
          {submission.score}
        </td>
        <td
          className="numeric whitespace-nowrap px-3 py-2.5 text-right sm:px-4"
          style={{ fontSize: "var(--text-sm)" }}
        >
          {formatTime(submission.submittedAt)}
        </td>
      </tr>

      {open && (
        /* No onClick here: selecting text in the code block must not collapse the panel. */
        <tr id={detailId} className="bg-ink/[0.02]">
          <td colSpan={5} className="px-3 pt-2 pb-3 sm:px-4">
            <p className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
              <span className="numeric">
                {results.length === 0 ? "no tests reported" : `${passed}/${results.length} tests`}
              </span>
              <span aria-hidden="true" className="px-2 text-ink/40">
                &#183;
              </span>
              <span className="numeric">
                {submission.runtimeMs === null ? "no timing" : `${submission.runtimeMs} ms`}
              </span>
            </p>

            {leakedOrdinals.length > 0 && (
              <p role="alert" className="pt-2 text-panther" style={{ fontSize: "var(--text-xs)" }}>
                Detail for {leakedOrdinals.length} hidden{" "}
                {leakedOrdinals.length === 1 ? "test was" : "tests were"} withheld. Please tell an
                organizer.
              </p>
            )}

            {source === null ? (
              <p className="pt-2 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
                The code for this submission is not available in this tab.
              </p>
            ) : (
              <pre
                tabIndex={0}
                role="region"
                aria-label={`Source for the ${formatTime(submission.submittedAt)} submission`}
                className="mt-2 max-h-80 overflow-auto rounded bg-ink p-3 font-mono text-paper"
                style={{ fontSize: "var(--text-xs)", lineHeight: "1.6" }}
              >
                {source}
              </pre>
            )}

            {submission.compileError !== null && (
              <pre
                tabIndex={0}
                role="region"
                aria-label="Compiler output"
                className="mt-2 max-h-48 overflow-auto rounded p-3 font-mono"
                style={{
                  fontSize: "var(--text-xs)",
                  background: "var(--color-ink)",
                  color: TONE_COLOR.compile,
                }}
              >
                {submission.compileError}
              </pre>
            )}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export function SubmissionHistory() {
  const participant = useParticipant();
  const loadSubmissions = useCallback(() => contestApi.listSubmissions(), []);
  const loadProblems = useCallback(() => contestApi.listProblems(), []);

  const submissions = useResource(loadSubmissions);
  const problems = useResource(loadProblems);
  const [openId, setOpenId] = useState<string | null>(null);

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
      /*
        HackerRank's empty state exactly: a dashed hairline box with one centred sentence. The
        second sentence answers the question a student actually has here after pressing "Run
        samples" three times: sample runs are free, unjudged, and never listed.
      */
      <p
        className="rounded border border-dashed border-rule-edge bg-paper px-4 py-10 text-center text-ink/70"
        style={{ fontSize: "var(--text-sm)" }}
      >
        You have not made any submissions yet. Running samples is free and unjudged, so sample
        runs never appear here.
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

      {/*
        The table scrolls inside its own wrapper. Five columns at 360px do not fit, and the page
        must never scroll sideways (CLAUDE.md); `min-w` keeps the columns from crushing into
        single-word verticals once the scroller takes over.
      */}
      <div className="overflow-x-auto rounded border border-rule-edge bg-paper">
        <table aria-label="Submissions" className="w-full min-w-[560px] border-collapse">
          {/*
            The header is the same tinted bar TabStrip uses (`bg-ink/[0.04]`): one piece of
            furniture, recognised everywhere. Left-aligned over text columns, right-aligned over
            the numeric ones so the heading sits where its digits will.
          */}
          <thead>
            <tr className="border-b border-rule-edge bg-ink/[0.04] text-ink/70">
              <th
                scope="col"
                className="px-3 py-2 text-left font-semibold sm:px-4"
                style={{ fontSize: "var(--text-xs)" }}
              >
                Problem
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-left font-semibold sm:px-4"
                style={{ fontSize: "var(--text-xs)" }}
              >
                Language
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-left font-semibold sm:px-4"
                style={{ fontSize: "var(--text-xs)" }}
              >
                Verdict
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-right font-semibold sm:px-4"
                style={{ fontSize: "var(--text-xs)" }}
              >
                Score
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-right font-semibold sm:px-4"
                style={{ fontSize: "var(--text-xs)" }}
              >
                Time
              </th>
            </tr>
          </thead>
          <tbody>
            {submissions.data.map((submission) => (
              <Row
                key={submission.submissionId}
                submission={submission}
                title={titleById.get(submission.contestProblemId) ?? null}
                open={openId === submission.submissionId}
                onToggle={() =>
                  setOpenId((current) =>
                    current === submission.submissionId ? null : submission.submissionId,
                  )
                }
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
