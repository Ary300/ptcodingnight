import Link from "next/link";

import { Panel } from "@/components/admin/Panel";
import { HistoryFlag } from "@/components/admin/HistoryFlag";
import { draftBlockers } from "@/components/admin/contract";
import { STUB_CONTEST_NAME, STUB_PROBLEMS } from "@/components/admin/stub-data";

/**
 * Organiser overview.
 *
 * Deliberately not a dashboard of charts. It answers the three questions an organiser has
 * on the week of the event: is the line-up ready, what is still DRAFT, and which problems
 * are we about to repeat that nobody has ever scored on.
 */

const SECTIONS = [
  {
    href: "/admin/contest",
    title: "Contest builder",
    body: "Name, window, divisions, scoring preset, join code, freeze time.",
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
    body: "Final standings per division, podium, CSV and XLSX export.",
  },
] as const;

export default function AdminOverviewPage() {
  const ready = STUB_PROBLEMS.filter((p) => draftBlockers(p).length === 0);
  const drafts = STUB_PROBLEMS.filter((p) => p.state === "DRAFT");
  const neverScored = STUB_PROBLEMS.filter((p) => p.pastStatus === "used-but-zero-points");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>
          {STUB_CONTEST_NAME}
        </h1>
        <p className="mt-1 max-w-[70ch] opacity-75" style={{ fontSize: "var(--text-sm)" }}>
          Everything on these screens is rendered from fixtures. The admin API routes belong
          to another agent&rsquo;s partition and are not in this worktree yet.
        </p>
      </header>

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
              <li key={problem.problemId} className="flex flex-wrap items-center gap-3 border-b border-ink/10 pb-2">
                <Link href={`/admin/problems/${problem.slug}`} className="underline underline-offset-4">
                  {problem.title}
                </Link>
                <HistoryFlag status={problem.pastStatus} />
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded border border-ink/15 p-5 hover:border-panther"
          >
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-md)" }}>
              {section.title}
            </h2>
            <p className="mt-1 opacity-75" style={{ fontSize: "var(--text-sm)" }}>
              {section.body}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded border border-ink/15 p-5">
      <div className="numeric leading-none font-semibold" style={{ fontSize: "var(--text-2xl)" }}>
        {value}
      </div>
      <div className="mt-2 opacity-75" style={{ fontSize: "var(--text-xs)" }}>
        {label}
      </div>
    </div>
  );
}
