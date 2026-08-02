"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatEventTimeSeconds } from "@/lib/contest/event-time";

import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { JudgeHealthBar } from "@/components/admin/JudgeHealthBar";
import { AlertPlate, Panel } from "@/components/admin/Panel";
import {
  SubmissionFeed,
  type OverridePayload,
} from "@/components/admin/SubmissionFeed";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui";
import {
  AdminConsoleViewSchema,
  type AdminConsoleView,
} from "@/lib/schemas/api";

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
 * afterwards rather than trusting its own optimism. The activity log stays, because "did that go
 * through?" is a real question when you are working fast in front of a room — but it now records
 * what the SERVER said, including failures.
 *
 * ## Where the controls sit
 *
 * Both references put a moderation page's controls in a bar attached to the table they act on,
 * not in their own sections down the page. The freeze control used to be a whole panel of its
 * own between the judge bar and the feed — the third of four boxes an organiser scrolled past to
 * reach the thing they came for. It is now a toolbar strip on top of the submissions table, and
 * the only page-level control left standing alone is the unfreeze inside the frozen plate,
 * because unfreezing is the reveal and belongs on the notice the whole room's state hangs off.
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
  /** The server's own words on a failure, kept apart from ours so they read as a quote. */
  readonly detail: string | null;
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

/**
 * The board's state as a word in a chip, next to the control that changes it. FROZEN is the
 * emphatic one — it is the state an organiser must not mistake for a finished contest — and the
 * word carries the meaning; the border colour is a second channel, never the only one.
 */
function BoardStateToken({ frozen }: { frozen: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-chip border px-2 py-0.5 font-semibold whitespace-nowrap ${
        frozen ? "border-panther text-panther" : "border-rule-edge text-ink/75"
      }`}
      style={{ fontSize: "var(--text-xs)" }}
    >
      {frozen ? "FROZEN" : "LIVE"}
    </span>
  );
}

/** Pass or fail as a WORD. The organiser scans this column for the one row that did not land. */
function ResultToken({ failed }: { failed: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-chip border px-2 py-0.5 font-semibold whitespace-nowrap ${
        failed ? "border-panther text-panther" : "border-rule-edge text-ink/75"
      }`}
      style={{ fontSize: "var(--text-xs)" }}
    >
      {failed ? "FAILED" : "OK"}
    </span>
  );
}

