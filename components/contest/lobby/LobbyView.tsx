"use client";

import Link from "next/link";
import { useCallback } from "react";

import { contestApi } from "../data/backend";
import { useParticipant } from "../data/participant";
import { useResource } from "../data/useResource";
import { ProblemList } from "./ProblemList";
import { StandingsCard } from "./StandingsCard";

/**
 * The lobby a student lands in after joining: the problem list, and a glance at where they
 * stand.
 *
 * An un-joined visitor gets a link, not a redirect. A `router.replace` here races the
 * `sessionStorage` read that decides whether they are joined at all, and the failure mode is
 * a student bounced back to the join screen mid-contest for no visible reason.
 */

export function LobbyView() {
  const participant = useParticipant();

  const loadProblems = useCallback(() => contestApi.listProblems(), []);
  const loadStandings = useCallback(() => contestApi.getStandings(), []);

  const problems = useResource(loadProblems);
  const standings = useResource(loadStandings);

  if (participant.status === "anonymous") {
    return (
      <div className="max-w-md">
        <h1 className="font-display font-bold" style={{ fontSize: "var(--text-lg)" }}>
          You are not in the contest yet
        </h1>
        <p className="mt-2 text-ink/75" style={{ fontSize: "var(--text-sm)" }}>
          Enter the join code from the board at the front of the room.
        </p>
        <Link
          href="/join"
          className="mt-4 inline-block rounded bg-panther px-4 py-2 font-semibold text-paper hover:bg-panther-deep"
          style={{ fontSize: "var(--text-sm)" }}
        >
          Join the contest
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="min-w-0">
        <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
          Problems
        </h1>
        <p className="mt-1 text-ink/65" style={{ fontSize: "var(--text-xs)" }}>
          Running samples is always free. Only submissions are scored.
        </p>

        <div className="mt-5">
          {problems.status === "loading" && (
            <p role="status" className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
              Loading problems…
            </p>
          )}
          {problems.status === "error" && (
            <div role="alert">
              <p className="text-panther" style={{ fontSize: "var(--text-sm)" }}>
                {problems.error}
              </p>
              <button
                type="button"
                onClick={problems.reload}
                className="mt-2 text-panther underline underline-offset-2"
                style={{ fontSize: "var(--text-xs)" }}
              >
                Try again
              </button>
            </div>
          )}
          {problems.status === "ready" && <ProblemList problems={problems.data} />}
        </div>
      </section>

      <div className="min-w-0">
        {standings.status === "ready" && (
          <StandingsCard
            standings={standings.data}
            participantId={
              participant.status === "joined" ? participant.participant.participantId : null
            }
          />
        )}
      </div>
    </div>
  );
}
