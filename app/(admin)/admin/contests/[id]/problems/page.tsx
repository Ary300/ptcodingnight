import { ContestLineup } from "@/components/admin/ContestLineup";
import { listContestDivisions } from "@/lib/contest/contests";

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
  // Divisions ride down beside the stored slots: the Division control on each line-up row needs
  // the contest's own divisions to offer, and reading them here keeps the editor off the network
  // for data the server already has in hand.
  const [existing, divisions] = await Promise.all([
    contestLineup(id),
    listContestDivisions(id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-lg)" }}>
          Problems
        </h2>
        <p className="mt-1 max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          Choose the questions for this contest and set how many points each one is worth.
        </p>
      </header>

      <ContestLineup contestId={id} initial={existing} divisions={divisions} />
    </div>
  );
}
