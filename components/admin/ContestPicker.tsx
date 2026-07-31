"use client";

import Link from "next/link";
import { useCallback } from "react";

import { useResource } from "@/components/contest/data/useResource";
import type { AdminContestList } from "@/lib/schemas/api";
import { AdminContestListSchema } from "@/lib/schemas/api";

import { ContestStatePill } from "./StatusPill";
import { ContestStateActions } from "./ContestStateActions";

/**
 * Pick the contest a contest-scoped organizer screen acts on.
 *
 * ## The bug this replaces
 *
 * `/admin/teams` and `/admin/side-activities` read their contest from `?contest=`, and with no way
 * to enumerate contests the screens said: *"Add `?contest=<id>` to this URL."* The id was only
 * obtainable from `psql`. Clicking "Teams" in the organizer nav therefore led nowhere — and the
 * roster is a scoring input, since team size is the divisor in every team score.
 *
 * ## Why it still does not auto-select
 *
 * With exactly one contest it would be easy to redirect straight into it. It does not, and the
 * reason is the same reason the query string exists: "the current contest" is hidden state. An
 * organizer who lands on a roster without having chosen the contest cannot tell, from the roster,
 * WHICH contest they are about to move somebody in — and moving somebody changes two team scores.
 * One extra click on a night that happens once a year is the cheap side of that trade.
 *
 * What it does instead is make the one-contest case a single obvious target rather than a wall.
 *
 * ## Loading through `useResource`
 *
 * Rather than a `useEffect` that calls `setState` — which the React Compiler rules reject, and
 * which cascades a render. `useResource` derives "loading" from a tag on the settled result
 * instead, and gives `reload()` for free, which is what the retry button needs.
 */

export interface ContestPickerProps {
  /** Where a chosen contest goes, e.g. `/admin/teams`. `?contest=` is appended. */
  readonly basePath: string;
  /** What the organizer is about to do, named in the heading. */
  readonly purpose: string;
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

export function ContestPicker({ basePath, purpose }: ContestPickerProps) {
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
      <div className="rounded border border-ink/15 bg-paper p-5">
        <p role="alert" className="text-panther" style={{ fontSize: "var(--text-sm)" }}>
          {load.error ?? "Those contests could not be loaded."}
        </p>
        <button
          type="button"
          onClick={load.reload}
          className="mt-3 rounded border border-ink/25 px-3 py-1.5 font-semibold hover:border-ink/50"
          style={{ fontSize: "var(--text-xs)" }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (load.data.contests.length === 0) {
    return (
      <div className="rounded border border-ink/15 bg-paper p-5">
        <p style={{ fontSize: "var(--text-sm)" }}>
          There are no contests yet. Build one first — {purpose} needs a contest to act on.
        </p>
        <Link
          href="/admin/contest"
          className="mt-3 inline-block rounded bg-panther px-3 py-1.5 font-semibold text-paper hover:bg-panther-deep"
          style={{ fontSize: "var(--text-xs)" }}
        >
          Contest builder
        </Link>
      </div>
    );
  }

  return (
    <section aria-label="Choose a contest" className="rounded border border-ink/12 bg-paper">
      <h2
        className="border-b border-ink/12 px-5 py-3 font-display font-bold"
        style={{ fontSize: "var(--text-md)" }}
      >
        Which contest?
      </h2>

      <ul>
        {load.data.contests.map((contest) => (
          <li key={contest.contestId} className="border-b border-ink/10 last:border-b-0">
            <Link
              href={`${basePath}?contest=${encodeURIComponent(contest.contestId)}`}
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

            {/*
              The lifecycle controls live on the row, OUTSIDE the link.

              `POST /api/admin/contests/{id}/state` existed and nothing in the UI called it, so a
              contest could be created and never started — and three separate strings promised the
              step ("students cannot see it until you publish it", "Publish the contest when the
              line-up is settled"). Every contest a student could actually enter had been written
              by a seed script.

              Nested inside the `<Link>` they would be a button inside a link, which is invalid
              and unpredictable to operate with a keyboard.
            */}
            <div className="border-t border-ink/10 px-5 py-2.5">
              <ContestStateActions
                contestId={contest.contestId}
                state={contest.state}
                onChanged={load.reload}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
