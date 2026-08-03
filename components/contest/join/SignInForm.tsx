"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui";
import type { OAuthProviderAvailability } from "@/lib/contest/env";
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
 *
 * ## THREE error slots, not one, and each sits next to the control that produced it
 *
 * There was one `error` state and one place that rendered it: underneath the organizer PASSWORD
 * field. So a failed **passcode** submit printed "That passcode is not right" three hundred pixels
 * above the passcode box the organizer had just used, tucked under an unrelated password input —
 * and a failed **Google** sign-in printed its reason below the fold on a phone, nowhere near the
 * button that had been pressed. Screenshot evidence: `05-wrong-passcode.png`, `02-google-…png`.
 *
 * A message that is not next to the thing it is about is a message most people never read.
 * `busy` was shared for the same reason and had the same effect — submitting either form greyed
 * out the other one's button.
 */

interface SignInFormProps {
  /**
   * Rendered above everything, because the OAuth buttons are what produced it.
   *
   * Already resolved to a sentence by `signInErrorMessage` on the server. This component never
   * sees the raw `?error=` code, which is what keeps arbitrary query-string text off the page.
   */
  readonly initialError?: string | null;
  /** Complete server-side credential pairs, reduced to booleans before crossing into the client. */
  readonly providerAvailability: OAuthProviderAvailability;
}

