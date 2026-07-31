import type { Metadata } from "next";

import { BrandPanel } from "@/components/contest/join/BrandPanel";
import { SignInForm } from "@/components/contest/join/SignInForm";

export const metadata: Metadata = {
  title: "Sign in — Coding Night",
};

/**
 * Organizer sign-in, on the same split-screen as `/join`.
 *
 * Outside the `(competitor)` route group on purpose: that group's chrome carries the competitor
 * nav and a contest countdown, neither of which belongs on the page an organizer reaches before
 * there is a session to scope them to.
 *
 * `?error=` is set by the OAuth callback when a provider reports a failure — cancelling at the
 * consent screen is the common one. Before this page existed that redirect was a 404, so the
 * student-facing outcome of pressing "cancel" was a broken link.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.error;
  const error = typeof raw === "string" ? raw : null;

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
          Organizer sign-in. Run the contest, judge, override, and export the results.
        </p>
      </BrandPanel>

      <div className="flex flex-col justify-center px-4 py-10 lg:px-14">
        <div className="w-full max-w-sm">
          <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
            Sign in
          </h1>
          <p className="mt-2 text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            For organizers. Students join with a code instead.
          </p>

          <div className="mt-6">
            <SignInForm initialError={error} />
          </div>
        </div>
      </div>
    </div>
  );
}
