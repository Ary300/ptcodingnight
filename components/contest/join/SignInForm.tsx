"use client";

import { useState } from "react";

import { Button } from "@/components/ui";
import { GitHubMark, GoogleMark } from "./ProviderIcons";

/**
 * Email and password sign-in, plus the two OAuth buttons.
 *
 * ## Why this exists
 *
 * All four sign-in paths worked over HTTP and were covered by G7 — and three of them had no page.
 * `docs/TODO.md` recorded them as "reachable", which was true of the API and false of the browser:
 * `/api/auth/password` accepted a POST that nothing on the site could produce, and the OAuth
 * callback redirected a cancelled sign-in to `/sign-in`, which was a 404. An organizer could only
 * get in with `curl`.
 *
 * ## Why the OAuth buttons are links and not fetches
 *
 * `/api/auth/{provider}` mints a `state`, puts its hash in a cookie and 302s to the provider. That
 * is a navigation, not an API call: fetching it would follow the redirect in the background, land
 * the provider's HTML in a promise, and leave the student looking at an unchanged page.
 *
 * ## Why a failure never says which half was wrong
 *
 * The server answers one message for an unknown email and for a wrong password, and this renders
 * whatever it is told rather than improving on it. Distinguishing them turns the form into an
 * account-enumeration oracle, and organizers' addresses are their school addresses.
 */

interface SignInFormProps {
  /** Rendered above the form — the OAuth callback redirects here with `?error=`. */
  readonly initialError?: string | null;
}

export function SignInForm({ initialError = null }: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.SyntheticEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof (body as { error: { message?: unknown } }).error.message === "string"
            ? (body as { error: { message: string } }).error.message
            : "That sign-in did not work.";
        setError(message);
        return;
      }
      // Routed by ROLE, not hardcoded to /admin. Competitors can hold a password too — an
      // organizer may set one for a student whose provider is not working — and sending them to
      // the console lands them on a screen that refuses them, which reads as "your sign-in
      // failed" when it in fact succeeded.
      const role =
        typeof body === "object" && body !== null && "data" in body
          ? (body as { data: { role?: unknown } }).data.role
          : null;

      // A full navigation rather than a router push: the session cookie was just set, and every
      // server component downstream has to be rendered with it rather than with the cached tree
      // from before the sign-in.
      window.location.assign(role === "ADMIN" ? "/admin" : "/contest");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {/*
        OAuth first, and prominent. This is how a STUDENT signs up now — the buttons are the
        primary action for almost everyone who reaches this page, so they sit above the fold
        rather than under an "or" divider as an afterthought for people who could not remember a
        password. The email form below is for organizers, who are a handful of people.

        `no-html-link-for-pages` is suppressed on both, and only here. The rule exists to stop an
        `<a>` doing a full page load to a route the client router could have handled — but these
        are not pages. `/api/auth/{provider}` sets a state cookie and 302s to Google or GitHub,
        and a client-side navigation cannot follow a redirect to another origin. `<Link>` would
        satisfy the linter and break sign-in.
      */}
      <div className="flex flex-col gap-2">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- OAuth start: must be a document navigation */}
        <a
          href="/api/auth/google"
          className="flex items-center justify-center gap-2.5 rounded border border-ink/25 px-3 py-2.5 font-semibold hover:border-ink/45 hover:bg-ink/[0.03]"
          style={{ fontSize: "var(--text-sm)" }}
        >
          <GoogleMark />
          Continue with Google
        </a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- OAuth start: must be a document navigation */}
        <a
          href="/api/auth/github"
          className="flex items-center justify-center gap-2.5 rounded border border-ink/25 px-3 py-2.5 font-semibold hover:border-ink/45 hover:bg-ink/[0.03]"
          style={{ fontSize: "var(--text-sm)" }}
        >
          <GitHubMark />
          Continue with GitHub
        </a>
      </div>

      <p className="mt-3 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
        Students: use your school account. Signing in creates yours the first time, and an
        organizer puts you on a team.
      </p>

      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-ink/15" />
        {/* 60, not 55. Ink at 55% over paper is 4.34:1, under AA's 4.5:1 at this size. */}
        <span className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          or, for organizers
        </span>
        <span className="h-px flex-1 bg-ink/15" />
      </div>

      <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
        <label className="flex flex-col gap-1" style={{ fontSize: "var(--text-sm)" }}>
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded border border-ink/25 bg-paper px-3 py-2"
            style={{ fontSize: "var(--text-sm)" }}
          />
        </label>

        <label className="flex flex-col gap-1" style={{ fontSize: "var(--text-sm)" }}>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded border border-ink/25 bg-paper px-3 py-2"
            style={{ fontSize: "var(--text-sm)" }}
          />
        </label>

        {error !== null && (
          <p role="alert" className="text-panther" style={{ fontSize: "var(--text-xs)" }}>
            {error}
          </p>
        )}

        <Button type="submit" disabled={busy || email === "" || password === ""}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
        Students do not need a code. Signing in creates your account, and an organizer puts you on
        a team.
      </p>
    </div>
  );
}
