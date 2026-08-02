"use client";

import Link from "next/link";
import { useCallback } from "react";

import { useResource } from "@/components/contest/data/useResource";
import type { AdminContestList, AdminContestSummary } from "@/lib/schemas/api";
import { AdminContestListSchema } from "@/lib/schemas/api";

import { ContestStatePill } from "./StatusPill";

/**
 * The list of contests.
 *
 * ## What it was, and what changed under it
 *
 * It was a per-screen "Which contest?" picker: five contest-scoped organizer screens each rendered
 * their own copy, because each read its contest from `?contest=<id>` and nothing in the nav carried
 * that query string. Every hop between two screens of the SAME contest therefore threw the
 * organizer back to a wall of thirteen rows to re-find a contest they had just been inside.
 *
 * The contest id lives in the PATH now (`/admin/contests/<id>/…`), so a tab cannot drop it. This
 * component keeps two jobs:
 *
 * - `variant="list"` — the top level, HackerRank's "Manage Contests". `/admin` is this and nothing
 *   else.
 * - `variant="picker"` — what the old flat routes (`/admin/teams`, `/admin/side-activities`, …)
 *   show when they are reached with no contest. They stay live so that bookmarks and links from
 *   documentation still land somewhere useful rather than 404ing.
 *
 * ## The lifecycle buttons are gone from the row, on purpose
 *
 * Each row used to carry `Publish` / `Publish and open now` / `End contest`, and publishing was a
 * single unconfirmed click. On a list containing two rows with the same name and the same date —
 * which this list did — that is one slip from showing a room an unfinished problem set. Those
 * controls now live on the contest's own Setup tab, where there is exactly one contest on screen
 * and its name is the page heading. Nothing was removed; it moved somewhere unambiguous.
 *
 * ## Loading through `useResource`
 *
 * Rather than a `useEffect` that calls `setState` — which the React Compiler rules reject, and
 * which cascades a render. `useResource` derives "loading" from a tag on the settled result
 * instead, and gives `reload()` for free, which is what the retry button needs.
 */

export interface ContestPickerProps {
  /**
   * The tab a chosen contest opens on: `""` for the contest itself, or `"/teams"`, `"/problems"`,
   * `"/side-activities"`, `"/console"`, `"/awards"`.
   *
   * A path suffix rather than a full base path, because the contest id is now a path SEGMENT — the
   * whole point of the restructure is that no caller assembles `?contest=` by hand any more.
   */
  readonly tab?: string;
  /** What the organizer is about to do, named in the empty state. */
  readonly purpose: string;
  /** `list` is the top-level Contests screen; `picker` is a flat route asking which contest. */
  readonly variant?: "list" | "picker";
}

async function loadContests(): Promise<AdminContestList> {
  const response = await fetch("/api/admin/contests", { cache: "no-store" });
  const body: unknown = await response.json();

  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: { message?: unknown } }).error.message ?? "")
        : "";
    throw new Error(message === "" ? "Those contests could not be loaded." : message);
  }

  // Parsed, not cast. A route that drifts from the contract fails here rather than rendering
  // `undefined` into the middle of a list an organizer is about to act on.
  return AdminContestListSchema.parse(
    typeof body === "object" && body !== null && "data" in body
      ? (body as { data: unknown }).data
      : body,
  );
}

/**
 * Live first, then soonest-to-matter. The API returns newest-created first, which on the real
 * database put the one RUNNING contest fifth, under four draft experiments — and the running
 * contest is what an organizer opening this list mid-event is looking for. Within a state,
 * newest start date first, then name, so two same-day contests always list in the same order.
 */
const STATE_ORDER: Record<AdminContestSummary["state"], number> = {
  RUNNING: 0,
  FROZEN: 1,
  SCHEDULED: 2,
  DRAFT: 3,
  ENDED: 4,
  ARCHIVED: 5,
};

function byLiveness(a: AdminContestSummary, b: AdminContestSummary): number {
  const rank = STATE_ORDER[a.state] - STATE_ORDER[b.state];
  if (rank !== 0) return rank;
  const start = Date.parse(b.startsAt) - Date.parse(a.startsAt);
  if (start !== 0) return start;
  return a.name.localeCompare(b.name);
}

/**
 * The lifecycle groups, as section heads. Sorting alone was not enough: on a list of 26 rows,
 * 15 of them DRAFT experiments, the one RUNNING contest was first but nothing SAID why the
 * order changed mid-list, and two same-evening contests in different states read as duplicates.
 */
const GROUP_LABEL: Record<AdminContestSummary["state"], string> = {
  RUNNING: "Running",
  FROZEN: "Frozen (live, board stopped)",
  SCHEDULED: "Scheduled",
  DRAFT: "Drafts",
  ENDED: "Ended",
  ARCHIVED: "Archived",
};

/**
 * Start AND end, with times. The list used to print a time-less start date while `endsAt`
 * arrived in the payload and was never rendered — so a RUNNING row gave no "ends" cue, and two
 * contests on the same evening were indistinguishable.
 */
function whenLabel(startsAt: string, endsAt: string): { starts: string; ends: string } {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const time = { hour: "numeric", minute: "2-digit" } as const;
  const sameDay = start.toDateString() === end.toDateString();
  return {
    starts: start.toLocaleString(undefined, { month: "short", day: "numeric", ...time }),
    ends: sameDay
      ? `ends ${end.toLocaleTimeString(undefined, time)}`
      : `ends ${end.toLocaleString(undefined, { month: "short", day: "numeric", ...time })}`,
  };
}

