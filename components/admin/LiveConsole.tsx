"use client";

import { useState } from "react";

import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { JudgeHealthBar } from "@/components/admin/JudgeHealthBar";
import { AlertPlate, Panel } from "@/components/admin/Panel";
import { SubmissionFeed, type OverridePayload } from "@/components/admin/SubmissionFeed";
import type { AdminSubmissionRow, JudgeHealth } from "@/components/admin/contract";
import { FreezeRequestSchema } from "@/lib/schemas/api";

/**
 * The live console — everything an organiser touches while the contest is running.
 *
 * Every action here is recorded in a visible log rather than firing silently. Two reasons:
 * the actions are audit-logged server-side anyway (PRD §6.3), and an organiser working fast
 * needs to be able to answer "did that go through?" without leaving the screen.
 *
 * No route exists in this worktree (`app/api/**` is backend-api's), so the handlers record
 * intent. Each one is a single call site to replace.
 */

interface LoggedAction {
  readonly id: string;
  readonly at: string;
  readonly text: string;
}

export interface LiveConsoleProps {
  submissions: readonly AdminSubmissionRow[];
  health: JudgeHealth;
  initiallyFrozen?: boolean;
}

export function LiveConsole({ submissions, health, initiallyFrozen = false }: LiveConsoleProps) {
  const [frozen, setFrozen] = useState(initiallyFrozen);
  const [participantFilter, setParticipantFilter] = useState<string | null>(null);
  const [log, setLog] = useState<readonly LoggedAction[]>([]);

  const record = (text: string): void => {
    setLog((previous) => [
      { id: `${Date.now()}-${previous.length}`, at: new Date().toISOString().slice(11, 19), text },
      ...previous,
    ]);
  };

  const setFreeze = (next: boolean): void => {
    const parsed = FreezeRequestSchema.safeParse({ frozen: next });
    if (!parsed.success) return;
    setFrozen(parsed.data.frozen);
    record(parsed.data.frozen ? "Froze the public board" : "Unfroze the public board");
  };

  const onOverride = (payload: OverridePayload): void => {
    record(
      `Override ${payload.submissionId} -> ${payload.verdict}, ${payload.score} pts. Reason: ${payload.reason}`,
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <JudgeHealthBar health={health} />

      {frozen ? (
        <AlertPlate
          tone="notice"
          title="The public board is frozen"
          actions={
            <ConfirmButton
              label="Unfreeze and reveal"
              confirmLabel="Reveal the final board"
              variant="primary"
              onConfirm={() => setFreeze(false)}
            />
          }
        >
          Students and the projector are seeing the standings as they were at the freeze.
          Judging is still running and the console below is live truth. Unfreezing is the
          reveal, so do it when the room is watching.
        </AlertPlate>
      ) : (
        <Panel
          title="Public board"
          description="Freezing stops the public standings updating while judging continues. The admin view stays live either way (PRD §6.3)."
        >
          <ConfirmButton
            label="Freeze the public board"
            confirmLabel="Freeze now"
            variant="secondary"
            onConfirm={() => setFreeze(true)}
          />
        </Panel>
      )}

      <Panel
        title="Submissions"
        aside={
          <span className="numeric opacity-70" style={{ fontSize: "var(--text-xs)" }}>
            {submissions.length} in this window
          </span>
        }
      >
        <SubmissionFeed
          submissions={submissions}
          participantFilter={participantFilter}
          onParticipantFilter={setParticipantFilter}
          onRejudge={(id) => record(`Requeued ${id} for rejudging`)}
          onOverride={onOverride}
        />
      </Panel>

      <Panel title="Action log" description="What this session has done. The server keeps the authoritative audit log.">
        {log.length === 0 ? (
          <p className="opacity-70" style={{ fontSize: "var(--text-sm)" }}>
            Nothing yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" style={{ fontSize: "var(--text-sm)" }}>
            {log.map((entry) => (
              <li key={entry.id} className="flex gap-3 border-b border-ink/10 pb-2">
                <span className="numeric opacity-60">{entry.at}</span>
                <span className="min-w-0 break-words">{entry.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
