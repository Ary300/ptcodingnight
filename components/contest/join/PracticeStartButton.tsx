"use client";

import { useState } from "react";

/**
 * "Try practice problems": start a guest session in the practice arena and go to `/contest`.
 *
 * The teacher wants students to know the editor and the judge before the night, and students have
 * no accounts, so this is the only way into the arena. `POST /api/practice/start` makes a "Guest
 * NNNN" participant there and sets the session cookie, or reuses the arena session this browser
 * already holds. A browser signed in to a real contest is refused with a sentence that says to
 * sign out first, and that sentence is shown here as the server wrote it.
 *
 * Two looks, one behaviour: a full-width secondary button under the code form on `/join`, and a
 * chip beside the primary call to action in the home page hero.
 */

/** The line that goes under the button wherever it appears. One copy, so the two doors agree. */
const IDLE_LABEL = "Try practice problems";
const BUSY_LABEL = "Opening practice…";

const STYLES = {
  block:
    "relative w-full whitespace-nowrap rounded border border-ink/25 bg-paper px-4 py-3 font-semibold text-ink transition-[background-color,transform] duration-[var(--motion-press)] hover:bg-ink/[0.04] active:scale-[0.97] disabled:cursor-not-allowed disabled:text-ink/50 disabled:active:scale-100",
  chip:
    "relative whitespace-nowrap rounded-chip border border-rule-edge px-5 py-2.5 font-semibold hover:border-rule-firm hover:bg-ink/[0.03] disabled:cursor-not-allowed disabled:text-ink/50",
  /** The top bar's size: the same height as the join button beside it. */
  bar:
    "relative whitespace-nowrap rounded-chip border border-rule-edge px-3 py-1.5 font-semibold text-ink hover:border-rule-firm hover:bg-ink/[0.03] disabled:cursor-not-allowed disabled:text-ink/50",
} as const;

interface PracticeStartButtonProps {
  readonly variant: keyof typeof STYLES;
}

/** The top bar has room for one word; everywhere else the button says what it does in full. */
function labelsFor(variant: keyof typeof STYLES): { idle: string; busy: string } {
  return variant === "bar"
    ? { idle: "Practice", busy: "Opening…" }
    : { idle: IDLE_LABEL, busy: BUSY_LABEL };
}

function serverMessage(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("error" in body)) return undefined;
  const error = (body as { error: unknown }).error;
  if (typeof error !== "object" || error === null || !("message" in error)) return undefined;
  const message = (error as { message: unknown }).message;
  return typeof message === "string" && message !== "" ? message : undefined;
}

export function PracticeStartButton({ variant }: PracticeStartButtonProps) {
  const labels = labelsFor(variant);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/practice/start", { method: "POST" });
      const body: unknown = await response.json();
      if (!response.ok) {
        setError(
          serverMessage(body) ?? "Practice problems did not open. Try again in a moment.",
        );
        return;
      }
      // A document navigation, as on the join form: the cookie was just set, and the contest
      // shell reads it on the server.
      window.location.assign("/contest");
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void start()}
        className={STYLES[variant]}
        style={{
          fontSize:
            variant === "block" ? "var(--text-md)" : variant === "bar" ? "var(--text-xs)" : "var(--text-sm)",
        }}
      >
        <span aria-hidden="true" className="invisible">
          {labels.idle}
        </span>
        <span
          key={busy ? "busy" : "idle"}
          className="motion-swap-in absolute inset-0 flex items-center justify-center"
        >
          {busy ? labels.busy : labels.idle}
        </span>
      </button>
      {error !== null && (
        <p
          role="alert"
          className="motion-swap-in basis-full text-panther"
          style={{ fontSize: "var(--text-sm)" }}
        >
          {error}
        </p>
      )}
    </>
  );
}
