"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";
import { API_ROUTES, AdminGroupUnlockResponseSchema } from "@/lib/schemas/api";

/**
 * When the whole-team questions open, set the way an organizer says it: minutes after the start.
 *
 * The night runs "individual time for the first thirty minutes, then team collaborative work". The
 * individual stretch is a sentence about the START, so the unit here is minutes after it, and the
 * server does the addition. Starting the contest early or moving its window re-derives the opening,
 * and the absolute time is printed back so the decision can be checked against the clock on the
 * wall. The mirror of `FreezeSchedule`, which counts from the other end.
 *
 * Nothing on this screen opens a question. The list, the statement and the submit path all read the
 * same contest column and take the later of it and the row's own unlock, so a team question an
 * organizer sees as locked here is locked for the room too.
 */

const PRESETS = [15, 30, 45] as const;

export function GroupUnlock({
  contestId,
  startsAt,
  minutesAfterStart,
  groupProblemCount,
  over,
}: {
  readonly contestId: string;
  /** ISO. Used only to print the resulting wall-clock time. */
  readonly startsAt: string;
  readonly minutesAfterStart: number | null;
  /** How many GROUP rows the clock applies to, so an idle setting can say it is idle. */
  readonly groupProblemCount: number;
  /** The contest is ENDED or ARCHIVED, so there is nothing left to open. */
  readonly over: boolean;
}) {
  const router = useRouter();
  const [minutes, setMinutes] = useState<number | null>(minutesAfterStart);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Derived here rather than stored, the same way every server-side reader derives it.
  const opensAt = minutes === null ? null : addMinutes(startsAt, minutes);

  const save = async (next: number | null): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(API_ROUTES.adminGroupUnlock(contestId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutesAfterStart: next }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        // The server's sentence, not a generic one: every refusal names the thing to change.
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
      const saved = AdminGroupUnlockResponseSchema.parse(data);
      setMinutes(saved.minutesAfterStart);
      setFailed(false);
      setMessage(
        saved.groupUnlockAt === null
          ? "Saved. Team questions open with everything else at the start."
          : saved.openNow
            ? "Saved. That time has already passed, so the team questions are open now."
            : `Saved. Team questions open at ${clockTime(saved.groupUnlockAt)}.`,
      );
      // Re-read the server component above this one, so the "Team questions open" fact in the
      // Window panel agrees with the sentence this just printed.
      router.refresh();
    } catch {
      setFailed(true);
      setMessage("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
        {minutes === null || opensAt === null ? (
          <>Team questions open with everything else at the start.</>
        ) : (
          <>
            Team questions open{" "}
            <strong className="text-ink">{minutes} minutes after the start</strong>, at{" "}
            <span className="numeric font-semibold text-ink">{clockTime(opensAt)}</span>. Until then
            everyone works on their own set.
          </>
        )}
      </p>

      {over ? (
        <p className="font-semibold text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          This contest is over, so there are no team questions left to open.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset}
              variant={minutes === preset ? "primary" : "secondary"}
              disabled={busy}
              onClick={() => void save(preset)}
            >
              {preset} min
            </Button>
          ))}
          <Button variant="quiet" disabled={busy || minutes === null} onClick={() => void save(null)}>
            Open at the start
          </Button>
        </div>
      )}

      <p className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
        Contest starts at <span className="numeric">{clockTime(startsAt)}</span>.
        {groupProblemCount === 0 && (
          <>
            {" "}
            The line-up has no team questions yet, so this clock has nothing to open until one is
            added.
          </>
        )}
      </p>

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

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

/**
 * A wall-clock time in the reader's own zone, the same shape `FreezeSchedule` prints.
 *
 * The organizer checks this against the clock in the room, so it is deliberately local and
 * deliberately not the ISO string the API speaks in.
 */
function clockTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
