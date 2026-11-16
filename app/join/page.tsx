import type { Metadata } from "next";
import Link from "next/link";

import { BrandPanel } from "@/components/contest/join/BrandPanel";
import { JoinCodeForm } from "@/components/contest/join/JoinCodeForm";
import { PracticeStartButton } from "@/components/contest/join/PracticeStartButton";
import { SignedInNotice } from "@/components/contest/join/SignedInNotice";
import { contestNameFor } from "@/lib/contest/contests";
import { viewerFromCookies } from "@/lib/contest/viewer";

export const metadata: Metadata = {
  title: "Join with a code | Coding Night",
};

/**
 * `/join` — the door most students walk through on the night.
 *
 * The teacher's rule: no accounts at the desk. Organizers build every team beforehand, each seat
 * gets a code, and a student types theirs to land in the contest already on their team. The
 * organizer's instruction (2026-11-15) is that students have no accounts at all, so this is the
 * only student door and every student-facing call to action lands here. `/sign-in` is the
 * organizer passcode page; it links back here for a student who typed it by habit, and nothing
 * here links to it.
 *
 * Same split screen and the same route-group decision as `/sign-in`: outside `(competitor)`, so
 * no contest chrome wraps a page reached before any session exists.
 */
export default async function JoinPage() {
  // A student who is already in a contest is told so above the form, with a way in and a way out.
  const viewer = await viewerFromCookies();
  const signedIn =
    viewer.kind === "competitor"
      ? { displayName: viewer.displayName, contestName: await contestNameFor(viewer.contestId) }
      : null;

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
          Park Tudor Coding Night
        </p>
        <p className="mt-3 max-w-[38ch] text-paper/85" style={{ fontSize: "var(--text-sm)" }}>
          The code on your slip signs you in and puts you on your team.
        </p>
      </BrandPanel>

      {/*
        `min-w-0` on the grid item: a grid child defaults to `min-width: auto`, so the 40px code field
        set the column's width and the whole page laid out at 480px on a 360px phone (2026-11-15
        production sweep). The column now takes the viewport and the field shrinks to fit it.
      */}
      <main className="motion-swap-in flex min-w-0 items-center justify-center px-4 py-10">
        <div className="w-full min-w-0 max-w-md">
          {signedIn !== null && (
            <SignedInNotice
              displayName={signedIn.displayName}
              contestName={signedIn.contestName}
            />
          )}
          {/* Practice above the code form, out of it, by the organizers' call. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/"
              className="text-ink/70 underline underline-offset-2 hover:text-panther"
              style={{ fontSize: "var(--text-xs)" }}
            >
              Back to the home page
            </Link>
            <PracticeStartButton variant="bar" />
          </div>

          <h1 className="mt-4 font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
            Enter your join code
          </h1>
          <p className="mt-1 mb-6 text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            Type the code from your slip.
          </p>

          <JoinCodeForm />
        </div>
      </main>
    </div>
  );
}
