"use client";

import { useState } from "react";

import { Button } from "@/components/ui";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { OverrideForm } from "@/components/admin/OverrideForm";
import { VerdictPill } from "@/components/admin/StatusPill";
import type { AdminSubmissionRow } from "@/components/admin/contract";
import type { Verdict } from "@/lib/schemas/judge";

/**
 * The submissions feed, with the two manual actions on it (PRD §9.2).
 *
 * Rejudge is confirmed because it discards a verdict a student has already seen. Override
 * opens a form rather than a menu, because it cannot be applied without a written reason.
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
  onRejudge: (submissionId: string) => void;
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
                  {submission.overriddenReason !== null && (
                    <div className="max-w-[36ch] text-panther" style={{ fontSize: "var(--text-xs)" }}>
                      overridden: {submission.overriddenReason}
                    </div>
                  )}
                </td>
                <td className="numeric py-3 pr-3">{submission.language}</td>
                <td className="py-3 pr-3">
                  <VerdictPill verdict={submission.verdict} />
                  {submission.attempt > 1 && (
                    <div className="numeric opacity-70" style={{ fontSize: "var(--text-xs)" }}>
                      attempt {submission.attempt}
                    </div>
                  )}
                </td>
                <td className="numeric py-3 pr-3 text-right">{submission.score}</td>
                <td className="numeric py-3 pr-3 text-right whitespace-nowrap">
                  {submission.runtimeMs === null ? "-" : `${submission.runtimeMs} ms`}
                </td>
                <td className="py-3">
                  <div className="flex flex-wrap gap-2">
                    <ConfirmButton
                      label="Rejudge"
                      confirmLabel="Rejudge this submission"
                      variant="secondary"
                      onConfirm={() => onRejudge(submission.submissionId)}
                    />
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
    </div>
  );
}
