import Link from "next/link";

import { Rail } from "@/components/ui";
import type { ProblemSummary } from "@/lib/schemas/api";

import { problemStatusLabel } from "../verdict/verdict-display";

/**
 * The problem list: slot label, difficulty, points, and this participant's own status
 * (PRD §9.1).
 *
 * ## Why one panel with hairlines rather than a stack of cards
 *
 * HackerRank's list screens are a single surface divided by hairlines, not a column of separate
 * boxes with air between them. The difference is not decoration: fourteen detached cards read as
 * fourteen unrelated things and cost a border-plus-gap of vertical space each, which on a 360px
 * phone is the difference between four problems above the fold and two. One panel also gives the
 * rail an unbroken column to run down, which is the whole point of the rail (DESIGN.md §5).
 *
 * ## Why the metadata is a second line
 *
 * It used to be four columns that collapsed to four stacked lines on a phone, so every row was
 * six lines tall. Title first, then one quiet run of `Easy · 100 pts · group`, is HackerRank's
 * density and it survives the narrow viewport without a separate mobile layout.
 *
 * Two things kept from the first version, both deliberate:
 *
 *  - **The rail is `brand`, not a rank state.** `rise`/`fall`/`rest` are rank-movement
 *    colours, and `rest` is `--paper` at 22% — invisible on a paper background. Here the
 *    rail is chrome, which is exactly what docs/DESIGN.md §5 reserves `brand` for.
 *  - **Status is a word plus a CSS-drawn mark, never a coloured glyph.** Check and cross
 *    characters are outside the vendored font subsets and would fall back to whatever the
 *    machine has (DESIGN.md §3), and colour alone is not a channel this project uses.
 */

const DIFFICULTY_LABEL: Readonly<Record<"E" | "M" | "H", string>> = {
  E: "Easy",
  M: "Medium",
  H: "Hard",
};

function StatusMark({ solved, partial }: { solved: boolean; partial: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border-2 border-panther"
      style={{
        background: solved ? "var(--color-panther)" : "transparent",
        // A half-filled ring for partial credit: three states, three shapes.
        borderStyle: partial ? "dashed" : "solid",
      }}
    />
  );
}

/** The separator between metadata items. U+00B7 is inside the vendored Latin subset. */
function Dot() {
  return (
    <span aria-hidden="true" className="text-ink/40">
      &#183;
    </span>
  );
}

function ProblemCard({ problem }: { problem: ProblemSummary }) {
  const status = problemStatusLabel(problem.solved, problem.bestScore);
  const partial = !problem.solved && problem.bestScore !== null && problem.bestScore > 0;

  /*
    A row nobody has been able to touch has no status worth printing.

    A locked problem could never have been attempted, so its status is "Unsolved" by construction —
    and on the pre-start lobby that is every row, which puts the word "Unsolved" fourteen times on
    a screen where nobody has had the chance to solve anything, next to a "Locked" badge that is
    the only true thing in the pair. On a 360px phone the two of them together are most of the row.

    Conditioned on the DATA rather than on the lock, so a row that somehow carries a real score is
    still shown it.
  */
  const hasStatus = problem.unlocked || problem.solved || problem.bestScore !== null;

  const body = (
    <div className="flex flex-1 items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4">
      <span
        data-problem-slot
        className="numeric w-20 min-w-0 shrink-0 font-semibold leading-tight text-panther sm:w-28"
        style={{ fontSize: "var(--text-xs)", overflowWrap: "anywhere" }}
      >
        {problem.slotLabel}
      </span>

      <span className="min-w-0 flex-1">
        <span
          data-problem-title
          className="block font-display font-bold"
          style={{ fontSize: "var(--text-sm)" }}
        >
          {problem.title}
        </span>
        {/*
          One quiet run of metadata under the title. `text-ink/60` is the floor from DESIGN.md §7
          and is applied exactly once — never stacked, and never a wrapper `opacity`, which would
          multiply with it and land at 2.84:1.
        */}
        <span
          className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-ink/60"
          style={{ fontSize: "var(--text-xs)" }}
        >
          <span>
            {problem.difficulty === null ? "Unrated" : DIFFICULTY_LABEL[problem.difficulty]}
          </span>
          <Dot />
          <span className="numeric">{problem.basePoints} pts</span>
          {problem.isGroupProblem && (
            <>
              <Dot />
              {/*
                Not styling alone: a group problem is the one thing a student with no team CAN
                open, so the list has to say which rows those are in words.
              */}
              <span>group</span>
            </>
          )}
        </span>
      </span>

      {hasStatus && (
        <span
          className="flex shrink-0 items-center gap-2 sm:w-28"
          style={{ fontSize: "var(--text-xs)" }}
        >
          <StatusMark solved={problem.solved} partial={partial} />
          <span className={problem.solved ? "font-semibold" : "text-ink/60"}>{status}</span>
        </span>
      )}
    </div>
  );

  if (!problem.unlocked) {
    return (
      // No container opacity. Opacity on a wrapper MULTIPLIES with any alpha inside it, so
      // opacity-60 over text-ink/70 composited to 0.42 and measured 2.84:1 — a locked problem
      // rendered illegible. The state is already carried by the "Locked" badge and the rail,
      // which is what a screen reader gets anyway; dimming it was decoration that cost
      // legibility. Muted-on-paper floor is /60, applied once, never stacked.
      <li className="motion-swap-in flex items-stretch">
        <Rail state="brand" />
        {body}
        <span
          className="numeric mr-3 self-center rounded-chip bg-ink px-2 py-0.5 text-paper sm:mr-4"
          style={{ fontSize: "var(--text-xs)" }}
        >
          Locked
        </span>
      </li>
    );
  }

  return (
    <li className="motion-swap-in flex items-stretch">
      <Rail state="brand" />
      <Link
        data-problem-row
        href={`/contest/${problem.slug}`}
        className="flex flex-1 transition-colors hover:bg-ink/[0.04]"
        // The whole row is the target; the accessible name carries what the layout implies.
        // A comma, not an em dash. A screen reader reads this string out, so it is user-visible
        // text like any other, and no em dash may appear in text a person using this site reads.
        aria-label={`${problem.slotLabel}, ${problem.title}, ${problem.basePoints} points, ${status}`}
      >
        {body}
      </Link>
    </li>
  );
}

export interface ProblemListProps {
  problems: readonly ProblemSummary[];
}

export function ProblemList({ problems }: ProblemListProps) {
  if (problems.length === 0) {
    return (
      // Centred inside the full list card, matching the reference's empty state and the grammar
      // SubmissionHistory already uses. A left-aligned shrink-wrapped sentence read as a stray
      // paragraph, not as the list saying it is empty.
      <p
        className="rounded-panel border border-rule-edge bg-paper p-4 py-8 text-center text-ink/70"
        style={{ fontSize: "var(--text-sm)" }}
      >
        No problems are available to you yet. Check the team and set assignment above, or ask an
        organizer.
      </p>
    );
  }

  return (
    // Named, so a test — and a screen reader — can address the problem list rather than
    // whichever list happens to be first on a page that also carries standings.
    <ul
      aria-label="Problems"
      // motion-stagger: rows land 35ms apart on first paint instead of in one frame. The list is
      // the first thing a student sees after signing in; arriving in sequence reads as loading
      // having FINISHED, where a single-frame appearance reads as a flicker.
      className="motion-stagger divide-y divide-rule-hair overflow-hidden rounded-panel border border-rule-edge bg-paper"
    >
      {problems.map((problem) => (
        <ProblemCard key={problem.contestProblemId} problem={problem} />
      ))}
    </ul>
  );
}
