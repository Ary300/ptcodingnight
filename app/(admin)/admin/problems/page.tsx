import Link from "next/link";

import { ContestPicker } from "@/components/admin/ContestPicker";
import { Panel } from "@/components/admin/Panel";
import { problemBank } from "@/lib/contest/problem-bank";

import { redirectIntoContestTab } from "../legacy-scope";

/**
 * `/admin/problems` — the problem bank itself, with no contest attached.
 *
 * ## Why it stopped being the line-up screen
 *
 * A LINE-UP is a property of a contest; the BANK is not. Merging the two meant the bank screen
 * opened by asking which contest it was for, and — because the contest lived in `?contest=` and no
 * nav link carried it — asked again on every visit. Setting a line-up moved to
 * `/admin/contests/<id>/problems`, which is the contest's own Challenges tab, and this URL kept
 * the half that never needed a contest.
 *
 * ## The figures moved here from `/admin`
 *
 * They describe the global bank, and they used to sit on the organizer overview under a heading
 * about a contest — three numbers about 130 problems on a screen about tonight. They describe the
 * thing on screen now.
 *
 * ## Every row is a link, which it was not
 *
 * `/admin/problems/[slug]` existed and was linked from exactly one place in the codebase: the "do
 * not repeat these" list. From the screen called Problems, a problem could not be opened at all.
 */
export default async function ProblemBankPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // A bookmarked `/admin/problems?contest=<id>` still means "set that contest's line-up".
  await redirectIntoContestTab(searchParams, "/problems");

  const { problems } = await problemBank();
  const ready = problems.filter((p) => p.readyBlockers.length === 0);
  const drafts = problems.filter((p) => p.state === "DRAFT");
  const neverScored = problems.filter((p) => p.pastStatus === "used-but-zero-points");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
          Problem bank
        </h1>
        <p className="mt-1 max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          Statements and test data are written in this repository under{" "}
          <code>content/problems/</code> and loaded by the seed, never copied from anywhere. A
          problem only becomes part of a contest on that contest&apos;s <strong>Problems</strong>{" "}
          tab.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Figure value={ready.length} label="cleared for a live contest" />
        <Figure value={drafts.length} label="still in DRAFT" />
        <Figure value={neverScored.length} label="were used and scored nothing" />
      </div>

      <Panel
        title="Cleared for a live contest"
        description="An original statement, own-generated test data, and a reference solution that survived the real judge. These are the problems a line-up can be built from tonight."
        aside={
          <span className="numeric text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
            {ready.length} of {problems.length}
          </span>
        }
      >
        {ready.length === 0 ? (
          <p className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            Nothing is cleared yet. A problem leaves DRAFT once it has an original statement and its
            own test data, and <code>npm run test:content</code> is what proves it survives the real
            judge — passing locally is not the same claim.
          </p>
        ) : (
          <ul className="flex flex-col" style={{ fontSize: "var(--text-sm)" }}>
            {ready.map((problem) => (
              <li
                key={problem.problemId}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule-hair py-2 last:border-b-0"
              >
                <Link
                  href={`/admin/problems/${problem.slug}`}
                  className="font-semibold underline underline-offset-4 hover:text-panther"
                >
                  {problem.title}
                </Link>
                <span className="numeric ml-auto text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
                  {problem.testCaseCount} tests · {problem.sampleCaseCount} shown
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {neverScored.length > 0 && (
        <Panel
          title="Do not repeat these by accident"
          description="Used in a past contest, zero points from anybody. The single most useful thing the old spreadsheet remembered."
        >
          <ul className="flex flex-col gap-2" style={{ fontSize: "var(--text-sm)" }}>
            {neverScored.map((problem) => (
              <li
                key={problem.problemId}
                className="flex flex-wrap items-center gap-3 border-b border-rule-hair pb-2 last:border-b-0"
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

      <section aria-label="Set a line-up" className="flex flex-col gap-3">
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
          Put these in a contest
        </h2>
        <p className="max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          Slot, points and set belong to a contest rather than to a problem, so the line-up is built
          inside the contest. Open one:
        </p>
        <ContestPicker tab="/problems" purpose="setting a line-up" />
      </section>
    </div>
  );
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded border border-rule-edge bg-paper p-5">
      <div className="numeric leading-none font-semibold" style={{ fontSize: "var(--text-2xl)" }}>
        {value}
      </div>
      <div className="mt-2 text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
        {label}
      </div>
    </div>
  );
}
