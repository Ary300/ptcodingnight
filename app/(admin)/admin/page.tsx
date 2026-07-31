import Link from "next/link";

import { Panel } from "@/components/admin/Panel";
import { problemBank } from "@/lib/contest/problem-bank";

/**
 * Organiser overview.
 *
 * Deliberately not a dashboard of charts. It answers the three questions an organiser has
 * on the week of the event: is the line-up ready, what is still DRAFT, and which problems
 * are we about to repeat that nobody has ever scored on.
 *
 * ## The section list is the nav, and it was missing two of the six
 *
 * Teams and Side activities were absent — the two screens that write SCORING INPUTS. Team size is
 * the divisor in every team score and side-activity points are added to it, so the only two ways
 * to change a team's score without a submission were the two an organizer could not find from
 * here. They are first now, and grouped as such.
 *
 * ## The counts are real now
 *
 * They used to come from `components/admin/stub-data.ts` — twelve fixtures — under a banner
 * admitting as much. That banner was the right thing to do about a wrong situation: an organizer
 * who reads "3 still in DRAFT" off invented data and concludes the line-up is ready has been
 * actively misled. `problemBank()` reads the database, so the numbers now describe the contest
 * about to be run and the banner is gone.
 */

/** The two screens that change a team's score without a submission passing through the judge. */
const SCORING_SECTIONS = [
  {
    href: "/admin/teams",
    title: "Teams",
    body: "Build the roster. Team size is the divisor in every team score, so a move here is a score change — and is audited as one.",
  },
  {
    href: "/admin/side-activities",
    title: "Side activities",
    body: "The metal puzzle, train tracks, Connections. The only points with no submission behind them.",
  },
] as const;

const SECTIONS = [
  {
    href: "/admin/contest",
    title: "Contest builder",
    body: "Name, window, divisions, scoring preset, freeze time.",
  },
  {
    href: "/admin/problems",
    title: "Problem bank",
    body: "Past-contest history, DRAFT gate, authoring, test data, reference runs.",
  },
  {
    href: "/admin/console",
    title: "Live console",
    body: "Submissions feed, judge health, rejudge, verdict override, freeze.",
  },
  {
    href: "/admin/awards",
    title: "Awards",
    body: "Final standings, podium, CSV and XLSX export.",
  },
] as const;

export default async function AdminOverviewPage() {
  const { problems } = await problemBank();
  const ready = problems.filter((p) => p.readyBlockers.length === 0);
  const drafts = problems.filter((p) => p.state === "DRAFT");
  const neverScored = problems.filter((p) => p.pastStatus === "used-but-zero-points");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
          Coding Night
        </h1>
        <p className="mt-1 max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          Everything an organizer touches, in the order the night needs it.
        </p>
      </header>

      {/* The scoring-input screens, set apart and above the rest. */}
      <div className="grid gap-4 sm:grid-cols-2">
        {SCORING_SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded border border-ink/15 border-l-2 border-l-panther bg-paper p-5 hover:border-ink/35"
          >
            <h2 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
              {section.title}
            </h2>
            <p className="mt-1 text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
              {section.body}
            </p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded border border-ink/15 bg-paper p-5 hover:border-panther"
          >
            <h2 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
              {section.title}
            </h2>
            <p className="mt-1 text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
              {section.body}
            </p>
          </Link>
        ))}
      </div>

      <section aria-label="Problem bank readiness" className="flex flex-col gap-4">
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
          Problem bank
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Figure value={ready.length} label="problems cleared for a live contest" />
          <Figure value={drafts.length} label="still in DRAFT" />
          <Figure value={neverScored.length} label="were used and scored nothing" />
        </div>

        {neverScored.length > 0 && (
          <Panel
            title="Do not repeat these by accident"
            description="Used in a past contest, zero points from anybody. The single most useful thing the old spreadsheet remembered."
          >
            <ul className="flex flex-col gap-2" style={{ fontSize: "var(--text-sm)" }}>
              {neverScored.map((problem) => (
                <li
                  key={problem.problemId}
                  className="flex flex-wrap items-center gap-3 border-b border-ink/10 pb-2"
                >
                  <Link
                    href={`/admin/problems/${problem.slug}`}
                    className="underline underline-offset-4"
                  >
                    {problem.title}
                  </Link>
                  <span className="text-panther" style={{ fontSize: "var(--text-xs)" }}>
                    nobody scored
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </section>
    </div>
  );
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded border border-ink/15 bg-paper p-5">
      <div className="numeric leading-none font-semibold" style={{ fontSize: "var(--text-2xl)" }}>
        {value}
      </div>
      <div className="mt-2 text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
        {label}
      </div>
    </div>
  );
}
