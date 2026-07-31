import type { Metadata } from "next";

import { BrandPanel } from "@/components/contest/join/BrandPanel";
import { SignInForm } from "@/components/contest/join/SignInForm";
import { signInErrorMessage } from "@/lib/contest/sign-in-errors";

export const metadata: Metadata = {
  title: "Sign in — Coding Night",
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
          Sign in with your school account to compete. Organizers sign in here too.
        </p>
      </BrandPanel>

      {/*
        A `<main>` landmark, which this page did not have.

        The root layout renders no landmark either, so `/sign-in` was a document whose entire
        content sat in anonymous divs: nothing for a screen reader to jump to, and no way to skip
        the brand panel. It also gives the specs a scope — `getByRole("alert")` matched two nodes
        without one, because Next's route announcer is an `alert` too.
      */}
      <main className="flex flex-col justify-center px-4 py-10 lg:px-14">
        <div className="w-full max-w-sm">
          <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
            Sign in
          </h1>
          <p className="mt-2 text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            Students and organizers both start here.
          </p>

          <div className="mt-6">
            <SignInForm initialError={error} />
          </div>
        </div>
      </main>
    </div>
  );
}
