import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { BrandPanel } from "@/components/contest/join/BrandPanel";
import { SignInForm } from "@/components/contest/join/SignInForm";
import { oauthProviderAvailability } from "@/lib/contest/env";
import { signInErrorMessage } from "@/lib/contest/sign-in-errors";

export const metadata: Metadata = {
  title: "Sign in | Coding Night",
};

/**
 * Sign-in for everyone, on the same split-screen as `/join`.
 *
 * This used to be organizer-only, with students entering through a join code. Students now sign
 * up with Google or GitHub — the first sign-in creates their account — and an organizer places
 * them on a team afterwards. The join code survives as break-glass, not as the front door.
 *
 * Outside the `(competitor)` route group on purpose: that group's chrome carries the competitor
 * nav and a contest countdown, neither of which belongs on the page an organizer reaches before
 * there is a session to scope them to.
 *
 * `?error=` is set by the OAuth routes when something refuses — cancelling at the consent screen is
 * the common one. Before this page existed that redirect was a 404, so the student-facing outcome
 * of pressing "cancel" was a broken link.
 *
 * ## `?error=` is a CODE and this page is the only thing that turns it into a sentence
 *
 * It used to be the sentence itself, taken straight off the query string and rendered. React
 * escapes it, so there was never an XSS — but the text WAS the attack: anyone could send a student
 * `/sign-in?error=Your+account+is+locked,+email+your+password+to…` and it rendered in our styling,
 * on our domain, above our sign-in form. `signInErrorMessage` only ever returns copy written down
 * in `lib/contest/sign-in-errors.ts`, so an unrecognised code degrades to a generic sentence
 * instead of becoming one — which also makes it structurally impossible for an exception message
 * or a stack to reach a student here.
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
  const providerAvailability = oauthProviderAvailability();
  const studentSignInAvailable = providerAvailability.google || providerAvailability.github;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <BrandPanel>
        <p className="font-display" style={{ fontSize: "var(--text-md)" }}>
          Welcome back to
        </p>
        <p className="font-display font-bold" style={{ fontSize: "var(--text-2xl)" }}>
          Coding Night
        </p>
        <p className="mt-3 text-paper/75" style={{ fontSize: "var(--text-sm)" }}>
          {studentSignInAvailable
            ? "Use an available account to compete. Organizers sign in here too."
            : "Organizer sign-in is available. Student provider sign-in is not configured on this server."}
        </p>
      </BrandPanel>

      {/*
        A `<main>` landmark, which this page did not have.

        The root layout renders no landmark either, so `/sign-in` was a document whose entire
        content sat in anonymous divs: nothing for a screen reader to jump to, and no way to skip
        the brand panel. It also gives the specs a scope — `getByRole("alert")` matched two nodes
        without one, because Next's route announcer is an `alert` too.
      */}
      {/*
        `max-w-md mx-auto`, not a flush-left `max-w-sm`: `justify-center` on the flex column only
        centres vertically, so the form sat pinned to the panel's left edge with a growing void
        beside it (585px of bare ground at 985px wide). 448px centred lands within 7px of the
        reference's measured 441px column.
      */}
      <main className="flex flex-col justify-center px-4 py-10 lg:px-14">
        <div className="mx-auto w-full max-w-md">
          {/*
            The way out.

            Reported by an organizer using the site: "when I am at this page there is no way to go
            back to the main page". It was exactly right. This is a full-bleed split screen outside
            the competitor route group, so it inherits no chrome, no nav and no footer, and the
            brand panel beside it is a `<div>` with a picture in it rather than a link. Every route
            into this page is a one-way trip: the header links on `/`, both hero buttons, the
            closing band, the sign-out in `CompetitorChrome`, and every `?error=` redirect out of
            OAuth. A student who pressed "Sign in to compete" to see what it was had the browser's
            back button and nothing else, and on a phone opened from a shared link there may not
            even be a history entry behind this one.

            First in the main landmark, so it is also the first thing Tab reaches after the skip
            target. Text as well as an arrow, because a lone glyph is not a label and colour and
            shape are never the only channel (DESIGN.md §3).
          */}
          <Link
            href="/"
            /*
              `py-1` lifts the target from 19px to 27px, over WCAG 2.5.8's 24px floor - this is a
              standalone link with nothing else near it, so the inline exception does not apply.
            */
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
            Below `lg` the BrandPanel is display:none, which left this page with zero brand
            identity on a phone: a student opening a texted link saw "Sign in" over a form on
            off-white, with the product named nowhere but the browser tab. The mark and the one
            line render only where the panel does not, so the name appears exactly once at every
            width.
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
            Sign in
          </h1>
          <p className="mt-2 text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            {studentSignInAvailable
              ? "Students and organizers both start here."
              : "Organizer sign-in is available below."}
          </p>

          <div className="mt-6">
            <SignInForm
              initialError={error}
              providerAvailability={providerAvailability}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
