"use client";

import Link from "next/link";
import { useState } from "react";

import type { OAuthProviderAvailability } from "@/lib/contest/env";

import { GitHubMark, GoogleMark } from "./ProviderIcons";

/**
 * The sign-up form: name, email, password, and the two providers.
 *
 * ## Why this page exists when the first OAuth sign-in already creates an account
 *
 * Because "Create your account" and "Log in" landed on the SAME page, and the organizer called it:
 * a student who clicked Create your account was shown a login form with no name field and no way
 * to tell the two apart.
 *
 * PROVIDERS FIRST, above the form, matching the login page by the organizer's explicit
 * instruction: the two pages had the buttons at opposite ends and a student moving between them
 * had to re-find them. One click with a school Google account is also the fastest way in.
 *
 * OAuth is still the fastest way in, and the provider buttons here go through the identical
 * routes as the login page's: the first OAuth sign-in creates the account either way, so there is
 * exactly one account-creation path per provider and this page adds only the password one.
 *
 * ## What a successful submit does
 *
 * Creates the account, enrols it in the open contest, sets the session cookie, and lands on
 * /contest: one submit, signed in, done. A sign-up that ends on a page telling you to now log in
 * is two forms where one form's work was done.
 */

export interface SignUpFormProps {
  readonly providerAvailability: OAuthProviderAvailability;
}

export function SignUpForm({ providerAvailability }: SignUpFormProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anyProvider = providerAvailability.google || providerAvailability.github;

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof body === "object" && body !== null && "error" in body
            ? (body as { error: { message?: string } }).error.message
            : undefined;
        setError(message ?? "We could not create your account. Try again.");
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
      {anyProvider && (
        <>
          {/*
            The identical anchors the login page uses, for the identical reason: these are document
            navigations to routes that 302 to another origin, which a client-side <Link> cannot
            follow. The first OAuth sign-in creates the account, so these ARE sign-up buttons here.
          */}
          <div className="flex flex-col gap-2">
            {providerAvailability.google && (
              // eslint-disable-next-line @next/next/no-html-link-for-pages -- OAuth start: must be a document navigation
              <a
                href="/api/auth/google"
                className="flex items-center justify-center gap-2.5 rounded-chip border border-rule-firm px-3 py-2 font-semibold hover:border-ink hover:bg-ink/[0.03]"
                style={{ fontSize: "var(--text-sm)" }}
              >
                <GoogleMark />
                Continue with Google
              </a>
            )}
            {providerAvailability.github && (
              // eslint-disable-next-line @next/next/no-html-link-for-pages -- OAuth start: must be a document navigation
              <a
                href="/api/auth/github"
                className="flex items-center justify-center gap-2.5 rounded-chip border border-rule-firm px-3 py-2 font-semibold hover:border-ink hover:bg-ink/[0.03]"
                style={{ fontSize: "var(--text-sm)" }}
              >
                <GitHubMark />
                Continue with GitHub
              </a>
            )}
          </div>

          <div className="my-5 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-ink/15" />
            <span className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
              or
            </span>
            <span className="h-px flex-1 bg-ink/15" />
          </div>
        </>
      )}

      <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
        <label className="flex flex-col gap-1" style={{ fontSize: "var(--text-sm)" }}>
          Full name
          <input
            type="text"
            name="signup-name"
            autoComplete="name"
            required
            maxLength={40}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="rounded border border-ink/25 bg-paper px-3 py-2"
            style={{ fontSize: "var(--text-sm)" }}
          />
        </label>

        <label className="flex flex-col gap-1" style={{ fontSize: "var(--text-sm)" }}>
          Email
          <input
            type="email"
            name="signup-email"
            autoComplete="email"
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
            name="signup-password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby="signup-password-hint"
            className="rounded border border-ink/25 bg-paper px-3 py-2"
            style={{ fontSize: "var(--text-sm)" }}
          />
          {/* The server's rule, stated up front rather than discovered on submit. */}
          <span id="signup-password-hint" className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            At least 12 characters. A short phrase works well.
          </span>
        </label>

        {error !== null && (
          <p role="alert" className="text-panther" style={{ fontSize: "var(--text-xs)" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || fullName.trim() === "" || email === "" || password === ""}
          className="rounded bg-panther px-4 py-2.5 font-semibold text-paper hover:bg-panther-deep disabled:cursor-not-allowed disabled:bg-ink/25"
          style={{ fontSize: "var(--text-sm)" }}
        >
          {busy ? "Creating your account…" : "Sign up"}
        </button>
      </form>

      <p className="mt-6 text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
        Already have an account?{" "}
        <Link href="/sign-in" className="font-semibold text-panther underline underline-offset-2">
          Log in
        </Link>
      </p>
    </div>
  );
}
