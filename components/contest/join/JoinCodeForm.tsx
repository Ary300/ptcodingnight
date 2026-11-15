"use client";

import Link from "next/link";
import { useState } from "react";

import { PRACTICE_NOTE, PracticeStartButton } from "@/components/contest/join/PracticeStartButton";

/**
 * The join-code form: type the code on your slip, and you are in.
 *
 * The night's main door, by the teacher's instruction and the organizer's decision. Nobody makes
 * an account at the desk; organizers built the teams beforehand and every seat has a code. One
 * field, one button, and on success a document navigation to the contest so every layer sees the
 * new cookie. There is no account path beside it: students have no accounts (the organizer's
 * instruction, 2026-11-15), so the line at the foot says what to do without a slip, which is to
 * ask the desk.
 *
 * ## Why the field shouts
 *
 * The code is six characters read off paper and typed once, usually on a phone, sometimes by
 * somebody who has never used this site. So the input is monospaced, tracked out and centred at
 * display size: it is the one thing on the page, and a mistyped character should be obvious
 * before the button is pressed rather than after. `autoCapitalize` and the uppercase transform
 * mean a phone keyboard cannot produce a code the server will refuse for case alone.
 *
 * The server normalises spacing and dashes anyway (`normalizeJoinCode`), so a student who types
 * the code the way it is printed, hyphen and all, gets in.
 */

export function JoinCodeForm() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/join-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof body === "object" && body !== null && "error" in body
            ? (body as { error: { message?: string } }).error.message
            : undefined;
        /*
          The server's own sentence when it has one. A wrong code and a finished contest are
          different problems and the API says which; flattening both into "that did not work"
          is how a student stands at the desk retyping a code that was always correct.
        */
        setError(message ?? "That code did not match anybody on the roster. Check it and try again.");
        return;
      }
      // A document navigation, not router.push: the session cookie was just set and the contest
      // shell reads it on the server, so a full load guarantees every layer sees it.
      window.location.assign("/contest");
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <label className="flex flex-col gap-2" style={{ fontSize: "var(--text-sm)" }}>
          Your join code
          <input
            type="text"
            name="join-code"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            required
            maxLength={16}
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="7K4Q9M"
            aria-describedby="join-code-hint"
            size={8}
            className="numeric w-full min-w-0 rounded border border-ink/25 bg-paper px-4 py-3 text-center font-semibold uppercase"
            style={{ fontSize: "var(--text-xl)", letterSpacing: "0.22em" }}
          />
          {/*
            The shape of the code, so a student can tell a misread before pressing the button. The
            alphabet has no O, 0, I or 1 (`lib/contest/join-code.ts`), and saying so is what turns
            "I typed what the paper says" into "read that character again".
          */}
          <span id="join-code-hint" className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            Six letters and numbers from the slip an organizer gave you. Capitals, spaces and
            dashes do not matter. A code never contains the letters O or I, or the digits 0 or 1.
          </span>
        </label>

        {error !== null && (
          /* Mounts on a failed attempt; the rise makes the arrival followable. Transform-only. */
          <p role="alert" className="motion-swap-in text-panther" style={{ fontSize: "var(--text-sm)" }}>
            {error}
          </p>
        )}

        {/*
          Width held by the widest label so the control cannot resize under the thumb mid-press,
          and the press itself is acknowledged over 100ms like every other button here.
        */}
        <button
          type="submit"
          disabled={busy || code.trim() === ""}
          className="relative whitespace-nowrap rounded bg-panther px-4 py-3 font-semibold text-paper transition-[background-color,transform] duration-[var(--motion-press)] hover:bg-panther-deep active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-ink/25 disabled:active:scale-100"
          style={{ fontSize: "var(--text-md)" }}
        >
          <span aria-hidden="true" className="invisible">Taking you in…</span>
          <span
            key={busy ? "busy" : "idle"}
            className="motion-swap-in absolute inset-0 flex items-center justify-center"
          >
            {busy ? "Taking you in…" : "Join the contest"}
          </span>
        </button>
      </form>

      <p className="mt-6 text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
        No slip? Ask an organizer at the desk. Every seat on the roster has a code.
      </p>

      {/*
        The practice arena, for a student getting used to the site before the night. Secondary
        styling and below the code form, because on the night the code is the door and this is
        not. It needs no code, and a guest lands only in the arena (`lib/contest/practice-guest.ts`).
      */}
      <div className="mt-6 flex flex-col gap-2">
        <PracticeStartButton variant="block" />
        <p className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          {PRACTICE_NOTE}
        </p>
      </div>

      {/*
        The organizers' way in, at the foot of the student door, by request: on the night the
        organizers open this page too, and the passcode page should be one tap away from it.
      */}
      <p
        className="mt-8 border-t border-rule-hair pt-4 text-ink/70"
        style={{ fontSize: "var(--text-sm)" }}
      >
        Running the night?{" "}
        <Link
          href="/sign-in"
          className="font-semibold text-ink underline underline-offset-2 hover:text-panther"
        >
          Organizer sign-in
        </Link>
      </p>
    </div>
  );
}
