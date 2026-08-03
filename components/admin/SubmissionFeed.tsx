"use client";

import { Fragment, useState } from "react";
import { formatEventTimeSeconds } from "@/lib/contest/event-time";

import { Button, Stacked, TBody, TD, TH, THead, TR, Table } from "@/components/ui";
import { OverrideForm } from "@/components/admin/OverrideForm";
import { VerdictPill } from "@/components/admin/StatusPill";
import type { AdminSubmissionRow } from "@/components/admin/contract";
import { VARIANTS } from "@/lib/judge/runtimes";
import type { Verdict } from "@/lib/schemas/judge";

/**
 * The submissions feed, with the two manual actions on it (PRD §9.2).
 *
 * BOTH manual actions open a form, because both require a written reason. Rejudge used to arm a
 * confirmation instead, and the console supplied a constant — so every rejudge in the audit log
 * said the same nine words, for an action that clears a verdict a student has already been shown.
 * A confirmation is not a reason.
 *
 * `IE` rows are called out. PRD §7.2 requeues an internal error once and then alerts an
 * admin — this feed is where that alert has to be visible, since the student is deliberately
 * never shown `IE` as a failure.
 *
 * ## Three things that were wrong on the night-of screen
 *
 * **The language column printed the enum.** `JAVASCRIPT_NODE22`, `PYTHON_312`, `CPP_17`. The
 * registry has carried a human `label` for every variant all along (`lib/judge/runtimes.ts`), and
 * reading it here is also what keeps this column from going stale: a renamed variant changes one
 * place, not two. Deriving the label rather than restating it is the same rule
 * `components/contest/editor/types.ts` follows on the student side.
 *
 * **Twenty-eight full-size buttons.** A filled `Rejudge` and a red-outlined `Override` on each of
 * fourteen rows, all shouting at once, with nothing to say which one the organizer came for. Both
 * references keep an in-row action as TEXT and promote only the page's one primary action, so
 * these are `variant="quiet"` now. `danger` is left for the override *form's* apply button, where
 * it actually means something.
 *
 * **The document scrolled sideways at 360px.** The table sits in an `overflow-x-auto` box, which
 * was doing nothing: `VerdictPill` renders a `.sr-only` span per row, `.sr-only` is
 * `position:absolute`, and an absolutely positioned element is only clipped by an ancestor that is
 * *its containing block*. With no positioned ancestor inside the scroller those spans took their
 * static position out at x≈466 — inside the wide table, outside the scroller's clip — and dragged
 * the whole document with them. `relative` on the scroller makes it the containing block and the
 * overflow goes back inside the box where the caption says it is. Nothing visible moved, which is
 * why this survived a screenshot review: the offending elements are invisible by construction.
 */

export interface OverridePayload {
  submissionId: string;
  verdict: Verdict;
  score: number;
  reason: string;
}

export interface SubmissionFeedProps {
  submissions: readonly AdminSubmissionRow[];
  /**
   * A rejudge carries a REASON, like an override does.
   *
   * It used to take only the id, and `LiveConsole` supplied the constant "Requeued from the live
   * console" — so every rejudge ever performed wrote a byte-identical audit row. The route's own
   * docstring says a reason is required "exactly as it is for an override. Both change a
   * student's score without the student doing anything." A required field satisfied by a constant
   * is a required field in name only.
   */
  onRejudge: (submissionId: string, reason: string) => void;
  onOverride: (payload: OverridePayload) => void;
  /** Set by the drill-down. Null = everyone. */
  participantFilter: string | null;
  onParticipantFilter: (participantId: string | null) => void;
}

function timeOf(iso: string): string {
  // Fixed locale and timezone, for the original reason (two laptops must render one feed the
  // same way), but pinned to the EVENT's clock now rather than UTC: the organizer read 23:41 on
  // a screen at half past seven and overruled the honesty argument. Eastern, everywhere, always.
  return formatEventTimeSeconds(iso);
}

