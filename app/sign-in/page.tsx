import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { BrandPanel } from "@/components/contest/join/BrandPanel";
import { OrganizerPasscodeForm } from "@/components/contest/join/OrganizerPasscodeForm";
import { signInErrorMessage } from "@/lib/contest/sign-in-errors";

export const metadata: Metadata = {
  title: "Organizer sign-in | Coding Night",
};

/**
 * `/sign-in` is the organizer's door and nothing else.
 *
 * The organizer's instruction on 2026-11-15: "just remove the sign in option since we dont need
 * it anymore". Students have no accounts. They enter with the join code on their slip at `/join`,
 * and this page holds the one credential the runbook depends on, the organizer passcode
 * (`docs/NIGHT.md`: "Sign in as an organizer with the passcode on /sign-in"). The email and
 * password form, the Google and GitHub buttons and the sign-up link that used to share this
 * screen are gone; the API routes behind them still exist, and nothing on the site links to them.
 *
 * A student who lands here anyway, from a stale bookmark or by habit, gets one line pointing at
 * `/join`.
 *
 * Outside the `(competitor)` route group on purpose: that group's chrome carries the competitor
 * nav and a contest countdown, neither of which belongs on the page an organizer reaches before
 * there is a session to scope them to.
 *
 * ## `?error=` is a CODE and this page is the only thing that turns it into a sentence
 *
 * It used to be the sentence itself, taken straight off the query string and rendered. React
 * escapes it, so there was never an XSS, but the text WAS the attack: anyone could send a person
 * `/sign-in?error=Your+account+is+locked,+email+your+password+to…` and it rendered in our styling,
 * on our domain, above our sign-in form. `signInErrorMessage` only ever returns copy written down
 * in `lib/contest/sign-in-errors.ts`, so an unrecognised code degrades to a generic sentence
 * instead of becoming one. The code that reaches this page in practice is `organizer_required`,
 * from the `/admin` layout and the code wall; the provider codes survive because the OAuth routes
 * still answer at their URLs and still redirect here when something refuses.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const code = typeof params.error === "string" ? params.error : null;
  const provider = typeof params.provider === "string" ? params.provider : null;
  const error = signInErrorMessage(code, provider);

  /*
    Arrival motion via a class on the page root, not a template. This page is outside both route
    groups, so the group templates never wrap it, and a root `app/template.tsx` would nest a
    second rise inside the group templates on every navigation and put an entrance on the
    projector. `motion-stagger` on the grid: the brand panel lands first, the form column 35ms
    behind.
  */
  return (
    <div className="motion-stagger grid min-h-screen lg:grid-cols-2">
      <BrandPanel>
        <p className="font-display" style={{ fontSize: "var(--text-md)" }}>
          Welcome back to
        </p>
        <p className="font-display font-bold" style={{ fontSize: "var(--text-2xl)" }}>
          Park Tudor Coding Night
        </p>
        <p className="mt-3 max-w-[38ch] text-paper/85" style={{ fontSize: "var(--text-sm)" }}>
          The organizer console: roster, sets, the live board and awards.
        </p>
      </BrandPanel>

      {/*
        A `<main>` landmark. The root layout renders no landmark, so without this the page is a
        document whose entire content sits in anonymous divs: nothing for a screen reader to jump
        to, and no way to skip the brand panel. It also gives the specs a scope, because Next's
        route announcer is an `alert` too.
      */}
      <main className="motion-swap-in flex flex-col justify-center px-4 py-10 lg:px-14">
        <div className="mx-auto w-full max-w-md">
          {/*
            The way out. Reported by an organizer: "when I am at this page there is no way to go
            back to the main page". This is a full-bleed split screen with no chrome, no nav and
            no footer, so the exit has to be on the page itself. First in the main landmark, so it
            is the first thing Tab reaches. Text as well as an arrow, because a lone glyph is not
            a label (DESIGN.md §3).
          */}
          <Link
            href="/"
            /* `py-1` lifts the target from 19px to 27px, over WCAG 2.5.8's 24px floor. */
            className="mb-5 inline-flex items-center gap-1.5 rounded-chip py-1 text-ink/70 underline-offset-4 hover:text-ink hover:underline"
            style={{ fontSize: "var(--text-xs)" }}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 3 5 8l5 5" />
            </svg>
            Back to the home page
          </Link>

          {/*
            Below `lg` the BrandPanel is display:none, so the mark and the name render only where
            the panel does not. The name appears exactly once at every width.
          */}
          <div className="mb-5 flex items-center gap-2.5 lg:hidden">
            <Image
              src="/brand/pt-panther.png"
              alt=""
              aria-hidden="true"
              width={275}
              height={235}
              priority
              className="h-8 w-auto"
            />
            <span className="font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
              Park Tudor Coding Night
            </span>
          </div>

          <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
            Organizer sign-in
          </h1>
          <p className="mt-2 mb-5 text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            Type the passcode to open the console.
          </p>

          <OrganizerPasscodeForm initialError={error} />

          <p className="mt-6 text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            Competing tonight?{" "}
            <Link href="/join" className="font-semibold text-panther underline underline-offset-2">
              Enter your join code
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
