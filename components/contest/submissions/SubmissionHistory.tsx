"use client";

import Link from "next/link";
import { Fragment, useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui";
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
 * There is no per-submission route in this app, so "view that submission" is an expansion. The
 * problem-name button is the ONE interactive element in the row — HackerRank's tables make only
 * the challenge name hot, and the previous whole-row `onClick` with a `stopPropagation` button
 * nested inside it was two click targets for one action (inventory D12). The button carries
 * `aria-expanded`/`aria-controls` and a rotating chevron (the same glyph `ui/Select` draws), so
 * the expandable state is visible rather than colour-and-hover alone. The detail panel holds
 * everything the row's five cells do not: the test tally, the source (tab-local cache, and it
 * says when it has nothing), the compiler output, and the leak-guard alert.
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
function VerdictChip({ verdict }: { verdict: Verdict }) {
  const presentation = VERDICT_DISPLAY[verdict];
  return (
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
  );
}

function VerdictToken({ verdict }: { verdict: Verdict | null }) {
  if (verdict === null) {
    return (
      <span className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
        Judging…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <VerdictChip verdict={verdict} />
      <span style={{ fontSize: "var(--text-sm)" }}>{VERDICT_DISPLAY[verdict].label}</span>
    </span>
  );
}

/**
 * Everything the row's five cells do not carry: the test tally, the source, the compiler output
 * and the leak-guard alert. Extracted from the table row so the phone card layout below `sm` can
 * open exactly the same detail — one render path for the detail means the leak guard cannot be
 * covered on one layout and missed on the other.
 */
function SubmissionDetail({ submission }: { submission: SubmissionView }) {
  const source = recallSource(submission.submissionId);
  const { results, leakedOrdinals } = sanitizeTestResults(submission.testResults);
  const passed = results.filter((result) => result.verdict === "AC").length;

  return (
    <>
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
    </>
  );
}

interface RowProps {
  readonly submission: SubmissionView;
  readonly title: string | null;
  readonly open: boolean;
  readonly onToggle: () => void;
}

function Row({ submission, title, open, onToggle }: RowProps) {
  const detailId = `submission-detail-${submission.submissionId}`;

  return (
    <Fragment>
      {/*
        Only the problem name is interactive — the reference's tables make one element per row
        hot, and a row-level onClick around a nested button was two targets for one action. The
        hover tint stays as a reading aid across the five columns; the click affordance is the
        name's chevron, colour change and focus ring. The negative margin trades the cell's own
        padding back into the button, so the touch target keeps the full row height.
      */}
      <tr className="first:border-t-0 border-t border-rule-hair hover:bg-ink/[0.03]">
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
            onClick={onToggle}
            className={
              title === null
                ? "-my-2.5 py-2.5 text-left text-ink/60"
                : "-my-2.5 py-2.5 text-left font-display font-bold hover:text-panther"
            }
            style={{ fontSize: "var(--text-sm)" }}
          >
            {/*
              The open state, drawn: down when open, right when closed. Same geometry as the
              shared Select chevron (10x6, 1.5 stroke, round caps) so the product keeps one
              arrow style. Decorative — `aria-expanded` already says this out loud.
            */}
            <svg
              aria-hidden="true"
              focusable="false"
              width={10}
              height={6}
              viewBox="0 0 10 6"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`mr-1.5 inline-block transition-transform ${open ? "" : "-rotate-90"}`}
            >
              <path d="M1 1L5 5L9 1" />
            </svg>
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
        <tr id={detailId} className="bg-ink/[0.02]">
          <td colSpan={5} className="px-3 pt-2 pb-3 sm:px-4">
            <SubmissionDetail submission={submission} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

/**
 * The same submission as a stacked card, rendered only below `sm`.
 *
 * At 360px the 560px min-width table put 41% of itself (Score, Time) off-screen and wrapped
 * problem titles to four lines inside the scroller — 117px rows against 46.6px at 1440. A
 * smaller `min-w` is not the fix, it just crushes the other columns; a phone gets two lines
 * per submission instead: verdict chip and title, then language, score and time as one quiet
 * metadata run. Same toggle, same `openId`, same detail panel as the table.
 */
function Card({ submission, title, open, onToggle }: RowProps) {
  const detailId = `submission-card-detail-${submission.submissionId}`;

  return (
    <li className="border-t border-rule-hair first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={onToggle}
        className="block w-full px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2">
          <svg
            aria-hidden="true"
            focusable="false"
            width={10}
            height={6}
            viewBox="0 0 10 6"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`inline-block shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
          >
            <path d="M1 1L5 5L9 1" />
          </svg>
          {submission.verdict === null ? (
            <span className="shrink-0 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
              Judging…
            </span>
          ) : (
            <VerdictChip verdict={submission.verdict} />
          )}
          <span
            className={
              title === null ? "min-w-0 text-ink/60" : "min-w-0 font-display font-bold"
            }
            style={{ fontSize: "var(--text-sm)" }}
          >
            {title ?? "Problem name unavailable"}
          </span>
        </span>
        <span
          className="mt-1 flex flex-wrap items-center gap-x-2 pl-[18px] text-ink/60"
          style={{ fontSize: "var(--text-xs)" }}
        >
          <span>{LANGUAGE_LABEL[submission.language]}</span>
          <span aria-hidden="true" className="text-ink/40">
            &#183;
          </span>
          {/* The word rides here so the verdict is never the coloured chip alone. */}
          {submission.verdict !== null && (
            <>
              <span>{VERDICT_DISPLAY[submission.verdict].label}</span>
              <span aria-hidden="true" className="text-ink/40">
                &#183;
              </span>
            </>
          )}
          <span className="numeric">score {submission.score}</span>
          <span aria-hidden="true" className="text-ink/40">
            &#183;
          </span>
          <span className="numeric">{formatTime(submission.submittedAt)}</span>
        </span>
      </button>

      {open && (
        <div id={detailId} className="bg-ink/[0.02] px-3 pt-2 pb-3">
          <SubmissionDetail submission={submission} />
        </div>
      )}
    </li>
  );
}

export function SubmissionHistory() {
  const participant = useParticipant();
  const scopeKey = participant.status === "joined" ? participant.scopeKey : participant.status;
  const loadSubmissions = useCallback(() => contestApi.listSubmissions(), []);
  const loadProblems = useCallback(() => contestApi.listProblems(), []);

  const submissions = useResource(loadSubmissions, scopeKey);
  const problems = useResource(loadProblems, scopeKey);
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

      The participant read distinguishes an anonymous visitor from a failed session check. The
      submissions read still wins when it succeeds, so a transient identity refresh cannot hide
      history that the server already authorized and returned.

      What it replaces is `submissions.error` painted verbatim — for this state that string is
      "Join the contest first", a `ForbiddenError` from the route layer naming a flow that was
      deleted, in alert red, with nothing to click.
    */
    if (participant.status === "error") {
      return (
        <div className="max-w-md rounded border border-panther/35 bg-paper p-4">
          <h1 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
            We could not check your sign-in
          </h1>
          <p role="alert" className="mt-1 text-ink/75" style={{ fontSize: "var(--text-sm)" }}>
            {participant.message}
          </p>
          <Button className="mt-3" variant="secondary" onClick={() => window.location.reload()}>
            Reload the page
          </Button>
        </div>
      );
    }

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
        HackerRank's empty state exactly: a dashed hairline box with one centred sentence, and a
        real button under the box handing the student the next step (theirs is "View Challenges").
        Without it this screen had zero interactive elements on first visit — a dead end. The
        second sentence answers the question a student actually has here after pressing "Run
        samples" three times: sample runs are free, unjudged, and never listed.
      */
      <div>
        <p
          className="rounded border border-dashed border-rule-edge bg-paper px-4 py-10 text-center text-ink/70"
          style={{ fontSize: "var(--text-sm)" }}
        >
          You have not made any submissions yet. Running samples is free and unjudged, so sample
          runs never appear here.
        </p>
        <p className="mt-4 text-center">
          {/* A link drawn in ui/Button's secondary skin (border, paper fill, 42px box) — Button
              itself only renders <button>, and this is a navigation, not an action. */}
          <Link
            href="/contest"
            className="inline-flex items-center justify-center rounded border border-rule-edge bg-paper px-5 py-2 leading-6 font-semibold text-ink transition-colors hover:bg-ink/5"
            style={{ fontSize: "var(--text-sm)" }}
          >
            Browse the problems
          </Link>
        </p>
      </div>
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
          {/* Button quiet, not a hand-rolled panther link (inventory D13): one retry grammar
              product-wide. */}
          <Button variant="quiet" size="sm" onClick={problems.reload}>
            Try again
          </Button>
        </p>
      )}

      {/*
        Below `sm` the submissions render as stacked cards instead of the table: at 360px the
        560px-wide table put Score and Time entirely off-screen. Only one of the two layouts is
        ever displayed, so the duplicate "Submissions" label never reaches the accessibility
        tree twice.
      */}
      <ul
        aria-label="Submissions"
        className="rounded border border-rule-edge bg-paper sm:hidden"
      >
        {submissions.data.map((submission) => (
          <Card
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
      </ul>

      {/*
        The table scrolls inside its own wrapper. Five columns in a narrow window do not fit, and
        the page must never scroll sideways (CLAUDE.md); `min-w` keeps the columns from crushing
        into single-word verticals once the scroller takes over. The wrapper is focusable and
        named for the same reason the <pre> blocks are: a scroll container a keyboard cannot
        reach is content a keyboard user cannot read.
      */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Submissions table"
        className="hidden overflow-x-auto rounded border border-rule-edge bg-paper sm:block"
      >
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
