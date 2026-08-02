"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui";
import { Select, TextArea, TextInput } from "@/components/admin/Field";
import { verdictName } from "@/components/admin/StatusPill";
import type { AdminSubmissionRow } from "@/components/admin/contract";
import { OverrideVerdictRequestSchema } from "@/lib/schemas/api";
import { VerdictSchema, type Verdict } from "@/lib/schemas/judge";

/**
 * Manual verdict override (PRD §9.2).
 *
 * The reason is **required and enforced twice**: the submit control is disabled while it is
 * blank, and the handler re-parses with `OverrideVerdictRequestSchema` and refuses before
 * anything is sent. Belt and braces on purpose — a disabled button is a hint, not a
 * guarantee, and this writes to the audit log that explains a disputed result months later.
 * "Because the admin said so" is not an explanation.
 *
 * The schema is the frozen one from `lib/schemas/api.ts`, so the client cannot drift from
 * what the route will accept.
 */

const VERDICTS: readonly Verdict[] = VerdictSchema.options;

export interface OverrideFormProps {
  submission: AdminSubmissionRow;
  onSubmit: (payload: { submissionId: string; verdict: Verdict; score: number; reason: string }) => void;
  onCancel: () => void;
}

export function OverrideForm({ submission, onSubmit, onCancel }: OverrideFormProps) {
  const [verdict, setVerdict] = useState<Verdict>(submission.verdict ?? "AC");
  const [score, setScore] = useState<number>(submission.score);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reasonIsBlank = reason.trim().length === 0;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const parsed = OverrideVerdictRequestSchema.safeParse({
      submissionId: submission.submissionId,
      verdict,
      score,
      reason,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "This override is not valid.");
      return;
    }

    setError(null);
    onSubmit(parsed.data);
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-group rounded-panel border border-panther/50 p-4"
    >
      <div className="flex flex-col gap-tight">
        <h3
          className="font-semibold"
          style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-md)" }}
        >
          Override verdict
        </h3>
        {/* `text-ink/70`, not `opacity-75`: a wrapper opacity multiplies with child alpha. */}
        <p className="numeric text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
          {submission.displayName} · {submission.slotLabel} {submission.problemTitle} ·{" "}
          {submission.submissionId}
        </p>
      </div>

      <div className="grid gap-group sm:grid-cols-2">
        <Select
          label="New verdict"
          required
          value={verdict}
          onChange={(e) => {
            const next = VerdictSchema.safeParse(e.target.value);
            if (next.success) setVerdict(next.data);
          }}
        >
          {VERDICTS.map((option) => (
            <option key={option} value={option}>
              {option} - {verdictName(option)}
            </option>
          ))}
        </Select>

        <TextInput
          label="Score"
          type="number"
          min={0}
          step={1}
          required
          numeric
          value={score}
          onChange={(e) => setScore(Math.max(0, Math.trunc(e.target.valueAsNumber || 0)))}
        />
      </div>

      <TextArea
        label="Reason"
        required
        rows={3}
        value={reason}
        maxLength={500}
        error={error}
        // The log entry is read by whoever has to explain this result later, which is why the
        // hint pushes for facts over judgement calls.
        hint="Goes in the audit log. Say what happened, not that you decided."
        onChange={(e) => {
          setReason(e.target.value);
          if (error !== null) setError(null);
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="danger" disabled={reasonIsBlank}>
          Apply override
        </Button>
        <Button type="button" variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
        {reasonIsBlank && (
          <span className="text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
            Write a reason first.
          </span>
        )}
      </div>
    </form>
  );
}
