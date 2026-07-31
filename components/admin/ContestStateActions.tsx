"use client";

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
 * ## Ending is confirmed; publishing and opening are not
 *
 * `setContestState` allows DRAFT → SCHEDULED → RUNNING → ENDED and offers no way back. Publishing
 * too early is recoverable by ending and rebuilding; **ending a contest early, with a room still
 * submitting, is not recoverable at all** — so that one is the only transition behind a
 * confirmation. Confirming everything trains people to click through confirmations.
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
  /** Re-read the list, so the pill and the available actions follow the new state. */
  readonly onChanged: () => void;
}

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

export function ContestStateActions({ contestId, state, onChanged }: ContestStateActionsProps) {
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
      onChanged();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const options = nextStates(state);
  if (options.length === 0 && error === null) {
    return (
      <p className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
        This contest is {state.toLowerCase()}. There is nothing further to change.
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
        <p role="alert" className="font-semibold text-panther" style={{ fontSize: "var(--text-xs)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
