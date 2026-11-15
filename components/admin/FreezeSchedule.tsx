"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";
import { API_ROUTES, AdminFreezeScheduleResponseSchema } from "@/lib/schemas/api";
import { EVENT_TIME_ZONE } from "@/lib/contest/event-time";

/**
 * When the public board stops updating, set the way an organizer says it: minutes before the end.
 *
 * ## Why this is not a datetime field
 *
 * It was, and only at creation time. The contest builder asks for "Freeze at" as an absolute
 * `datetime-local`, which means the organizer computes "half past eight, because we end at nine"
 * themselves, and there was NO screen to change it afterwards — a contest already created could
 * only get a freeze through SQL. Worse, moving the contest's end time left the old freeze pointing
 * at the previous evening, silently.
 *
 * So the unit here is the sentence the organizer actually says. The server subtracts, which means
 * the freeze is re-derived whenever the window moves, and the absolute time is printed back so the
 * decision can be checked against a clock on the wall.
 *
 * ## What it does not do
 *
 * It does not stop judging, and it does not touch the organizer's own view: both stay live behind a
 * frozen board, which is what makes the unfreeze at the end a reveal rather than a recalculation.
 * The live console still has the manual freeze for the night itself.
 */

const PRESETS = [15, 30, 45, 60] as const;

export function FreezeSchedule({
  contestId,
  endsAt,
  freezeAt,
  minutesBeforeEnd,
  frozenNow,
}: {
  readonly contestId: string;
  /** ISO. Used only to print the resulting wall-clock time. */
  readonly endsAt: string;
  readonly freezeAt: string | null;
  readonly minutesBeforeEnd: number | null;
  /** The board is frozen right now, so the schedule cannot be rewritten under it. */
  readonly frozenNow: boolean;
}) {
  const router = useRouter();
  const [minutes, setMinutes] = useState<number | null>(minutesBeforeEnd);
  const [at, setAt] = useState<string | null>(freezeAt);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const save = async (next: number | null): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(API_ROUTES.adminFreezeSchedule(contestId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutesBeforeEnd: next }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        // The server's sentence, not a generic one: every refusal here names the thing to change.
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
      const saved = AdminFreezeScheduleResponseSchema.parse(data);
      setMinutes(saved.minutesBeforeEnd);
      setAt(saved.freezeAt);
      setFailed(false);
      setMessage(
        saved.freezeAt === null
          ? "The board will keep updating to the end."
          : saved.activeNow
            ? "Saved. That time has already passed, so the public board is frozen now."
            : `Saved. The board stops updating at ${clockTime(saved.freezeAt)}.`,
      );
      /*
        Re-read the server component above this one. The Window panel prints "Board freezes" from
        the same column this just wrote, and without the refresh that line kept saying "No freeze"
        beside a message announcing the freeze — two statements about one fact, on one screen,
        disagreeing.
      */
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
        {minutes === null || at === null ? (
          <>The board updates until the contest ends. Nothing is hidden at the finish.</>
        ) : (
          <>
            The board stops updating{" "}
            <strong className="text-ink">{minutes} minutes before the end</strong>, at{" "}
            <span className="numeric font-semibold text-ink">{clockTime(at)}</span>. Judging carries
            on, and the last stretch is played without knowing who is winning.
          </>
        )}
      </p>

      {frozenNow ? (
        <p className="font-semibold text-panther" style={{ fontSize: "var(--text-sm)" }}>
          The board is frozen right now. Unfreeze it in the live console before changing when it
          freezes.
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
            No freeze
          </Button>
        </div>
      )}

      <p className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
        Contest ends at <span className="numeric">{clockTime(endsAt)}</span>.
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

/**
 * A wall-clock time in the event's zone (Indianapolis, Eastern).
 *
 * The organizer checks this against the clock in the room, so it is deliberately local and
 * deliberately not the ISO string the API speaks in.
 */
function clockTime(iso: string): string {
  // The EVENT's zone, not the reader's and not the server's. This renders on the server first,
  // and a UTC droplet printed "12:30 AM" for a 7:30 PM opening, then the browser re-rendered it in
  // Eastern and React reported the mismatch (#418) on every load of the Setup tab.
  return new Date(iso).toLocaleString("en-US", {
    timeZone: EVENT_TIME_ZONE,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
