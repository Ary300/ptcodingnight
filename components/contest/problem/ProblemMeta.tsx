import { Crumbs, TabStrip } from "@/components/ui";

import type { ProblemDetail } from "@/lib/schemas/api";

/**
 * The furniture HackerRank puts around a problem: a breadcrumb above the title, a status pill
 * beside it, a folder-tab strip under it, and a metadata rail down the right — Difficulty,
 * Max Score, and the limits.
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
 * cheating vector, not a convenience. Its social share row goes for the same reason: a student
 * tweeting the problem mid-round is publishing it. The tab strip is Problem / Submissions and
 * stops there.
 *
 * The strip and the breadcrumb are `components/ui`'s, not this file's. They are shared with the
 * organizer console on purpose — a student and an organizer should recognise the same furniture.
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

/**
 * The pill beside the title — where HackerRank puts its red `locked` badge.
 *
 * It is a WORD in every state, never a colour on its own (DESIGN.md §3): "Locked", "Solved",
 * "Attempted". Solved is the filled one because it is the state a student is looking for when
 * they scan back over a problem they have already been in.
 */
export function ProblemStatusPill({ detail }: { detail: ProblemDetail }) {
  if (!detail.unlocked) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1.5 rounded bg-panther px-2.5 py-1 font-semibold text-paper"
        style={{ fontSize: "var(--text-xs)" }}
      >
        {/* Drawn, not a glyph: a padlock character sits outside the vendored woff2 subsets and
            would tofu on an unknown machine (DESIGN.md §3). */}
        <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true" fill="currentColor">
          <path d="M5 0a3 3 0 0 0-3 3v1H1v8h8V4H8V3a3 3 0 0 0-3-3zm0 1.5A1.5 1.5 0 0 1 6.5 3v1h-3V3A1.5 1.5 0 0 1 5 1.5z" />
        </svg>
        Locked
      </span>
    );
  }

  if (detail.solved) {
    return (
      <span
        className="inline-flex shrink-0 items-center rounded bg-panther px-2.5 py-1 font-semibold text-paper"
        style={{ fontSize: "var(--text-xs)" }}
      >
        Solved{detail.bestScore === null ? "" : ` · ${String(detail.bestScore)} pts`}
      </span>
    );
  }

  if (detail.bestScore !== null) {
    return (
      <span
        className="inline-flex shrink-0 items-center rounded border border-ink/25 px-2.5 py-1 text-ink/80"
        style={{ fontSize: "var(--text-xs)" }}
      >
        Attempted · {detail.bestScore} pts
      </span>
    );
  }

  return null;
}

/** `Problems › B2 › A Very Big Sum`, in the shared breadcrumb. */
export function ProblemBreadcrumb({ slotLabel, title }: { slotLabel: string; title: string }) {
  return (
    <Crumbs
      trail={[{ href: "/contest", label: "Problems" }, { label: slotLabel }, { label: title }]}
    />
  );
}

/**
 * The folder-tab strip. Two tabs, like HackerRank's challenge screen.
 *
 * The second tab is a real destination rather than a client-side panel, because a student who
 * wants their history mid-contest wants the full list, not a truncated preview of it. The
 * standings are one click away in the account menu and in the top bar, so a third tab here would
 * be a third route into the same board.
 *
 * **It is labelled "My submissions", not "Submissions", and the difference is not pedantry.**
 * HackerRank's tab of that name is scoped to the challenge you are reading; ours goes to the
 * whole history across every problem. A tab strip is a promise that the tabs are facets of the
 * one thing named above them, so the short label promised a per-problem view and then quietly
 * navigated the student off the problem. "My submissions" is the exact wording the top bar uses
 * for that same destination, so the label now names where the click lands.
 */
export function ProblemTabs({ slug }: { slug: string }) {
  return (
    <TabStrip
      label="Problem views"
      pathname={`/contest/${slug}`}
      items={[
        { href: `/contest/${slug}`, label: "Problem" },
        { href: "/submissions", label: "My submissions" },
      ]}
    />
  );
}

/**
 * Difficulty, points and the limits, as a description list so it reads as pairs.
 *
 * Borderless with hairline separators, the way HackerRank's rail is: it is an annotation on the
 * statement beside it, and a card would make it compete with the statement for attention. At
 * `lg` and below it stacks under the statement, where a top rule is what keeps it from reading
 * as another paragraph of the problem.
 *
 * ## Why this row is no longer called "Max Score"
 *
 * It was, and it was a lie the screen told against itself. The judge awards the SUM OF PER-TEST
 * POINTS (`aggregateScore`, lib/judge/aggregate.ts), and that raw number is what enters the
 * standings — `basePoints` is consulted only to price a hint (lib/scoring/index.ts). On the demo
 * contest every problem is `basePoints: 100` and the six achievable totals are 140, 140, 150,
 * 160, 130 and 180. So this rail rendered
 *
 *     Max Score   100
 *     Your best   140
 *
 * two rows apart, on a correct solve. A ceiling a student has already passed does not read as a
 * mislabel; it reads as a scoring bug, and the student has no way to tell which it is.
 *
 * `basePoints` is still worth showing — it is the problem's rated weight and it is what a hint
 * costs a percentage of — so the row keeps the number and drops the claim that it is a maximum.
 * The line under the list says where the real figure comes from, because "why did I get 140"
 * otherwise has no answer anywhere in the product.
 *
 * **The honest fix is upstream and is not in this file.** The achievable total is
 * `sum(TestCase.points)`, which `lib/contest/problems.ts` already has in hand and does not put on
 * the wire; `ProblemSummary`/`ProblemDetail` need an `achievablePoints` field before any screen
 * can print the number a student actually wants. Until then, no figure here can be labelled as a
 * maximum without inventing it.
 */
export function ProblemMetaRail({ detail }: { detail: ProblemDetail }) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Difficulty", value: <DifficultyPill difficulty={detail.difficulty} /> },
    { label: "Rated points", value: <span className="numeric">{detail.basePoints}</span> },
    {
      label: "Your best",
      value:
        detail.bestScore === null ? (
          <span className="text-ink/60">—</span>
        ) : (
          <span className="numeric">{detail.bestScore}</span>
        ),
    },
    { label: "Time limit", value: <span className="numeric">{detail.timeLimitMs} ms</span> },
    { label: "Memory", value: <span className="numeric">{detail.memoryLimitMb} MB</span> },
  ].filter((row) => row.value !== null);

  return (
    <aside aria-label="Problem details" className="border-t border-ink/15 pt-4 lg:border-t-0 lg:pt-0">
      <dl className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 border-b border-ink/10 pb-2 last:border-b-0"
          >
            <dt className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
              {row.label}
            </dt>
            <dd style={{ fontSize: "var(--text-xs)" }}>{row.value}</dd>
          </div>
        ))}
      </dl>
      {/*
        The sentence that makes "Rated points 100 / Your best 140" stop looking like a fault.
        Muted floor is /60 applied once, never a wrapper opacity (DESIGN.md §7).
      */}
      <p className="mt-3 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
        Points are awarded per test case, so a full solve can be worth more or less than the rated
        figure. Your score is whatever the tests award.
      </p>
    </aside>
  );
}
