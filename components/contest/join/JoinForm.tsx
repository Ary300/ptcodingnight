"use client";

import { useRouter } from "next/navigation";
import { useCallback, useId, useState } from "react";

import { Button } from "@/components/ui";
import { JoinRequestSchema } from "@/lib/schemas/api";

import { contestApi, errorMessageOf } from "../data/backend";
import { writeParticipant } from "../data/participant";

/**
 * Join: enter the code, pick a display name, land in the lobby (PRD §9.1).
 *
 * Two steps rather than one form, because they are two different questions and the second
 * one deserves a moment's thought — the display name is what goes on the projector in front
 * of the room. Getting the code wrong should also not cost a student the name they typed.
 *
 * Validation is `JoinRequestSchema`, the same schema the route will validate with. A second,
 * hand-written set of rules on the client is a second set of rules to drift.
 */

type Step = "code" | "name";

export function JoinForm() {
  const router = useRouter();
  const codeId = useId();
  const nameId = useId();
  const errorId = useId();

  const [step, setStep] = useState<Step>("code");
  const [joinCode, setJoinCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const goToName = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const parsed = JoinRequestSchema.shape.joinCode.safeParse(joinCode);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Enter the join code.");
        return;
      }
      setError(null);
      setStep("name");
    },
    [joinCode],
  );

  const join = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      const parsed = JoinRequestSchema.safeParse({ joinCode, displayName, divisionId: null });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
        return;
      }

      setBusy(true);
      setError(null);
      try {
        const participant = await contestApi.join(parsed.data);
        writeParticipant(participant);
        router.push("/contest");
      } catch (caught: unknown) {
        setError(errorMessageOf(caught));
        // A bad code is a code problem, not a name problem — send them back to fix it.
        setStep("code");
      } finally {
        setBusy(false);
      }
    },
    [displayName, joinCode, router],
  );

  const fieldClass =
    // Placeholder at /60, not /40: ink over paper needs at least 57% opacity to clear AA's
    // 4.5:1, and axe checks placeholder text. See DESIGN.md §7.
    "mt-1 w-full rounded border border-ink/25 bg-paper px-3 py-2 text-ink placeholder:text-ink/60";

  return (
    <form
      onSubmit={step === "code" ? goToName : (event) => void join(event)}
      className="w-full max-w-sm"
      noValidate
    >
      <ol className="mb-6 flex gap-2 text-ink/60" style={{ fontSize: "var(--text-xs)" }} aria-hidden="true">
        <li className={step === "code" ? "font-semibold text-panther" : ""}>1. Join code</li>
        <li>/</li>
        <li className={step === "name" ? "font-semibold text-panther" : ""}>2. Display name</li>
      </ol>

      {step === "code" ? (
        <div>
          <label htmlFor={codeId} style={{ fontSize: "var(--text-sm)" }}>
            Join code
          </label>
          <p className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            It is on the board at the front of the room.
          </p>
          <input
            id={codeId}
            name="joinCode"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            autoFocus
            required
            aria-describedby={error === null ? undefined : errorId}
            aria-invalid={error !== null}
            className={`${fieldClass} numeric uppercase`}
            style={{ fontSize: "var(--text-md)" }}
          />
        </div>
      ) : (
        <div>
          <label htmlFor={nameId} style={{ fontSize: "var(--text-sm)" }}>
            Display name
          </label>
          <p className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            This is what the room sees on the leaderboard. Up to 40 characters.
          </p>
          <input
            id={nameId}
            name="displayName"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="off"
            maxLength={40}
            autoFocus
            required
            aria-describedby={error === null ? undefined : errorId}
            aria-invalid={error !== null}
            className={fieldClass}
            style={{ fontSize: "var(--text-md)" }}
          />
        </div>
      )}

      {error !== null && (
        <p
          id={errorId}
          role="alert"
          className="mt-3 text-panther"
          style={{ fontSize: "var(--text-xs)" }}
        >
          {error}
        </p>
      )}

      <div className="mt-5 flex items-center gap-3">
        {step === "name" && (
          <Button type="button" variant="ghost" onClick={() => setStep("code")} disabled={busy}>
            Back
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {step === "code" ? "Next" : busy ? "Joining…" : "Join the contest"}
        </Button>
      </div>
    </form>
  );
}
