import { ContestLineup } from "@/components/admin/ContestLineup";

import { contestLineup } from "../contest-setup";

/**
 * The contest's line-up — HackerRank's Challenges tab.
 *
 * ## Two things this fixes at once
 *
 * It is reachable from the contest you just made, carrying the contest with it. `/admin/problems`
 * was a global nav item that asked which contest all over again, and the "Add problems" link on
 * the create screen pointed at it with the id stripped off.
 *
 * And it opens showing what is already in the line-up. `PUT /api/admin/contests/{id}/problems`
 * REPLACES the whole line-up, and there is no GET beside it, so `ContestLineup` mounted with an
 * empty basket every single time: the Problems tab of a contest with six problems in it read
 * "Nothing chosen yet", and the one button on the screen — Save — deleted all six. The existing
 * slots are read on the server here and handed down as the starting basket, so Save now means
 * "save what I can see" rather than "replace it with what I cannot".
 */
export default async function ContestProblemsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const existing = await contestLineup(id);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-lg)" }}>
          Problems
        </h2>
        <p className="mt-1 max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          Statements and test data are written in this repository under{" "}
          <code>content/problems/</code> and loaded by the seed, never copied from anywhere. This
          tab decides which of them are in this contest, and what each one is worth.
        </p>
      </header>

      <ContestLineup contestId={id} initial={existing} />
    </div>
  );
}