export function LiveConsole({ contestId }: LiveConsoleProps) {
  const [view, setView] = useState<AdminConsoleView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [participantFilter, setParticipantFilter] = useState<string | null>(
    null,
  );
  const [log, setLog] = useState<readonly LoggedAction[]>([]);
  const [busy, setBusy] = useState(false);

  // A ref, not state: the poll reads it and must not be re-created when it changes.
  const busyRef = useRef(false);

  const record = useCallback((text: string, failure?: string): void => {
    setLog((previous) => [
      {
        id: `${String(previous.length)}-${text.slice(0, 12)}`,
        // UTC on purpose, matching the feed's time column: the whole point of this log is
        // pairing "the thing I pressed" with the row it changed, and two clocks break that.
        at: formatEventTimeSeconds(new Date()),
        text,
        failed: failure !== undefined,
        detail: failure ?? null,
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
          record(describe, await messageOf(response));
          return;
        }
        record(describe);
      } catch {
        record(describe, "Could not reach the server.");
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
    (submissionId: string, reason: string): void => {
      // The ORGANIZER's words, not a constant. This used to send "Requeued from the live console"
      // every time, so the audit trail for a score-changing action the student never sees was a
      // column of identical strings.
      void act(
        `/api/admin/submissions/${submissionId}/rejudge`,
        { reason },
        `Requeued ${submissionId} for rejudging. Reason: ${reason}`,
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
      <p
        role="status"
        className="text-ink/70"
        style={{ fontSize: "var(--text-sm)" }}
      >
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
    /*
      `gap-section` between the regions of this screen, not `gap-6`.

      The three intervals in DESIGN.md §5c exist because everything here used to be 16-24px apart —
      the distance between two unrelated regions was barely larger than the distance between two
      rows inside one of them, so nothing on the page grouped and the eye had no lead. Judge
      health, the feed and the log are different subjects.
    */
    <div className="flex min-w-0 flex-col gap-section">
      {/*
        A failed POLL is a notice, not a takeover. The screen still holds the last good read, and
        an organiser looking at three-second-old data with a warning on it is far better served
        than one whose console was replaced by an error.
      */}
      {loadError !== null && (
        <p
          role="status"
          className="motion-swap-in rounded-chip border border-panther px-3 py-2 font-semibold text-panther"
          style={{ fontSize: "var(--text-sm)" }}
        >
          Not updating: {loadError} What is below is the last successful read.
        </p>
      )}

      <JudgeHealthBar health={health} />

      {/*
        The frozen plate is the one standing condition on this page a room's worth of eyes hangs
        off, so it keeps the dark plate AND the unfreeze — the reveal happens from the notice
        that says what everyone is currently seeing, not from a toolbar button an organiser
        could catch with a stray click.
      */}
      {/*
        `motion-panel-in` on a WRAPPER, and it is transform-only by construction: the plate is
        `bg-ink` holding `text-paper/70`, so any opacity on this wrapper would drag that text
        below its contrast floor for the length of the animation — the exact failure G9 measured
        at 4.16:1 the first time an entrance here shipped with a fade. A whole dark surface
        arriving is the panel duration (300ms), not the content-swap one.
      */}
      {frozen && (
        <div className="motion-panel-in">
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
            Students and the projector still see the standings as they were at
            the freeze. Judging keeps running, and the console below stays live.
            Unfreezing reveals the final board, so do it when the room is
            watching.
          </AlertPlate>
        </div>
      )}

      {/*
        `bare`, because the feed's own table already draws its edge. A framed panel around a
        framed table is two boxes for one thing, which is most of what made these screens read as
        a stack of identical cards.
      */}
      <Panel
        title="Submissions"
        level="bare"
        aside={
          <span
            className="numeric text-ink/60"
            style={{ fontSize: "var(--text-xs)" }}
          >
            {/*
              Says WHICH submissions when the feed is windowed. A list that silently stops at 200
              reads as "that is all of them", and the one thing an organizer uses this feed for is
              noticing something that did not come back.
            */}
            {windowed
              ? `most recent ${String(submissions.length)} of ${String(total)}`
              : `${String(total)} in this contest`}
          </span>
        }
      >
        <div className="flex min-w-0 flex-col gap-tight">
          {/*
            The toolbar: the same tinted strip TabStrip and the table header use, so it reads as
            part of the table's chrome rather than as another card. The board's state is a word
            here even though the frozen plate above already shouts it, because this strip is
            where the eye is when the question is "can I freeze from here".
          */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-tight rounded-chip border border-rule-edge bg-ink/[0.04] px-3 py-2">
            <div className="flex items-center gap-tight">
              <span
                className="font-semibold"
                style={{ fontSize: "var(--text-sm)" }}
              >
                Public board
              </span>
              <BoardStateToken frozen={frozen} />
            </div>
            <p
              className="min-w-0 flex-1 basis-52 text-ink/60"
              style={{ fontSize: "var(--text-xs)" }}
            >
              {frozen
                ? "Unfreeze from the notice above, when the room is watching."
                : "Freezing holds the public standings in place while judging continues. You will still see live results here."}
            </p>
            {/* Unfreezing puts this button back in the same frame the plate above vanishes; the
                rise is on a wrapper so the arm/disarm swap inside ConfirmButton keeps its own
                (single) entrance. */}
            {!frozen && (
              <span className="motion-swap-in inline-block">
                <ConfirmButton
                  label="Freeze the public board"
                  confirmLabel="Freeze now"
                  variant="secondary"
                  size="sm"
                  onConfirm={() => setFreeze(true)}
                  disabled={busy}
                />
              </span>
            )}
          </div>

          <SubmissionFeed
            submissions={submissions}
            participantFilter={participantFilter}
            onParticipantFilter={setParticipantFilter}
            onRejudge={onRejudge}
            onOverride={onOverride}
          />
        </div>
      </Panel>

      <Panel
        title="Activity log"
        level="bare"
        description="Recent freezes, rejudges, overrides, and server responses."
      >
        {log.length === 0 ? (
          <p className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            Nothing yet. Freezes, rejudges and overrides land here as the server
            answers them.
          </p>
        ) : (
          /*
            The same table furniture as the feed above it, not a run of prose: this used to be a
            column of concatenated strings with "REFUSED:" spliced into the middle, and the one
            row that failed was told apart by colour alone. The result is now its own column, as
            a word, and the server's reply is quoted under the action instead of glued onto it.
            `relative` + `min-w-0` for the same reason as the feed's scroller (sr-only spans).
          */
          <div className="motion-swap-in relative w-full min-w-0 overflow-x-auto">
            <Table caption="Activity log">
              <THead>
                <TR>
                  {/* nowrap: this column is exactly eight mono digits wide, and letting the
                      heading fold to two lines makes the header row the tallest row on screen. */}
                  <TH numeric className="whitespace-nowrap">
                    Time (ET)
                  </TH>
                  <TH>Result</TH>
                  <TH>Action</TH>
                </TR>
              </THead>
              <TBody>
                {/*
                  Each server answer PREPENDS a row in the same frame. Keys are stable, so a row
                  animates exactly once, on the answer that created it, and a poll re-render moves
                  nothing. The class rides on block content INSIDE the cells, never on the `<tr>`:
                  transform animation on `display: table-row` is unreliable in WebKit.
                */}
                {log.map((entry) => (
                  <TR key={entry.id}>
                    <TD numeric className="whitespace-nowrap align-top">
                      <span className="motion-swap-in block">{entry.at}</span>
                    </TD>
                    <TD className="align-top">
                      <span className="motion-swap-in block">
                        <ResultToken failed={entry.failed} />
                      </span>
                    </TD>
                    <TD className="w-full align-top">
                      <div className="motion-swap-in">
                        <p
                          className={`min-w-0 break-words ${entry.failed ? "font-semibold" : ""}`}
                        >
                          {entry.text}
                        </p>
                        {entry.detail !== null && (
                          <p
                            className="mt-0.5 min-w-0 break-words text-ink/70"
                            style={{ fontSize: "var(--text-xs)" }}
                          >
                            Server said: {entry.detail}
                          </p>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Panel>
    </div>
  );
}