/**
 * The registry's human name for a variant.
 *
 * `AdminSubmissionRow.language` is `LanguageSchema`, the registry's own enum, so this lookup is
 * total by construction — which is the point. The four-homes problem in CLAUDE.md is that a stale
 * language id parses as a string and dies at the registry; reading the label THROUGH the registry
 * means a rename cannot leave this column behind.
 */
function languageLabel(language: AdminSubmissionRow["language"]): string {
  return VARIANTS[language].label;
}

/**
 * Stage attribution as one muted line: "queue 0.2s / create 1.1s / compile 3.0s / run 1.4s,
 * attempt 1". This is the latency investigation's instrument — a slow submission names its own
 * bucket here instead of being guessed at from the wall clock.
 *
 * Stages the run never had are OMITTED, not zeroed: an interpreted run has no compile segment,
 * and a CE has no run segment. A "0.0s" for a stage that never happened reads as a measurement.
 */
function timingsLine(timings: NonNullable<AdminSubmissionRow["timings"]>): string {
  const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

  const stages: readonly (readonly [string, number | null])[] = [
    ["queue", timings.queueMs],
    ["create", timings.createMs],
    ["compile", timings.compileMs],
    ["run", timings.runMs],
  ];

  const shown = stages
    .filter((stage): stage is readonly [string, number] => stage[1] !== null)
    .map(([name, ms]) => `${name} ${seconds(ms)}`)
    .join(" / ");

  return `${shown}, attempt ${String(timings.attempt)}`;
}

