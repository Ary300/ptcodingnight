import type { Metadata } from "next";
import Link from "next/link";

import { BrandPanel } from "@/components/contest/join/BrandPanel";
import { JoinCodeForm } from "@/components/contest/join/JoinCodeForm";

export const metadata: Metadata = {
  title: "Join with a code | Coding Night",
};

/**
 * `/join` — the door most students walk through on the night.
 *
 * The teacher's rule: no accounts at the desk. Organizers build every team beforehand, each seat
 * gets a code, and a student types theirs to land in the contest already on their team. Accounts
 * still exist and still work; this page is a third door beside them, not a replacement, which is
 * why both other doors are linked from here and this one is linked from both of them.
 *
 * Same split screen and the same route-group decision as `/sign-in` and `/sign-up`: outside
 * `(competitor)`, so no contest chrome wraps a page reached before any session exists.
 */
export default function JoinPage() {
  /*
    Arrival motion via a class on the page root, matching the two sibling doors exactly: this
    page is outside both route groups, always a fresh mount, and a root template would double
    the rise inside the groups and animate the projector.
  */
  return (
    <div className="motion-stagger grid min-h-screen lg:grid-cols-2">
      <BrandPanel>
        <p className="font-display" style={{ fontSize: "var(--text-md)" }}>
          Welcome to
        </p>
        <p className="font-display font-bold" style={{ fontSize: "var(--text-2xl)" }}>
          Coding Night
        </p>
        <p className="mt-3 max-w-[38ch] text-paper/85" style={{ fontSize: "var(--text-sm)" }}>
          Your code puts you straight onto your team. No account, no password, nothing to set up.
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
            Enter your join code
          </h1>
          <p className="mt-1 mb-6 text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            An organizer handed you a slip with a code on it. Type it below.
          </p>

          <JoinCodeForm />
        </div>
      </main>
    </div>
  );
}
