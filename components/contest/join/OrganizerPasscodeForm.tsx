"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui";

/**
 * The organizer passcode form, which is the whole of `/sign-in`.
 *
 * ## Why this is the only form on the page
 *
 * The organizer's instruction on 2026-11-15: "just remove the sign in option since we dont need
 * it anymore". Students enter with the join code on their slip and nothing else, so the email
 * and password form, the Google and GitHub buttons and the sign-up link all left the page. What
 * stayed is the one credential the runbook depends on (`docs/NIGHT.md`: "Sign in as an organizer
 * with the passcode on /sign-in"). Without it a fresh deployment has no way into `/admin` at
 * all, because no seed script creates a `User` with `role: "ADMIN"`.
 *
 * `POST /api/admin/session` has existed and been tested since the beginning, and for a long time
 * **nothing in the browser posted to it.** This component is the thing that does.
 *
 * ## Why the field is open and not behind a disclosure
 *
 * It used to sit collapsed under "Organizer passcode" at the foot of an account form, so that a
 * passcode box was not the first thing a student saw on the front door. This page is no longer
 * on the student's path: the landing page links to it once, from the footer, as "Organizers". A
 * page whose heading says organizer sign-in and whose one field is a passcode does not need the
 * field hidden from the person it is for. The passcode route is rate limited, as it always was.
 *
 * ## The error slot sits next to the control that produced it
 *
 * A refused passcode is reported under the passcode box, in the same column, and the submit
 * button is disabled only by this form's own state. Both were bugs once, when one shared error
 * slot and one shared `busy` flag served two forms.
 */

interface OrganizerPasscodeFormProps {
  /**
   * Rendered above the form, focused on arrival.
   *
   * Already resolved to a sentence by `signInErrorMessage` on the server. This component never
   * sees the raw `?error=` code, which is what keeps arbitrary query-string text off the page.
   * The code an organizer meets in practice is `organizer_required`, set by the `/admin` layout
   * when a session has expired.
   */
  readonly initialError?: string | null;
}

export function OrganizerPasscodeForm({ initialError = null }: OrganizerPasscodeFormProps) {
  const [passcode, setPasscode] = useState("");
  const [pageError, setPageError] = useState<string | null>(initialError);
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const bannerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  /*
    RECONCILE STATE WITH ANYTHING TYPED BEFORE HYDRATION.

    This is a controlled input, so its value tracks React state. Between the server HTML painting
    and this component hydrating, the field is a live plain input: an organizer who types fast on
    a slow connection fills it, those keystrokes never reach React, and `passcode === ""` keeps
    the button disabled forever. On mount we read whatever the DOM already holds and adopt it.
  */
  useEffect(() => {
    const el = formRef.current?.querySelector('input[name="signin-passcode"]');
    const domValue = el instanceof HTMLInputElement ? el.value : "";
    if (domValue !== "") setPasscode((v) => (v === "" ? domValue : v));
  }, []);

  /**
   * Announce the arrival-time error, which `role="alert"` alone does NOT do.
   *
   * A live region is announced when its content CHANGES. This banner's content is in the server
   * response, so there is no change for a screen reader to notice. Moving focus to it works
   * across screen readers; the banner is `tabIndex={-1}` so it can take focus programmatically
   * without joining the tab order, and taking focus also scrolls it into view on a phone.
   */
  useEffect(() => {
    if (initialError !== null && initialError !== "") bannerRef.current?.focus();
  }, [initialError]);

  const submit = async (event: React.SyntheticEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setPasscodeError(null);
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!response.ok) {
        setPasscodeError(await messageFrom(response, "That passcode was not accepted."));
        return;
      }
      // A full navigation, not a router push: the session cookie was just set and the admin
      // layout is a server component that has to be rendered with it.
      window.location.assign("/admin");
    } catch {
      setPasscodeError("Could not reach the server. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {pageError !== null && (
        <div
          ref={bannerRef}
          role="alert"
          tabIndex={-1}
          /*
            6%, not more. Panther on paper is 5.08:1; over a 6% panther tint it is 4.65:1, still
            clear of AA's 4.5:1 at this size. `motion-swap-in` runs on mount, which covers the
            server-rendered banner on first paint. Transform-only rise, never a fade.
          */
          className="motion-swap-in mb-4 rounded-chip border border-panther/40 bg-panther/[0.06] px-3 py-2.5 text-panther"
          style={{ fontSize: "var(--text-sm)" }}
        >
          <p>{pageError}</p>
          <button
            type="button"
            onClick={() => setPageError(null)}
            className="mt-1 underline underline-offset-2 hover:no-underline"
            style={{ fontSize: "var(--text-xs)" }}
          >
            Dismiss
          </button>
        </div>
      )}

      <form ref={formRef} className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
        <label className="flex flex-col gap-1" style={{ fontSize: "var(--text-sm)" }}>
          Passcode
          <input
            type="password"
            name="signin-passcode"
            /*
              The one control on the site that opts out of autofill: a browser offering to
              remember the console passcode is a browser leaking it to the next person on the
              laptop.
            */
            autoComplete="off"
            required
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            aria-invalid={passcodeError !== null}
            aria-describedby={passcodeError !== null ? "passcode-form-error" : undefined}
            className="rounded-flat border border-rule-firm bg-paper px-3 py-2"
            style={{ fontSize: "var(--text-sm)" }}
          />
        </label>

        {passcodeError !== null && (
          <p
            id="passcode-form-error"
            role="alert"
            /* Mounts on a failed submit. A mount-time rise, never a fade. */
            className="motion-swap-in text-panther"
            style={{ fontSize: "var(--text-xs)" }}
          >
            {passcodeError}
          </p>
        )}

        {/*
          Sized by the widest label so the swap to "Checking…" cannot resize the control
          mid-press. Primary, because it is the one action on the page.
        */}
        <Button type="submit" className="relative whitespace-nowrap" disabled={busy || passcode === ""}>
          <span aria-hidden="true" className="invisible">Open the organizer console</span>
          <span
            key={busy ? "busy" : "idle"}
            className="motion-swap-in absolute inset-0 flex items-center justify-center"
          >
            {busy ? "Checking…" : "Open the organizer console"}
          </span>
        </Button>
      </form>
    </div>
  );
}

/**
 * Pull the message out of an error envelope, or fall back.
 *
 * Never throws: `response.json()` on an HTML body (a proxy's 502 page, say) is exactly the case
 * a sign-in form meets when something upstream is unwell.
 */
async function messageFrom(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error: { message?: unknown } }).error?.message === "string"
    ) {
      return (body as { error: { message: string } }).error.message;
    }
  } catch {
    // Not JSON. The fallback is a sentence; the response body could be anything at all.
  }
  return fallback;
}