export function ContestPicker({ tab = "", purpose, variant = "picker" }: ContestPickerProps) {
  // Wrapped in an inline arrow because `useResource` requires a stable callback and the lint
  // rule requires the argument to `useCallback` be an inline function expression. Both are
  // satisfied by one line; a bare module-level function reference is not.
  const load = useResource(useCallback(() => loadContests(), []));

  if (load.status === "loading") {
    return (
      <p role="status" className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
        Loading contests…
      </p>
    );
  }

  if (load.status === "error" || load.data === null) {
    return (
      <div className="rounded border border-rule-edge bg-paper p-5">
        <p role="alert" className="text-panther" style={{ fontSize: "var(--text-sm)" }}>
          {load.error ?? "Those contests could not be loaded."}
        </p>
        <button
          type="button"
          onClick={load.reload}
          className="mt-3 rounded border border-rule-edge px-3 py-1.5 font-semibold hover:border-rule-firm"
          style={{ fontSize: "var(--text-xs)" }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (load.data.contests.length === 0) {
    return (
      <div className="rounded border border-rule-edge bg-paper p-5">
        <p style={{ fontSize: "var(--text-sm)" }}>
          There are no contests yet. Make one first: {purpose} needs a contest to act on.
        </p>
        <Link
          href="/admin/contests/new"
          className="mt-3 inline-block rounded bg-panther px-3 py-1.5 font-semibold text-paper hover:bg-panther-deep"
          style={{ fontSize: "var(--text-xs)" }}
        >
          Create contest
        </Link>
      </div>
    );
  }

  const heading = variant === "list" ? "All contests" : "Which contest?";
  const contests = [...load.data.contests].sort(byLiveness);
  const groups = (Object.keys(STATE_ORDER) as AdminContestSummary["state"][])
    .map((state) => ({ state, rows: contests.filter((contest) => contest.state === state) }))
    .filter((group) => group.rows.length > 0);

  return (
    <section
      // The picker variant keeps its old accessible name, because "choose a contest" is what the
      // flat routes still ask and what the a11y suite audits them by.
      aria-label={variant === "list" ? "All contests" : "Choose a contest"}
      className="rounded border border-rule-edge bg-paper"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 border-b border-rule-edge px-5 py-3">
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
          {heading}
          <span className="numeric ml-2 font-normal text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            {contests.length}
          </span>
        </h2>
        {/*
          The flat legacy routes render this picker as their whole body, and had NO way back to
          the admin home — the organizer's reported bug. The link lives here rather than on each
          of those four pages so a fifth legacy route cannot forget it.
        */}
        {variant === "picker" && (
          <Link
            href="/admin"
            className="font-semibold text-panther hover:underline underline-offset-2"
            style={{ fontSize: "var(--text-xs)" }}
          >
            ‹ All contests
          </Link>
        )}
      </div>

      {groups.map((group) => (
        <div key={group.state}>
          <h3
            className="border-b border-rule-hair bg-ink/[0.03] px-5 py-1.5 font-semibold tracking-wide uppercase text-ink/60"
            style={{ fontSize: "var(--text-xs)" }}
          >
            {GROUP_LABEL[group.state]}
            <span className="numeric ml-2 font-normal">{group.rows.length}</span>
          </h3>
          <ul>
            {group.rows.map((contest) => {
              const when = whenLabel(contest.startsAt, contest.endsAt);
              return (
                <li key={contest.contestId} className="border-b border-rule-hair last:border-b-0">
                  {/*
                    `relative` + an absolutely pinned chevron: at 360 the metadata wraps, and a
                    chevron left in the flow landed mid-row after the date. Hover is 6% ink, not
                    3.5%, because 3.5% is byte-identical to the page ground the panel sits on and
                    a hovered row read as a hole.
                  */}
                  <Link
                    href={`/admin/contests/${encodeURIComponent(contest.contestId)}${tab}`}
                    className="relative flex flex-wrap items-center gap-x-4 gap-y-1.5 py-3.5 pl-5 pr-10 hover:bg-ink/[0.06]"
                  >
                    {/*
                      A fixed 7rem pill column from `sm`, so the pills stand in one vertical line
                      instead of trailing each row's name (their left edges used to spread 147px
                      across the list).
                    */}
                    <span className="grid min-w-0 flex-1 basis-72 grid-cols-1 items-center gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_7rem]">
                      <span className="font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
                        {contest.name}
                      </span>
                      <span className="justify-self-start">
                        <ContestStatePill state={contest.state} />
                      </span>
                    </span>

                    {/*
                      The counts, right-aligned and tabular. This is what an organizer reads to
                      tell two contests apart at a glance — "the one with 47 people in it" — and
                      the fixed-width date column beside them keeps their right edges in a column.
                    */}
                    <span
                      className="numeric ml-auto text-ink/70"
                      style={{ fontSize: "var(--text-xs)" }}
                    >
                      {contest.participantCount} in · {contest.teamCount}{" "}
                      {contest.teamCount === 1 ? "team" : "teams"}
                    </span>
                    <span
                      className="numeric w-[7.5rem] text-right text-ink/60"
                      style={{ fontSize: "var(--text-xs)" }}
                    >
                      <span className="block">{when.starts}</span>
                      <span className="block">{when.ends}</span>
                    </span>
                    {/* The whole row is a link; the chevron says so before the hover tint does. */}
                    <span
                      aria-hidden="true"
                      className="absolute top-1/2 right-4 -translate-y-1/2 text-ink/40"
                    >
                      ›
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
