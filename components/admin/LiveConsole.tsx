"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { JudgeHealthBar } from "@/components/admin/JudgeHealthBar";
import { AlertPlate, Panel } from "@/components/admin/Panel";
import { SubmissionFeed, type OverridePayload } from "@/components/admin/SubmissionFeed";
import { AdminConsoleViewSchema, type AdminConsoleView } from "@/lib/schemas/api";

/**
 * The live console — everything an organiser touches while the contest is running.
 *
 * ## What this used to be
 *
 * A mock. It took a fixture feed as a prop, and freeze, rejudge and override each appended a line
 * to an on-screen "action log" and called nothing. The log even said "the server keeps the
 * authoritative audit log", which was true of the server and false of this screen: pressing
 * "Freeze the public board" during a contest would have shown the organiser a frozen banner while
 * the room's projector kept updating.
 *
 * Every action here now goes to the route that performs it, and the screen re-reads the server
 * afterwards rather than trusting its own optimism. The action log stays, because "did that go
 * through?" is a real question when you are working fast in front of a room — but it now records
 * what the SERVER said, including failures.
 *
 * ## Polling, not a stream
 *
 * `/api/contests/{id}/stream` is scoped to what a competitor may see: it respects the freeze and
 * carries nobody else's submissions. An organiser needs the opposite of both, and adding an
 * "admin mode" to the one transport students hold open puts a leak of the frozen board one bug
 * away. A 3-second poll of an admin-only route is a handful of requests a minute from the two or
 * three people who have this screen open.
 *
 * The poll does not run while a mutation is in flight. Two writers to the same state — a freeze
 * that has been sent and a poll that returns the pre-freeze value — is how a button flickers back
 * to its old label a second after you press it.
 */

interface LoggedAction {
  readonly id: string;
  readonly at: string;
  readonly text: string;
  readonly failed: boolean;
}

const POLL_MS = 3_000;

export interface LiveConsoleProps {
  readonly contestId: string;
}

/** The error message out of the envelope, or a fallback. Never the raw body. */
async function messageOf(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body) {
      const message = (body as { error: { message?: unknown } }).error.message;
      if (typeof message === "string" && message !== "") return message;
    }
  } catch {
    // Fall through to the status line.
  }
  return `The server refused that (${String(response.status)}).`;
}

export function LiveConsole({ contestId }: LiveConsoleProps) {
  const [view, setView] = useState<AdminConsoleView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [participantFilter, setParticipantFilter] = useState<string | null>(null);
  const [log, setLog] = useState<readonly LoggedAction[]>([]);
  const [busy, setBusy] = useState(false);

  // A ref, not state: the poll reads it and must not be re-created when it changes.
  const busyRef = useRef(false);

  const record = useCallback((text: string, failed = false): void => {
    setLog((previous) => [
      {
        id: `${String(previous.length)}-${text.slice(0, 12)}`,
        at: new Date().toTimeString().slice(0, 8),
        text,
        failed,
      },
      ...previous,
    ]);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`/api/admin/contests/${contestId}/console`, {
        cache: "no-store",
      });
      if (!response.ok) {
        setLoadError(await messageOf(response));
        return;
      }
      const body: unknown = await response.json();
      setView(
        AdminConsoleViewSchema.parse(
          typeof body === "object" && body !== null && "data" in body
            ? (body as { data: unknown }).data
            : body,
        ),
      );
      setLoadError(null);
    } catch {
      setLoadError("Could not reach the server.");
    }
  }, [contestId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async (): Promise<void> => {
      if (!busyRef.current) await refresh();
      if (!cancelled) timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [refresh]);

  /**
   * Send one organiser action, then re-read.
   *
   * Re-reading rather than patching local state is deliberate: an override changes a score, a
   * rejudge changes a verdict back to null, and a freeze changes the contest's state. Guessing
   * any of those and being wrong shows the organiser a screen the server does not agree with,
   * which is the failure mode this whole rewrite exists to remove.
   */
  const act = useCallback(
    async (url: string, payload: unknown, describe: string): Promise<void> => {
      setBusy(true);
      busyRef.current = true;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          record(`${describe} — REFUSED: ${await messageOf(response)}`, true);
          return;
        }
        record(describe);
      } catch {
        record(`${describe} — could not reach the server`, true);
      } finally {
        busyRef.current = false;
        setBusy(false);
        await refresh();
      }
    },
    [record, refresh],
  );

  const setFreeze = useCallback(
    (next: boolean): void => {
      void act(
        `/api/admin/contests/${contestId}/freeze`,
        { frozen: next },
        next ? "Froze the public board" : "Unfroze the public board",
      );
    },
    [act, contestId],
  );

  const onRejudge = useCallback(
    (submissionId: string): void => {
      void act(
        `/api/admin/submissions/${submissionId}/rejudge`,
        { reason: "Requeued from the live console" },
        `Requeued ${submissionId} for rejudging`,
      );
    },
    [act],
  );

  const onOverride = useCallback(
    (payload: OverridePayload): void => {
      void act(
        `/api/admin/submissions/${payload.submissionId}/override`,
        payload,
        `Override ${payload.submissionId} → ${payload.verdict}, ${String(payload.score)} pts. Reason: ${payload.reason}`,
      );
    },
    [act],
  );

  if (view === null) {
    return loadError === null ? (
      <p role="status" className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
        Loading the console…
      </p>
    ) : (
      <AlertPlate tone="alarm" title="The console could not be loaded">
        {loadError}
      </AlertPlate>
    );
  }

  const { frozen, submissions, total, health } = view;
  const windowed = total > submissions.length;

  return (
    <div className="flex flex-col gap-6">
      {/*
        A failed POLL is a notice, not a takeover. The screen still holds the last good read, and
        an organiser looking at three-second-old data with a warning on it is far better served
        than one whose console was replaced by an error.
      */}
      {loadError !== null && (
        <p
          role="status"
          className="rounded border border-panther px-3 py-2 font-semibold text-panther"
          style={{ fontSize: "var(--text-sm)" }}
        >
          Not updating: {loadError} What is below is the last successful read.
        </p>
      )}

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
              disabled={busy}
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
            disabled={busy}
          />
        </Panel>
      )}

      <Panel
        title="Submissions"
        aside={
          <span className="numeric text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
            {/*
              Says WHICH submissions when the feed is windowed. A list that silently stops at 200
              reads as "that is all of them", and the one thing an organiser uses this feed for is
              noticing something that did not come back.
            */}
            {windowed
              ? `most recent ${String(submissions.length)} of ${String(total)}`
              : `${String(total)} in this contest`}
          </span>
        }
      >
        <SubmissionFeed
          submissions={submissions}
          participantFilter={participantFilter}
          onParticipantFilter={setParticipantFilter}
          onRejudge={onRejudge}
          onOverride={onOverride}
        />
      </Panel>

      <Panel
        title="Action log"
        description="What this session has done, and what the server said back. AuditLog is the authoritative record."
      >
        {log.length === 0 ? (
          <p className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            Nothing yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" style={{ fontSize: "var(--text-sm)" }}>
            {log.map((entry) => (
              <li key={entry.id} className="flex gap-3 border-b border-ink/10 pb-2">
                <span className="numeric text-ink/60">{entry.at}</span>
                <span className={`min-w-0 break-words ${entry.failed ? "text-panther" : ""}`}>
                  {entry.text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
