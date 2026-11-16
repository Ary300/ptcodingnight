import Link from "next/link";

import type { ProblemSummary } from "@/lib/schemas/api";

import { practiceProgress, type DifficultyKey } from "./practice-progress";

/**
 * The practice arena's right-hand card: the guest's own progress, where the contest lobby shows
 * standings.
 *
 * A board of a dozen rows all named "Guest", all tied, all on zero, told a guest nothing and
 * showed them other people they cannot meet. This card answers the questions a student practising
 * on their own actually has: how far through am I, what is it worth, and what should I open next.
 *
 * It keeps the standings card's surface (`bg-ink`, paper text) so the lobby's layout and grammar
 * are unchanged; only the content differs. Muted text is `text-paper/60`, the same alpha the
 * standings card uses on the same ground. Numerals are `.numeric`, the site's mono.
 */

const DIFFICULTY_LABEL: Readonly<Record<DifficultyKey, string>> = {
  E: "Easy",
  M: "Medium",
  H: "Hard",
};

export interface PracticeProgressCardProps {
  readonly problems: readonly ProblemSummary[];
}

export function PracticeProgressCard({ problems }: PracticeProgressCardProps) {
  const progress = practiceProgress(problems);

  return (
    <section aria-labelledby="practice-progress-heading" className="rounded-panel bg-ink p-4 text-paper">
      <h2 id="practice-progress-heading" className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
        Your practice
      </h2>

      <dl className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <dt className="text-paper/60" style={{ fontSize: "var(--text-xs)" }}>
            Solved
          </dt>
          <dd className="mt-1" data-practice-solved>
            <span className="numeric font-semibold" style={{ fontSize: "var(--text-lg)" }}>
              {progress.solved}
            </span>{" "}
            <span className="numeric text-paper/60" style={{ fontSize: "var(--text-sm)" }}>
              of {progress.total}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-paper/60" style={{ fontSize: "var(--text-xs)" }}>
            Points
          </dt>
          <dd className="mt-1" data-practice-points>
            <span className="numeric font-semibold" style={{ fontSize: "var(--text-lg)" }}>
              {progress.points}
            </span>{" "}
            <span className="numeric text-paper/60" style={{ fontSize: "var(--text-sm)" }}>
              of {progress.possiblePoints}
            </span>
          </dd>
        </div>
      </dl>

      {/*
        One row per difficulty. The bar is decoration: the "1 of 4" beside it carries the fact in
        words for every reader, so the bar is hidden from assistive technology rather than given a
        progressbar role that would announce the same number twice.
      */}
      <ul aria-label="Solved by difficulty" className="mt-4 space-y-2 border-t border-rule-hair-inverse pt-4">
        {progress.byDifficulty
          .filter((entry) => entry.total > 0)
          .map((entry) => (
            <li
              key={entry.difficulty}
              data-practice-difficulty={entry.difficulty}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3"
              style={{ fontSize: "var(--text-sm)" }}
            >
              <span>{DIFFICULTY_LABEL[entry.difficulty]}</span>
              <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-paper/15">
                <span
                  className="block h-full rounded-full bg-paper"
                  style={{ width: `${String(Math.round((entry.solved / entry.total) * 100))}%` }}
                />
              </span>
              <span className="numeric">
                {entry.solved} of {entry.total}
              </span>
            </li>
          ))}
      </ul>

      <div className="mt-4 border-t border-rule-hair-inverse pt-4">
        {progress.next === null ? (
          <p style={{ fontSize: "var(--text-sm)" }}>
            {progress.total === 0
              ? "There are no practice problems yet."
              : "You have solved every practice problem."}
          </p>
        ) : (
          <>
            <p className="text-paper/60" style={{ fontSize: "var(--text-xs)" }}>
              Next problem
            </p>
            <Link
              href={`/contest/${progress.next.slug}`}
              data-practice-next
              className="mt-1 inline-flex items-baseline gap-2 underline decoration-paper/50 underline-offset-4 transition-colors duration-[var(--motion-press)] hover:decoration-paper focus-visible:outline-paper"
              style={{ fontSize: "var(--text-sm)" }}
            >
              <span className="numeric">{progress.next.slotLabel}</span>
              <span className="font-display font-bold">{progress.next.title}</span>
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
