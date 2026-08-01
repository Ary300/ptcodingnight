"use client";

import Link from "next/link";
import { useCallback } from "react";

import { useResource } from "@/components/contest/data/useResource";
import type { AdminContestList } from "@/lib/schemas/api";
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
          There are no contests yet. Make one first — {purpose} needs a contest to act on.
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

  return (
    <section
      // The picker variant keeps its old accessible name, because "choose a contest" is what the
      // flat routes still ask and what the a11y suite audits them by.
      aria-label={variant === "list" ? "All contests" : "Choose a contest"}
      className="rounded border border-rule-edge bg-paper"
    >
      <h2
        className="border-b border-rule-edge px-5 py-3 font-display font-bold"
        style={{ fontSize: "var(--text-md)" }}
      >
        {heading}
      </h2>

      <ul>
        {load.data.contests.map((contest) => (
          <li key={contest.contestId} className="border-b border-rule-hair last:border-b-0">
            <Link
              href={`/admin/contests/${encodeURIComponent(contest.contestId)}${tab}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3.5 hover:bg-ink/[0.035]"
            >
              <span className="font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
                {contest.name}
              </span>
              <ContestStatePill state={contest.state} />

              {/*
                The counts, right-aligned and tabular. This is what an organizer reads to tell two
                contests apart at a glance — "the one with 47 people in it" — and `numeric` keeps
                the digits in a column so the list can be scanned rather than read.
              */}
              <span
                className="numeric ml-auto text-ink/70"
                style={{ fontSize: "var(--text-xs)" }}
              >
                {contest.participantCount} in · {contest.teamCount}{" "}
                {contest.teamCount === 1 ? "team" : "teams"}
              </span>
              <span className="numeric text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
                {new Date(contest.startsAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
