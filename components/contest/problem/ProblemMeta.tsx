import Link from "next/link";

import type { ProblemDetail } from "@/lib/schemas/api";

/**
 * The furniture HackerRank puts around a problem: a breadcrumb above the title, a tab strip under
 * it, and a metadata rail down the right — Difficulty, Max Score, and the limits.
 *
 * ## Why this is worth copying rather than inventing
 *
 * Every student in the room has used HackerRank. "Difficulty / Max Score in a box on the right"
 * is not a good design because it is beautiful; it is a good design here because it is the one
 * they already know how to read, and Coding Night is ninety minutes long. Familiarity is the
 * feature.
 *
 * ## What is deliberately NOT copied
 *
 * HackerRank's rail also carries Author, Submitted By, a five-star rating, discussions, an
 * editorial, and "download problem statement". Every one of those is either a thing we do not
 * have or a thing we must not offer mid-contest — an editorial link during a live round is a
 * cheating vector, not a convenience. The tab strip is Problem / Submissions / Leaderboard and
 * stops there.
 */

const DIFFICULTY_LABEL: Record<string, string> = { E: "Easy", M: "Medium", H: "Hard" };

/**
 * Difficulty gets a tint, and the tint is NOT a traffic light.
 *
 * Green/amber/red is the obvious choice and the wrong one here: `--rise` and `--fall` fail the
 * contrast floor on `--paper` (DESIGN.md §2, they are dark-surface only), and red already means
 * "Park Tudor" everywhere else on the page, so a red Hard pill reads as branding rather than as
 * a warning. Weight carries the scale instead — the same ink, more of it.
 */
const DIFFICULTY_TINT: Record<string, string> = {
  E: "border-ink/20 text-ink/70",
  M: "border-ink/35 text-ink/85",
  H: "border-panther/50 text-panther",
};

export function DifficultyPill({ difficulty }: { difficulty: string | null }) {
  if (difficulty === null) return null;
  const label = DIFFICULTY_LABEL[difficulty] ?? difficulty;
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 ${DIFFICULTY_TINT[difficulty] ?? "border-ink/20 text-ink/70"}`}
      style={{ fontSize: "var(--text-xs)" }}
    >
      {label}
    </span>
  );
}

export function ProblemBreadcrumb({ slotLabel, title }: { slotLabel: string; title: string }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-2 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
        <li>
          <Link href="/contest" className="underline underline-offset-2 hover:text-panther">
            Problems
          </Link>
        </li>
        <li aria-hidden="true">&rsaquo;</li>
        <li className="numeric">{slotLabel}</li>
        <li aria-hidden="true">&rsaquo;</li>
        <li aria-current="page" className="text-ink/80">
          {title}
        </li>
      </ol>
    </nav>
  );
}

/**
 * The tab strip. `Problem` is the current page; the other two are real destinations rather than
 * client-side panels, because a student who wants their submission history mid-contest wants the
 * full list, not a truncated preview of it.
 */
export function ProblemTabs() {
  return (
    <nav aria-label="Problem views" className="mt-4 border-b border-ink/15">
      <ul className="flex flex-wrap gap-6">
        <li>
          <span
            aria-current="page"
            className="inline-block border-b-2 border-panther pb-2 font-semibold"
            style={{ fontSize: "var(--text-sm)" }}
          >
            Problem
          </span>
        </li>
        <li>
          <Link
            href="/submissions"
            className="inline-block border-b-2 border-transparent pb-2 text-ink/65 hover:text-ink"
            style={{ fontSize: "var(--text-sm)" }}
          >
            Submissions
          </Link>
        </li>
        <li>
          <Link
            href="/contest"
            className="inline-block border-b-2 border-transparent pb-2 text-ink/65 hover:text-ink"
            style={{ fontSize: "var(--text-sm)" }}
          >
            Leaderboard
          </Link>
        </li>
      </ul>
    </nav>
  );
}

/** Difficulty, Max Score and the limits, as a description list so it reads as pairs. */
export function ProblemMetaRail({ detail }: { detail: ProblemDetail }) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Difficulty", value: <DifficultyPill difficulty={detail.difficulty} /> },
    { label: "Max Score", value: <span className="numeric">{detail.basePoints}</span> },
    { label: "Time limit", value: <span className="numeric">{detail.timeLimitMs} ms</span> },
    { label: "Memory", value: <span className="numeric">{detail.memoryLimitMb} MB</span> },
  ].filter((row) => row.value !== null);

  return (
    <aside aria-label="Problem details" className="rounded border border-ink/15 bg-paper p-4">
      <dl className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4">
            <dt className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
              {row.label}
            </dt>
            <dd style={{ fontSize: "var(--text-xs)" }}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
