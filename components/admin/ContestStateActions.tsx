"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";

import { ConfirmButton } from "./ConfirmButton";

/**
 * Publish a contest, open it, or end it.
 *
 * ## Why this exists
 *
 * `POST /api/admin/contests/{id}/state` was written and **nothing in the product ever called it**.
 * So a contest could be created and never started: `lib/contest/gate.ts` excludes `DRAFT` from
 * joinable, readable and submittable, and `RUNNING` was only ever written by
 * `scripts/seed-demo.ts`. Every contest a student could enter had come from a seed script, while
 * three separate strings on screen promised the step — "students cannot see it until you publish
 * it", "Publish the contest when the line-up is settled", and the state pill's own hint.
 *
 * ## Ending and opening are confirmed; publishing is not
 *
 * Publishing too early is recoverable by ending and rebuilding. **Ending a contest early, with a
 * room still submitting**, closes the window for everyone, so it is confirmed. **Opening** is
 * confirmed too: it moves the whole window to the instant of the press, so a press at 6:58
 * closes submissions at 8:13, and End, Freeze and Reopen all asked first while Open now did not.
 * Each confirmation says in a sentence what the press will do.
 *
 * ## The refusal is rendered, not swallowed
 *
 * Publishing a contest with no problems in it is refused by the API with a sentence that names the
 * reason. That refusal is the single most useful thing this control can say, because a published
 * contest with an empty line-up is the failure that looks most like success — students sign in,
 * see nothing, and conclude the platform is broken.
 */

export interface ContestStateActionsProps {
  readonly contestId: string;
  readonly state: string;
  /**
   * Re-read the list, so the pill and the available actions follow the new state.
   *
   * Optional, because the contest's own Setup tab renders on the server: there is no client-side
   * list to re-read there, and the thing that must change — the state pill in the shell, the
   * checklist, the tab strip — is server-rendered. `router.refresh()` re-runs that render. A
   * required callback would have forced a client wrapper around this whose only job was to call
   * the same function.
   */
  readonly onChanged?: () => void;
  /**
   * Is the PUBLIC board frozen right now, by a pressed freeze or a scheduled one that has fired?
   * End behaves differently then (`planEndNow`): it closes submissions and the board stays frozen,
   * so the confirmation has to say so. Required, so no caller can fall back to the wrong sentence.
   */
  readonly boardFrozen: boolean;
  /** Has the contest window already closed? A frozen board past its end has nothing left to end. */
  readonly submissionsClosed: boolean;
  /** The window's length in whole minutes, which Open now keeps from the instant it is pressed. */
  readonly durationMinutes: number;
}

/** The sentence under Open now's confirmation. */
export function openConfirmDescription(durationMinutes: number): string {
  return `The contest starts now and ends in ${String(durationMinutes)} ${
    durationMinutes === 1 ? "minute" : "minutes"
  }.`;
}

/** The sentence under End contest's confirmation, which depends on whether the board is frozen. */
export function endConfirmDescription(boardFrozen: boolean): string {
  return boardFrozen
    ? "Submissions close now. The board stays frozen until you press Unfreeze and reveal."
    : "Submissions close now, and the final standings become public on the projector and every student screen.";
}

/** What the lifecycle panel says once a frozen contest's window has closed. */
export const CLOSED_AND_FROZEN_NOTE =
  "Submissions are closed. The board stays frozen until you press Unfreeze and reveal on the Live console tab, which ends the contest and shows the final standings.";

/** What an organizer may do next, given where the contest is. Mirrors `setContestState`. */
function nextStates(state: string): readonly { to: "SCHEDULED" | "RUNNING" | "ENDED"; label: string }[] {
  switch (state) {
    case "DRAFT":
      return [
        { to: "SCHEDULED", label: "Publish" },
        { to: "RUNNING", label: "Publish and open now" },
      ];
    case "SCHEDULED":
      return [{ to: "RUNNING", label: "Open now" }];
    // FROZEN is reachable only from the live console and is reversible there; ending from it is
    // still allowed, because a contest can be stopped while the board is frozen.
    case "RUNNING":
    case "FROZEN":
      return [{ to: "ENDED", label: "End contest" }];
    default:
      return [];
  }
}

export function ContestStateActions({
  contestId,
  state,
  onChanged,
  boardFrozen,
  submissionsClosed,
  durationMinutes,
}: ContestStateActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async (to: string, label: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/contests/${contestId}/state`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: to, reason: `${label} from the organizer console` }),
      });
      if (!response.ok) {
        const body: unknown = await response.json();
        const message =
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error: { message?: unknown } }).error.message ?? "")
            : "";
        setError(message === "" ? "That change was refused." : message);
        return;
      }
      if (onChanged === undefined) router.refresh();
      else onChanged();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  // A frozen contest whose window has closed has been ended as far as End can take it. What is
  // left is the reveal, which lives on the console beside the frozen notice.
  const closedAndFrozen =
    boardFrozen && submissionsClosed && (state === "RUNNING" || state === "FROZEN");
  if (closedAndFrozen && error === null) {
    return (
      <p
        data-testid="closed-and-frozen"
        className="font-semibold text-ink"
        style={{ fontSize: "var(--text-sm)" }}
      >
        {CLOSED_AND_FROZEN_NOTE}
      </p>
    );
  }

  const options = nextStates(state);
  if (options.length === 0 && error === null) {
    return (
      <p className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
        {state === "ENDED"
          ? "This contest has ended. If it ended by mistake, reopen it under Window below."
          : `This contest is ${state.toLowerCase()}. There is nothing further to change.`}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {options.map((option) =>
        option.to === "ENDED" ? (
          <ConfirmButton
            key={option.to}
            label={option.label}
            confirmLabel="End it now"
            description={endConfirmDescription(boardFrozen)}
            variant="secondary"
            disabled={busy}
            onConfirm={() => void go(option.to, option.label)}
          />
        ) : option.to === "RUNNING" ? (
          <ConfirmButton
            key={option.to}
            label={option.label}
            confirmLabel={option.label}
            description={openConfirmDescription(durationMinutes)}
            variant="secondary"
            disabled={busy}
            onConfirm={() => void go(option.to, option.label)}
          />
        ) : (
          <Button
            key={option.to}
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void go(option.to, option.label)}
          >
            {option.label}
          </Button>
        ),
      )}

      {error !== null && (
        <p
          role="alert"
          className="motion-swap-in font-semibold text-panther"
          style={{ fontSize: "var(--text-xs)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
