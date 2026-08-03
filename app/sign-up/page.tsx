import type { Metadata } from "next";
import Link from "next/link";

import { BrandPanel } from "@/components/contest/join/BrandPanel";
import { SignUpForm } from "@/components/contest/join/SignUpForm";
import { oauthProviderAvailability } from "@/lib/contest/env";

export const metadata: Metadata = {
  title: "Create your account | Coding Night",
};

/**
 * Rendered per request, never prerendered at build time.
 *
 * This page asks the ENVIRONMENT which OAuth providers this server has credentials for, and a
 * build machine is not the server: `next build` tried to prerender it, `parseContestEnv` refused
 * the build image's empty environment, and the whole production build died with "Export
 * encountered an error on /sign-up". `/sign-in` never hit this only because it takes
 * `searchParams`, which opts it out of prerendering as a side effect - an accident, not a
 * decision, and this makes the decision explicit on the page that needs it.
 */
export const dynamic = "force-dynamic";

/**
 * `/sign-up` — create an account, on the same split screen as `/sign-in`.
 *
 * This page exists because "Create your account" used to link to the login page, which showed a
 * login form: no name field, nothing that said "new here, start here". The organizer called it,
 * with HackerRank's join page as the reference: the form first (Full Name, Email, Your password),
 * the providers under an "or", and "Already have an account? Log in" at the bottom.
 *
 * Same route group and shell decisions as sign-in: outside `(competitor)` so no contest chrome
 * wraps a page reached before any session exists.
 */
export default function SignUpPage() {
  const providerAvailability = oauthProviderAvailability();

  /*
    Arrival motion via a class on the page root, not a template - same decision as `/sign-in`,
    for the same reasons: outside both route groups, always a fresh mount on every way in, and a
    root template would double the rise inside the groups and animate the projector.
  */
  return (
    <div className="motion-stagger grid min-h-screen lg:grid-cols-2">
      <BrandPanel>
        <p className="font-display" style={{ fontSize: "var(--text-md)" }}>
          Join
        </p>
        <p className="font-display font-bold" style={{ fontSize: "var(--text-2xl)" }}>
          Coding Night
        </p>
        <p className="mt-3 max-w-[38ch] text-paper/85" style={{ fontSize: "var(--text-sm)" }}>
          One account gets you your team, your problem set, and your place on the board.
        </p>
      </BrandPanel>

      <main className="motion-swap-in flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="text-ink/70 underline underline-offset-2 hover:text-panther"
            style={{ fontSize: "var(--text-xs)" }}
          >
            Back to the home page
          </Link>

          <h1 className="mt-4 font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
            Create your account
          </h1>
          <p className="mt-1 mb-6 text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            Sign up once. An organizer puts you on a team when you arrive.
          </p>

          <SignUpForm providerAvailability={providerAvailability} />
        </div>
      </main>
    </div>
  );
}