export function SignInForm({
  initialError = null,
  providerAvailability,
}: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passcode, setPasscode] = useState("");

  // One slot per control. See the note above about the passcode error landing under the password.
  const [pageError, setPageError] = useState<string | null>(initialError);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passcodeError, setPasscodeError] = useState<string | null>(null);

  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passcodeBusy, setPasscodeBusy] = useState(false);

  const studentSignInAvailable =
    providerAvailability.google || providerAvailability.github;

  const bannerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  /*
    RECONCILE STATE WITH ANYTHING TYPED BEFORE HYDRATION.

    These are controlled inputs, so their value tracks React state. But between the server HTML
    painting and this component hydrating, the fields are live plain inputs: a fast typist on a
    slow connection (a room full of students on venue wifi is exactly that) can fill email and
    password, and those keystrokes never reached React, so `email === ""` kept the Sign in button
    disabled forever. Browser autofill lands the same way. On mount we read whatever the DOM
    already holds and adopt it, so the button reflects what the student can see in the fields.
  */
  useEffect(() => {
    const root = formRef.current?.closest("[data-signin-root]") ?? document;
    const read = (name: string): string => {
      const el = root.querySelector(`input[name="${name}"]`);
      return el instanceof HTMLInputElement ? el.value : "";
    };
    const domEmail = read("signin-email");
    const domPassword = read("signin-password");
    const domPasscode = read("signin-passcode");
    if (domEmail !== "") setEmail((v) => (v === "" ? domEmail : v));
    if (domPassword !== "") setPassword((v) => (v === "" ? domPassword : v));
    if (domPasscode !== "") setPasscode((v) => (v === "" ? domPasscode : v));
  }, []);

  /**
   * Announce the arrival-time error, which `role="alert"` alone does NOT do.
   *
   * A live region is announced when its content CHANGES. This banner's content is in the server
   * response — `?error=` is resolved during render, so the element is already in the HTML the
   * browser parses. There is no change for a screen reader to notice, and the message a student
   * was redirected here to read is the one least likely to be read.
   *
   * Moving focus to it is the fix that works across screen readers: the banner is `tabIndex={-1}`
   * so it can receive focus programmatically without joining the tab order, and taking focus also
   * scrolls it into view, which is the same defect for a sighted student on a phone.
   *
   * Runs once, on mount, and only for the server-supplied error — the two fetch paths below set
   * their own errors after an interaction, where `role="alert"` does fire and stealing focus from
   * a form the person is still using would be worse than useless.
   */
  useEffect(() => {
    if (initialError !== null && initialError !== "") bannerRef.current?.focus();
  }, [initialError]);

  /**
   * The organizer passcode — the night's fallback, and the only way into `/admin` on a fresh
   * deployment.
   *
   * `POST /api/admin/session` has existed and been tested since the beginning, and **nothing in
   * the browser posted to it.** That was survivable while `/admin/**` rendered for anybody; the
   * moment the console got a server-side gate it became a lockout, because no seed script creates
   * a `User` with `role: "ADMIN"` either. The two ways in were an account nothing creates and a
   * route nothing calls.
   *
   * It is last on the page and behind its own heading because almost nobody who reaches this
   * screen wants it. It is also the path that works when OAuth does not — an expired client
   * secret, a consent screen, a student with no school account — which is exactly the situation
   * an organizer is in when they need the console most.
   */
  const submitPasscode = async (event: React.SyntheticEvent): Promise<void> => {
    event.preventDefault();
    setPasscodeBusy(true);
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
      setPasscodeBusy(false);
    }
  };

  const submit = async (event: React.SyntheticEvent): Promise<void> => {
    event.preventDefault();
    setPasswordBusy(true);
    setPasswordError(null);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        setPasswordError(await messageFrom(response, "That sign-in did not work."));
        return;
      }
      const body: unknown = await response.json();

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
      setPasswordError("Could not reach the server. Check the connection and try again.");
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <div>
      {/*
        The page-level banner, ABOVE the OAuth buttons.

        This is where an `?error=` redirect lands, and every redirect that sets one came from
        pressing one of those two buttons. It used to render under the organizer password field,
        which is both the wrong control and — at 360px, with the real three-line message — below
        the fold.
      */}
      {pageError !== null && (
        <div
          ref={bannerRef}
          role="alert"
          tabIndex={-1}
          /*
            6%, not more. Panther on paper is 5.08:1; over a 6% panther tint it is 4.65:1, still
            clear of AA's 4.5:1 at this size. A heavier tint reads better as a banner and puts the
            message under the threshold, which is the wrong trade for the one sentence on this page
            somebody has to be able to read.
          */
          /*
            `motion-swap-in` runs on mount, which covers both ways this banner exists: rendered
            into the server HTML from `?error=` (first paint) and conditionally mounted when a
            fetch path sets it. Transform-only rise - never a fade, the message is the one
            sentence on this page somebody has to be able to read mid-animation too.
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
      {studentSignInAvailable ? (
        <>
          {/*
            `motion-stagger` here, `motion-swap-in` on each anchor: the two primary actions land
            35ms apart inside the column's own arrival, the same nesting the problem list uses
            inside the competitor template's rise.
          */}
          <div className="motion-stagger flex flex-col gap-2">
            {providerAvailability.google && (
              // eslint-disable-next-line @next/next/no-html-link-for-pages -- OAuth start: must be a document navigation
              <a
                href="/api/auth/google"
                /*
                  `border-rule-firm` at rest, not `ink/25`: the border is the only thing that makes
                  these controls read as controls (the fill is paper on paper), and WCAG 1.4.11
                  wants 3:1 for that boundary. ink/25 measures 1.78:1; rule-firm (ink/45) is 3.13:1.
                  axe has no 1.4.11 check, so the a11y gate passing was never evidence here.
                  `py-2` rather than `py-2.5` so the links stand 42px like the inputs below: one
                  control height per column, not three.
                */
                /*
                  These two anchors are the first controls every student touches all night, and
                  they were the only button-shaped things on the site whose hover and press
                  changed in the same frame. Same grammar as ui/Button: colours and the 3% dip
                  on one 100ms transition.
                */
                className="motion-swap-in flex items-center justify-center gap-2.5 rounded-chip border border-rule-firm px-3 py-2 font-semibold transition-[color,background-color,border-color,transform] duration-[var(--motion-press)] hover:border-ink hover:bg-ink/[0.03] active:scale-[0.97]"
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
                className="motion-swap-in flex items-center justify-center gap-2.5 rounded-chip border border-rule-firm px-3 py-2 font-semibold transition-[color,background-color,border-color,transform] duration-[var(--motion-press)] hover:border-ink hover:bg-ink/[0.03] active:scale-[0.97]"
                style={{ fontSize: "var(--text-sm)" }}
              >
                <GitHubMark />
                Continue with GitHub
              </a>
            )}
          </div>

          <p className="mt-3 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            Students do not need a code. Your first sign-in creates your account, and an organizer
            puts you on a team.
          </p>
        </>
      ) : (
        <div
          className="rounded-chip border border-rule-firm bg-ink/[0.03] px-3 py-3"
          data-testid="student-signin-unavailable"
        >
          <p className="font-semibold" style={{ fontSize: "var(--text-sm)" }}>
            Student sign-in is not set up on this server.
          </p>
          <p className="mt-1 text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
            Students do not need a code. Google and GitHub sign-in are unavailable. Ask an
            organizer for help.
          </p>
        </div>
      )}

      {/*
        `aria-hidden` sits on the two rule spans, NOT the wrapper: "or, for organizers" is the one
        statement that the email form below is for a different audience, and hiding the wrapper
        sent a screen reader straight from the OAuth links to "Email" with no such warning.
      */}
      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-ink/15" aria-hidden="true" />
        {/* 60, not 55. Ink at 55% over paper is 4.34:1, under AA's 4.5:1 at this size. */}
        <span className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          {studentSignInAvailable ? "or, for organizers" : "organizer sign-in"}
        </span>
        <span className="h-px flex-1 bg-ink/15" aria-hidden="true" />
      </div>

      <form ref={formRef} className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
        <label className="flex flex-col gap-1" style={{ fontSize: "var(--text-sm)" }}>
          Email
          <input
            type="email"
            name="signin-email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            /*
              Both fields carry the invalid state and point at the message, because the server
              cannot say WHICH of the two was wrong (see the note on enumeration above) — so
              flagging one of them would be a guess presented as a fact.
            */
            aria-invalid={passwordError !== null}
            aria-describedby={passwordError !== null ? "password-form-error" : undefined}
            className="rounded-flat border border-rule-firm bg-paper px-3 py-2"
            style={{ fontSize: "var(--text-sm)" }}
          />
        </label>

        <label className="flex flex-col gap-1" style={{ fontSize: "var(--text-sm)" }}>
          Password
          <input
            type="password"
            name="signin-password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={passwordError !== null}
            aria-describedby={passwordError !== null ? "password-form-error" : undefined}
            className="rounded-flat border border-rule-firm bg-paper px-3 py-2"
            style={{ fontSize: "var(--text-sm)" }}
          />
        </label>

        {passwordError !== null && (
          <p
            id="password-form-error"
            role="alert"
            /* Mounts on a failed submit; the rise makes the arrival followable. Transform-only. */
            className="motion-swap-in text-panther"
            style={{ fontSize: "var(--text-xs)" }}
          >
            {passwordError}
          </p>
        )}

        {/*
          Sized by the widest label so "Sign in" swapping to "Signing in…" cannot resize the
          control mid-press (the Run/Submit pattern). The swap is keyed so the new word rises
          in rather than flickering into place.
        */}
        <Button
          type="submit"
          className="relative whitespace-nowrap"
          disabled={passwordBusy || email === "" || password === ""}
        >
          <span aria-hidden="true" className="invisible">Signing in…</span>
          <span
            key={passwordBusy ? "busy" : "idle"}
            className="motion-swap-in absolute inset-0 flex items-center justify-center"
          >
            {passwordBusy ? "Signing in…" : "Sign in"}
          </span>
        </Button>
      </form>

      {/*
        Collapsed by default. A passcode field sitting open on the front door invites every
        student in the room to have a go at it, and the thing it opens is the console that can
        rewrite a verdict. `<details>` rather than state: it is a disclosure, the element exists
        for exactly this, and it keeps working with no JavaScript.

        `open` is forced while there is a passcode error, so a refusal cannot be reported into a
        collapsed section — which is what would happen to anyone who submitted and then closed it.
      */}
      <details className="mt-6 border-t border-rule-hair pt-4" open={passcodeError !== null}>
        <summary
          className="cursor-pointer text-ink/70 hover:text-ink"
          style={{ fontSize: "var(--text-xs)" }}
        >
          Organizer passcode
        </summary>

        {/*
          `motion-panel-in` because opening the disclosure lands a whole form in one frame,
          and an expansion that completes in the same frame as the click reads as a glitch.
          Transform only, per the entrance rule; the controls are live from the first frame.

          THE RESTART IS CSS, AND THE FORM MUST NOT BE REMOUNTED TO GET IT.

          This carried `key={passcodeOpens}`, incremented from the details' `onToggle`, to
          restart the entrance on each open. It did restart it, and it also threw the live
          passcode field away one React commit AFTER the browser had already painted the open
          panel. Everything typed into the old node in that window went to a detached element,
          where React's listeners no longer reach: `passcode` stayed "", the submit button stayed
          disabled, and the only way in was to retype. The window is invisible on an idle machine
          and seconds wide on a loaded one, which is exactly how G7 found it — one mobile run of
          `organizer-setup-flow.spec.ts` sat on a disabled button for 105 s while every other run
          that day passed.

          `details:not([open]) > .motion-panel-in { animation: none }` in globals.css already
          does the whole job. Opening flips animation-name from `none` to `motion-panel-in`,
          which the CSS Animations spec starts as a NEW animation every time, so the entrance is
          fresh on the first open and on every reopen. Both landed in the same commit (6a6899f),
          so the key was never measured on its own; it was belt over braces, and the belt was the
          part that could lose a keystroke.

          Verified in the browser rather than reasoned about: on reopen the form reports one
          running `motion-panel-in` with currentTime at the start of its 300 ms, on the same DOM
          node that was there before the close.
        */}
        <form
          className="motion-panel-in mt-3 flex flex-col gap-3"
          onSubmit={(event) => void submitPasscode(event)}
        >
          <label className="flex flex-col gap-1" style={{ fontSize: "var(--text-sm)" }}>
            Passcode
            <input
              type="password"
              name="signin-passcode"
              autoComplete="off"
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
              /* Same as the password error above: a mount-time rise, never a fade. */
              className="motion-swap-in text-panther"
              style={{ fontSize: "var(--text-xs)" }}
            >
              {passcodeError}
            </p>
          )}

          {/* Width held by the longest label, same as the student button above. */}
          <Button
            type="submit"
            variant="secondary"
            className="relative whitespace-nowrap"
            disabled={passcodeBusy || passcode === ""}
          >
            <span aria-hidden="true" className="invisible">Open the organizer console</span>
            <span
              key={passcodeBusy ? "busy" : "idle"}
              className="motion-swap-in absolute inset-0 flex items-center justify-center"
            >
              {passcodeBusy ? "Checking…" : "Open the organizer console"}
            </span>
          </Button>

          <p className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            Use this code if your usual organizer sign-in is unavailable.
          </p>
        </form>
      </details>
    </div>
  );
}

/**
 * Pull the message out of an error envelope, or fall back.
 *
 * Both submit handlers had their own inline copy of this, and they had drifted: the password one
 * read the body before checking `response.ok` and the passcode one after, so a non-JSON response
 * (a proxy's 502 page, say) threw in one and was handled in the other. One function, and it never
 * throws — `response.json()` on an HTML body is exactly the case a sign-in form meets when
 * something upstream is unwell.
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
