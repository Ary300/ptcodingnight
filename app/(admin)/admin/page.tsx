import Link from "next/link";

import { ContestPicker } from "@/components/admin/ContestPicker";

/**
 * `/admin` — the contest list. HackerRank's "Manage Contests", which is its admin HOME.
 *
 * ## What this used to be
 *
 * Six bordered cards in a 2-up grid, every one of them duplicating a link already in the nav bar
 * directly above it, plus three problem-bank figures describing the global bank rather than any
 * contest. **There was no list of contests on it and no way to create one**, so the first-time
 * walk began by guessing that "Contest builder" meant "create" — and the screen an organizer
 * actually needed, the one saying which contests exist and what state each is in, did not exist at
 * any URL.
 *
 * It is now the list and the one door off it. The problem-bank figures moved to `/admin/problems`,
 * where they describe the thing on screen.
 *
 * ## Everything else is a tab of a contest
 *
 * Teams, side activities, the live console and awards are not destinations any more; they are
 * facets of one contest, reached by opening it. That is the whole restructure: the organizer picks
 * a contest once, and every screen after that is inside it.
 */
export default function AdminContestsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
            Contests
          </h1>
          <p className="mt-1 max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            Open a contest to set its problems, build its roster, award side-activity points, run
            the console and publish it. Everything an organizer does belongs to one contest.
          </p>
        </div>

        <Link
          href="/admin/contests/new"
          className="rounded bg-panther px-4 py-2 font-semibold text-paper hover:bg-panther-deep"
          style={{ fontSize: "var(--text-sm)" }}
        >
          Create contest
        </Link>
      </header>

      <ContestPicker variant="list" purpose="running a contest" />
    </div>
  );
}
