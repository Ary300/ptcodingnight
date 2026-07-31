import { ContestLineup } from "@/components/admin/ContestLineup";
import { ContestPicker } from "@/components/admin/ContestPicker";
import { contestNameFor } from "@/lib/contest/contests";

/**
 * `/admin/problems?contest=<id>` — choose a contest's line-up from the problem bank.
 *
 * ## What this page used to be
 *
 * Twelve hardcoded fixtures from `components/admin/stub-data.ts`, under a header claiming "125
 * problems imported from the past-contest index", while the database held 130 real problems.
 * "Add to contest" fired no request; the selection vanished on reload; there was no route to save
 * to, because nothing in the codebase wrote `ContestProblem`.
 *
 * ## Why it is contest-scoped now
 *
 * A line-up is a property of a contest, not of the bank. The old page had no contest at all, which
 * is precisely why its "add" could not do anything — there was nowhere to add TO. Picking a
 * contest first also means the same bank can be used to build next week's contest without
 * disturbing tonight's.
 */
export default async function ProblemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const contest = params.contest;
  const contestId = typeof contest === "string" && contest.length > 0 ? contest : null;
  const contestName = contestId === null ? null : await contestNameFor(contestId);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
          Problems{contestName === null ? "" : ` — ${contestName}`}
        </h1>
        <p className="mt-1 max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          Statements and test data are written in this repository under{" "}
          <code>content/problems/</code> and loaded by the seed, never copied from anywhere. This
          screen decides which of them are in a contest, and what each one is worth.
        </p>
      </header>

      {contestId === null ? (
        <ContestPicker basePath="/admin/problems" purpose="setting a line-up" />
      ) : contestName === null ? (
        <p role="status" className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          There is no contest with that id.
        </p>
      ) : (
        <ContestLineup contestId={contestId} />
      )}
    </div>
  );
}
