"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";
import { API_ROUTES, AdminEndTimeResponseSchema } from "@/lib/schemas/api";
import {
  eventWallClockToInstant,
  formatEventTime,
  instantToEventWallClock,
} from "@/lib/contest/event-time";

import { ConfirmButton } from "./ConfirmButton";

/**
 * Move the end of the contest, or reopen one that was ended by mistake.
 *
 * The quick buttons are the night's sentence: "everybody gets five more minutes". The field is for
 * the case the buttons cannot say, such as setting 8:15 again after an early Open now. Times are
 * typed and printed in the event's zone, whatever zone this laptop is set to.
 *
 * Reopening is confirmed and nothing else is. Extending is undone by extending back; reopening an
 * ended contest takes the final board off the wall, which is worth one more press.
 */

const EXTEND_MINUTES = [5, 10, 15] as const;

export function EndTimeControl({
  contestId,
  endsAt,
  state,
  closedAndFrozen = false,
}: {
  readonly contestId: string;
  /** ISO. */
  readonly endsAt: string;
  readonly state: string;
  /**
   * End was pressed on a frozen board: submissions are closed but the contest is not ENDED, because
   * ENDED would reveal the board. Reopening works the same way and the board stays frozen.
   */
  readonly closedAndFrozen?: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(endsAt);
  const [typed, setTyped] = useState(instantToEventWallClock(endsAt));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const ended = state === "ENDED" || closedAndFrozen;
  if (state === "ARCHIVED") return null;

  const save = async (next: Date | null, reason: string): Promise<void> => {
    if (next === null) {
      setFailed(true);
      setMessage("Pick a date and a time.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(API_ROUTES.adminEndTime(contestId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endsAt: next.toISOString(), reason }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const error =
          typeof payload === "object" && payload !== null && "error" in payload
            ? (payload as { error: { message?: string } | null }).error
            : null;
        setFailed(true);
        setMessage(error?.message ?? "That could not be saved.");
        return;
      }
      const data =
        typeof payload === "object" && payload !== null && "data" in payload
          ? (payload as { data: unknown }).data
          : null;
      const saved = AdminEndTimeResponseSchema.parse(data);
      setCurrent(saved.endsAt);
      setTyped(instantToEventWallClock(saved.endsAt));
      setFailed(false);
      setMessage(
        saved.resumed
          ? `Reopened. Submissions are open until ${formatEventTime(saved.endsAt)}. Set the freeze again below if the board should freeze.`
          : `Saved. Submissions close at ${formatEventTime(saved.endsAt)}.`,
      );
      // The Window panel and the freeze line above read the same columns.
      router.refresh();
    } catch {
      setFailed(true);
      setMessage("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const extend = (minutes: number): void => {
    void save(
      new Date(new Date(current).getTime() + minutes * 60_000),
      `Extended by ${String(minutes)} minutes from the Setup tab`,
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
        {closedAndFrozen ? (
          <>
            Submissions are closed. To reopen them, choose a new end time and confirm. Students can
            submit again until then, and the board stays frozen.
          </>
        ) : ended ? (
          <>
            This contest has ended. To reopen it, choose a new end time and confirm. Students can
            submit again until then.
          </>
        ) : (
          <>
            Submissions close at{" "}
            <span className="numeric font-semibold text-ink">{formatEventTime(current)}</span>. A
            scheduled freeze moves with the end.
          </>
        )}
      </p>

      {!ended && (
        <div className="flex flex-wrap items-center gap-2">
          {EXTEND_MINUTES.map((minutes) => (
            <Button
              key={minutes}
              variant="secondary"
              disabled={busy}
              onClick={() => extend(minutes)}
            >
              {`${String(minutes)} more minutes`}
            </Button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1" style={{ fontSize: "var(--text-sm)" }}>
          <span className="text-ink/70">End time, Indianapolis</span>
          <input
            type="datetime-local"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={busy}
            className="rounded-chip border border-rule-edge bg-paper px-3 py-2 text-ink"
          />
        </label>
        {ended ? (
          <ConfirmButton
            label="Reopen until this time"
            confirmLabel="Reopen the contest"
            variant="primary"
            disabled={busy}
            onConfirm={() =>
              void save(eventWallClockToInstant(typed), "Reopened from the Setup tab")
            }
          />
        ) : (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void save(eventWallClockToInstant(typed), "End time set from the Setup tab")
            }
          >
            Set end time
          </Button>
        )}
      </div>

      {message !== null && (
        <p
          role="status"
          className={`motion-swap-in font-semibold ${failed ? "text-panther" : "text-ink"}`}
          style={{ fontSize: "var(--text-sm)" }}
        >
          {message}
        </p>
      )}
    </div>
  );
}
