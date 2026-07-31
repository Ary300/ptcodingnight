"use client";

import { useState } from "react";

import { Button } from "@/components/ui";
import { OverrideForm } from "@/components/admin/OverrideForm";
import { VerdictPill } from "@/components/admin/StatusPill";
import type { AdminSubmissionRow } from "@/components/admin/contract";
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
  // Fixed locale and timezone: a feed that renders differently on the organiser's laptop
  // and the projector laptop is a support call nobody has time for on the night.
  return new Date(iso).toISOString().slice(11, 19);
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

  return (
    <div className="flex flex-col gap-4">
      {participantFilter !== null && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-semibold" style={{ fontSize: "var(--text-sm)" }}>
            Showing {visible[0]?.displayName ?? "one participant"} only
          </p>
          <Button type="button" variant="ghost" onClick={() => onParticipantFilter(null)}>
            Show everyone
          </Button>
        </div>
      )}

      {internalErrors.length > 0 && (
        <p
          role="alert"
          className="rounded border border-panther px-3 py-2 font-semibold text-panther"
          style={{ fontSize: "var(--text-sm)" }}
        >
          {internalErrors.length} submission{internalErrors.length === 1 ? "" : "s"} ended in
          an internal error. The student was not shown a failure. Requeue once, then decide by
          hand.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ fontSize: "var(--text-sm)" }}>
          <caption className="sr-only">Live submissions feed</caption>
          <thead>
            <tr className="border-b border-ink/20 text-left">
              <th scope="col" className="py-2 pr-3 font-semibold">
                Time
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Participant
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Problem
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Lang
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Verdict
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">
                Score
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">
                Runtime
              </th>
              <th scope="col" className="py-2 font-semibold">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((submission) => (
              <tr key={submission.submissionId} className="border-b border-ink/10 align-top">
                <td className="numeric py-3 pr-3 whitespace-nowrap">{timeOf(submission.submittedAt)}</td>
                <td className="py-3 pr-3">
                  <button
                    type="button"
                    className="underline underline-offset-2"
                    onClick={() => onParticipantFilter(submission.participantId)}
                  >
                    {submission.displayName}
                  </button>
                  <div className="opacity-70" style={{ fontSize: "var(--text-xs)" }}>
                    {submission.divisionName}
                  </div>
                </td>
                <td className="py-3 pr-3">
                  <span className="numeric">{submission.slotLabel}</span> {submission.problemTitle}
                  {/*
                    An "overridden: <reason>" line used to hang under the problem title, and an
                    "attempt N" line under the verdict, both read from fields the server does not
                    send — the row shape was a hand-written proposal and those two were invented.
                    An override IS recorded, in AuditLog with its reason, and that is where it is
                    authoritative. Putting it back on the row is a real feature and is not this
                    one: it needs the audit row joined in, not a field made up.
                  */}
                </td>
                <td className="numeric py-3 pr-3">{submission.language}</td>
                <td className="py-3 pr-3">
                  <VerdictPill verdict={submission.verdict} />
                </td>
                <td className="numeric py-3 pr-3 text-right">{submission.score}</td>
                <td className="numeric py-3 pr-3 text-right whitespace-nowrap">
                  {submission.runtimeMs === null ? "-" : `${submission.runtimeMs} ms`}
                </td>
                <td className="py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      aria-expanded={rejudging === submission.submissionId}
                      onClick={() =>
                        setRejudging((current) =>
                          current === submission.submissionId ? null : submission.submissionId,
                        )
                      }
                    >
                      Rejudge
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      aria-expanded={overriding === submission.submissionId}
                      onClick={() =>
                        setOverriding((current) =>
                          current === submission.submissionId ? null : submission.submissionId,
                        )
                      }
                    >
                      Override
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visible.length === 0 && (
        <p className="opacity-70" style={{ fontSize: "var(--text-sm)" }}>
          No submissions yet.
        </p>
      )}

      {visible.map((submission) =>
        overriding === submission.submissionId ? (
          <OverrideForm
            key={`override-${submission.submissionId}`}
            submission={submission}
            onCancel={() => setOverriding(null)}
            onSubmit={(payload) => {
              setOverriding(null);
              onOverride(payload);
            }}
          />
        ) : null,
      )}

      {/*
        The rejudge form, with the reason it always required and never collected.

        A confirmation is not a reason. The old flow armed a ConfirmButton and the console supplied
        a constant, so every rejudge in the audit log said the same nine words — for an action that
        clears a verdict a student has already been shown and re-runs their code.
      */}
      {visible.map((submission) =>
        rejudging === submission.submissionId ? (
          <form
            key={`rejudge-${submission.submissionId}`}
            className="rounded border border-ink/20 bg-paper p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (rejudgeReason.trim() === "") return;
              onRejudge(submission.submissionId, rejudgeReason.trim());
              setRejudging(null);
              setRejudgeReason("");
            }}
          >
            <h3 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
              Rejudge {submission.displayName}&rsquo;s {submission.slotLabel}
            </h3>
            <p className="mt-1 max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
              This clears the verdict they have already seen and puts the submission back through
              the judge. The reason goes in the audit log.
            </p>

            <label className="mt-3 block" style={{ fontSize: "var(--text-sm)" }}>
              Reason
              <input
                value={rejudgeReason}
                onChange={(event) => setRejudgeReason(event.target.value)}
                required
                placeholder="e.g. the judge host was misconfigured for this round"
                className="mt-1 block w-full rounded border border-ink/25 bg-paper px-3 py-2"
                style={{ fontSize: "var(--text-sm)" }}
              />
            </label>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="submit" variant="secondary" disabled={rejudgeReason.trim() === ""}>
                Rejudge
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setRejudging(null);
                  setRejudgeReason("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null,
      )}
    </div>
  );
}