export function SubmissionFeed({
  submissions,
  onRejudge,
  onOverride,
  participantFilter,
  onParticipantFilter,
}: SubmissionFeedProps) {
  const [overriding, setOverriding] = useState<string | null>(null);
  const [rejudging, setRejudging] = useState<string | null>(null);
  const [rejudgeReason, setRejudgeReason] = useState("");

  const visible =
    participantFilter === null
      ? submissions
      : submissions.filter((s) => s.participantId === participantFilter);

  const internalErrors = visible.filter((s) => s.verdict === "IE");

  /** Opening one form closes the other: two open reason boxes on one row is two audit rows. */
  const toggleRejudge = (id: string): void => {
    setOverriding(null);
    setRejudging((current) => (current === id ? null : id));
    setRejudgeReason("");
  };
  const toggleOverride = (id: string): void => {
    setRejudging(null);
    setOverriding((current) => (current === id ? null : id));
  };

  return (
    <div className="flex min-w-0 flex-col gap-group">
      {participantFilter !== null && (
        <div className="motion-swap-in flex flex-wrap items-center gap-3">
          <p className="font-semibold" style={{ fontSize: "var(--text-sm)" }}>
            Showing {visible[0]?.displayName ?? "one participant"} only
          </p>
          <Button type="button" variant="quiet" size="sm" onClick={() => onParticipantFilter(null)}>
            Show everyone
          </Button>
        </div>
      )}

      {internalErrors.length > 0 && (
        <p
          role="alert"
          className="motion-swap-in rounded-chip border border-panther px-3 py-2 font-semibold text-panther"
          style={{ fontSize: "var(--text-sm)" }}
        >
          {internalErrors.length} submission{internalErrors.length === 1 ? "" : "s"} ended in
          an internal error. The student was not shown a failure. Requeue once, then decide by
          hand.
        </p>
      )}

      {visible.length === 0 ? (
        <p className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          No submissions yet.
        </p>
      ) : (
        /*
          `relative` is load-bearing, not decoration — see the docstring above. `min-w-0` is the
          other half: without it a flex child sizes to its content and the scroller never engages
          at all, which is the bug that made `/team` drag the document sideways.
        */
        <div
          /*
            Keyed by WHOSE feed is on screen, so drilling into a participant rises the new table
            in over `--motion-swap` instead of replacing it in the frame of the click. Measured
            before this: clicking a name took the feed from 8 rows to 2 and the only thing that
            animated anywhere on the console was the "Showing E2E Grace only" banner above it —
            the banner explained a change the eye never saw happen.

            The key is the FILTER, never the submissions. This feed polls while a contest runs,
            and keying it on its contents would replay the entrance on every poll: motion that
            reports the clock rather than the organizer's action, on the one screen that is
            supposed to sit still until something happens.
          */
          key={participantFilter ?? "everyone"}
          className="motion-swap-in relative w-full min-w-0 overflow-x-auto"
        >
          {/*
            A floor on the table's width, so a phone scrolls the box instead of compressing the
            columns. Without it `w-full` squeezed six columns into 360px and "B2 Beautiful Days at
            the Movies" wrapped to five lines — a row three times taller than the one above it,
            which destroys the scan this feed exists for. Scrolling sideways is what the team
            board already asks of a phone, and it is the honest trade for a six-column table.
          */}
          <Table caption="Live submissions feed" className="min-w-[46rem]">
            <THead>
              <TR>
                <TH numeric>Time (ET)</TH>
                <TH>Participant</TH>
                <TH>Problem</TH>
                <TH numeric>Score</TH>
                <TH>Verdict</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {visible.map((submission) => {
                const openForm =
                  rejudging === submission.submissionId
                    ? "rejudge"
                    : overriding === submission.submissionId
                      ? "override"
                      : null;

                return (
                  /*
                    New rows land at the top per 3-second poll, in the same frame. submissionId
                    keys are stable across polls, so mount-once is automatic: a row rises exactly
                    once, on the poll that delivered it. The class sits on the block content of
                    each cell, never on the `<tr>` (transform on `display: table-row` is
                    unreliable in WebKit). A filter toggle remounts what it reveals, which IS
                    content replacing content; no stagger here, fourteen rows cascading on every
                    toggle would be more motion than the change deserves.
                  */
                  <Fragment key={submission.submissionId}>
                    <TR>
                      <TD numeric className="whitespace-nowrap align-top">
                        <span className="motion-swap-in block">
                          {timeOf(submission.submittedAt)}
                        </span>
                      </TD>
                      <TD className="align-top">
                        <Stacked
                          className="motion-swap-in"
                          value={
                            <button
                              type="button"
                              className="text-left underline underline-offset-4"
                              onClick={() => onParticipantFilter(submission.participantId)}
                            >
                              {submission.displayName}
                            </button>
                          }
                          detail={submission.divisionName}
                        />
                      </TD>
                      <TD className="align-top">
                        {/*
                          The language sits under the problem rather than in a column of its own.
                          Six columns fit a phone where eight did not, and the variant is a fact
                          ABOUT this attempt at this problem — "Java 17" next to "A1 Two Sum" reads
                          the way an organizer asks the question.
                        */}
                        <Stacked
                          className="motion-swap-in"
                          value={
                            <>
                              <span className="numeric">{submission.slotLabel}</span>{" "}
                              {submission.problemTitle}
                            </>
                          }
                          detail={languageLabel(submission.language)}
                        />
                        {/*
                          An "overridden: <reason>" line used to hang under the problem title, and
                          an "attempt N" line under the verdict, both read from fields the server
                          does not send — the row shape was a hand-written proposal and those two
                          were invented. An override IS recorded, in AuditLog with its reason, and
                          that is where it is authoritative. Putting it back on the row is a real
                          feature and is not this one: it needs the audit row joined in, not a
                          field made up.

                          The stage line below is NOT that mistake repeated: `timings` is a field
                          the server actually sends, derived from marks the worker actually
                          recorded (Submission.judgeTimings). Old rows have none and show none.
                        */}
                        {submission.timings !== null && (
                          <p
                            className="motion-swap-in numeric text-ink/60"
                            style={{ fontSize: "var(--text-xs)" }}
                          >
                            {timingsLine(submission.timings)}
                          </p>
                        )}
                      </TD>
                      <TD numeric className="align-top">
                        <Stacked
                          value={submission.score}
                          detail={
                            submission.runtimeMs === null ? undefined : `${submission.runtimeMs} ms`
                          }
                          className="motion-swap-in items-end"
                        />
                      </TD>
                      <TD className="align-top">
                        <span className="motion-swap-in block">
                          <VerdictPill verdict={submission.verdict} />
                        </span>
                      </TD>
                      <TD className="align-top">
                        <div className="motion-swap-in flex flex-wrap gap-x-3 gap-y-1">
                          <Button
                            type="button"
                            variant="quiet"
                            aria-expanded={openForm === "rejudge"}
                            onClick={() => toggleRejudge(submission.submissionId)}
                          >
                            Rejudge
                          </Button>
                          <Button
                            type="button"
                            variant="quiet"
                            aria-expanded={openForm === "override"}
                            onClick={() => toggleOverride(submission.submissionId)}
                          >
                            Override
                          </Button>
                        </div>
                      </TD>
                    </TR>

                    {/*
                      The form opens UNDER ITS OWN ROW.

                      Both forms used to render in a second pass below the whole table, so on a
                      fourteen-row feed the reason box for row three appeared a screen and a half
                      away from row three — and the only thing naming which submission it belonged
                      to was a heading the organizer had to scroll back up to check against.
                    */}
                    {openForm !== null && (
                      <tr>
                        <td colSpan={6} className="bg-ink/[0.02] px-3 py-3">
                          {/*
                            The entrance is on a div INSIDE the `<td>`, not on the `<tr>` (the
                            WebKit table-row caveat), and it is keyed by which form is open so
                            that Rejudge→Override — two simultaneous jumps, one form closing as
                            the other opens — re-runs it. A whole form surface arriving is the
                            panel duration. Paper ground, full-strength text: transform-only is
                            safe and required.
                          */}
                          <div key={openForm} className="motion-panel-in">
                          {openForm === "override" ? (
                            <OverrideForm
                              submission={submission}
                              onCancel={() => setOverriding(null)}
                              onSubmit={(payload) => {
                                setOverriding(null);
                                onOverride(payload);
                              }}
                            />
                          ) : (
                            <form
                              className="flex flex-col gap-tight"
                              onSubmit={(event) => {
                                event.preventDefault();
                                if (rejudgeReason.trim() === "") return;
                                onRejudge(submission.submissionId, rejudgeReason.trim());
                                setRejudging(null);
                                setRejudgeReason("");
                              }}
                            >
                              <h3
                                className="font-display font-bold"
                                style={{ fontSize: "var(--text-md)" }}
                              >
                                Rejudge {submission.displayName}&rsquo;s {submission.slotLabel}
                              </h3>
                              <p
                                className="max-w-[70ch] text-ink/70"
                                style={{ fontSize: "var(--text-sm)" }}
                              >
                                This clears the verdict they have already seen and puts the
                                submission back through the judge. The reason goes in the audit
                                log.
                              </p>

                              <label className="block" style={{ fontSize: "var(--text-sm)" }}>
                                Reason
                                <input
                                  value={rejudgeReason}
                                  onChange={(event) => setRejudgeReason(event.target.value)}
                                  required
                                  placeholder="e.g. the judge host was misconfigured for this round"
                                  className="mt-1 block w-full rounded-flat border border-rule-edge bg-paper px-3 py-2"
                                  style={{ fontSize: "var(--text-sm)" }}
                                />
                              </label>

                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="submit"
                                  variant="danger"
                                  size="sm"
                                  disabled={rejudgeReason.trim() === ""}
                                >
                                  Rejudge
                                </Button>
                                <Button
                                  type="button"
                                  variant="quiet"
                                  size="sm"
                                  onClick={() => {
                                    setRejudging(null);
                                    setRejudgeReason("");
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </form>
                          )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
