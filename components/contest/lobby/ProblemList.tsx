import Link from "next/link";

import { Rail } from "@/components/ui";
import type { ProblemSummary } from "@/lib/schemas/api";

import { problemStatusLabel } from "../verdict/verdict-display";

/**
 * The problem list: slot label, difficulty, points, and this participant's own status
 * (PRD §9.1).
 *
 * Two deliberate choices:
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

function ProblemCard({ problem }: { problem: ProblemSummary }) {
  const status = problemStatusLabel(problem.solved, problem.bestScore);
  const partial = !problem.solved && problem.bestScore !== null && problem.bestScore > 0;

  const body = (
    <div className="flex flex-1 flex-col gap-1 p-3 sm:flex-row sm:items-center sm:gap-4">
      <span
        className="numeric shrink-0 font-semibold text-panther"
        style={{ fontSize: "var(--text-md)" }}
      >
        {problem.slotLabel}
      </span>

      <span className="flex-1 font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
        {problem.title}
        {problem.isGroupProblem && (
          <span className="ml-2 font-body font-normal text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            group
          </span>
        )}
      </span>

      <span className="text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
        {problem.difficulty === null ? "Unrated" : DIFFICULTY_LABEL[problem.difficulty]}
      </span>

      <span className="numeric text-ink/70 sm:w-20 sm:text-right" style={{ fontSize: "var(--text-xs)" }}>
        {problem.basePoints} pts
      </span>

      <span className="flex items-center gap-2 sm:w-36" style={{ fontSize: "var(--text-xs)" }}>
        <StatusMark solved={problem.solved} partial={partial} />
        <span className={problem.solved ? "font-semibold" : "text-ink/70"}>{status}</span>
      </span>
    </div>
  );

  if (!problem.unlocked) {
    return (
      // No container opacity. Opacity on a wrapper MULTIPLIES with any alpha inside it, so
      // opacity-60 over text-ink/70 composited to 0.42 and measured 2.84:1 — a locked problem
      // rendered illegible. The state is already carried by the "Locked" badge and the rail,
      // which is what a screen reader gets anyway; dimming it was decoration that cost
      // legibility. Muted-on-paper floor is /60, applied once, never stacked.
      <li className="flex items-stretch rounded border border-ink/15 bg-ink/[0.03]">
        <Rail state="brand" />
        {body}
        <span
          className="numeric self-center rounded bg-ink px-2 py-0.5 pr-2 text-paper"
          style={{ fontSize: "var(--text-xs)" }}
        >
          Locked
        </span>
      </li>
    );
  }

  return (
    <li className="flex items-stretch rounded border border-ink/15 transition-colors hover:border-panther/60">
      <Rail state="brand" />
      <Link
        href={`/contest/${problem.slug}`}
        className="flex flex-1 rounded-r"
        // The whole row is the target; the accessible name carries what the layout implies.
        aria-label={`${problem.slotLabel} — ${problem.title}, ${problem.basePoints} points, ${status}`}
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
      <p className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
        No problems are open yet. The board will fill in when the round starts.
      </p>
    );
  }

  return (
    // Named, so a test — and a screen reader — can address the problem list rather than
    // whichever list happens to be first on a page that also carries standings.
    <ul aria-label="Problems" className="space-y-2">
      {problems.map((problem) => (
        <ProblemCard key={problem.contestProblemId} problem={problem} />
      ))}
    </ul>
  );
}
