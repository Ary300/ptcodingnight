"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui";

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
      // A full navigation rather than a router push: the session cookie was just set, and every
      // server component downstream has to be rendered with it rather than with the cached tree
      // from before the sign-in.
      window.location.assign("/admin");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
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

      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-ink/15" />
        {/* 60, not 55. Ink at 55% over paper composites to #7f7373 — 4.34:1, under AA's 4.5:1 at
            this size. The same mistake is recorded in ProblemWorkspace; 60% measures 5.16:1. */}
        <span className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          or
        </span>
        <span className="h-px flex-1 bg-ink/15" />
      </div>

      {/*
        Plain links, and deliberately not disabled when a provider has no credentials. The route
        answers 503 with a readable reason in that case; a greyed-out button would say "not for
        you" to an organizer whose account is fine and whose server is merely misconfigured.
      */}
      {/*
        `no-html-link-for-pages` is suppressed here, and only here. The rule exists to stop an
        `<a>` doing a full page load to a route the client router could have handled — but these
        are not pages. `/api/auth/{provider}` sets a state cookie and 302s to Google or GitHub,
        and a client-side navigation cannot follow a redirect to another origin. `<Link>` would
        satisfy the linter and break the sign-in, which is the wrong trade.
      */}
      <div className="flex flex-col gap-2">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- OAuth start: must be a document navigation */}
        <a
          href="/api/auth/google"
          className="rounded border border-ink/25 px-3 py-2 text-center hover:border-ink/45"
          style={{ fontSize: "var(--text-sm)" }}
        >
          Continue with Google
        </a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- OAuth start: must be a document navigation */}
        <a
          href="/api/auth/github"
          className="rounded border border-ink/25 px-3 py-2 text-center hover:border-ink/45"
          style={{ fontSize: "var(--text-sm)" }}
        >
          Continue with GitHub
        </a>
      </div>

      <p className="mt-6 text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
        Here to compete?{" "}
        <Link href="/join" className="text-panther underline underline-offset-2">
          Join with a contest code
        </Link>{" "}
        — students do not need an account.
      </p>
    </div>
  );
}
