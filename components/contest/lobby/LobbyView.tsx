"use client";

import Link from "next/link";
import { useCallback } from "react";

import { Crumbs } from "@/components/ui";

import { contestApi } from "../data/backend";
import { useParticipant } from "../data/participant";
import { useResource } from "../data/useResource";
import { AssignmentNotice } from "./AssignmentNotice";
import { ProblemBrowser } from "./ProblemBrowser";
import { StandingsCard } from "./StandingsCard";

/**
 * The lobby a student lands in after joining: the problem list, and a glance at where they
 * stand.
 *
 * An un-joined visitor gets a link, not a redirect. A `router.replace` here races the
 * `sessionStorage` read that decides whether they are joined at all, and the failure mode is
 * a student bounced back to the join screen mid-contest for no visible reason.
 *
 * The breadcrumb is HackerRank's, and it earns its line: the dark bar says which tab you are on
 * but not which contest you are in, and a student on a phone has no other place to read that.
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
          Sign in with your school Google or GitHub account. The first sign-in creates your
          account, and an organizer puts you on a team.
        </p>
        <Link
          href="/sign-in"
          className="mt-4 inline-block rounded bg-panther px-4 py-2 font-semibold text-paper hover:bg-panther-deep"
          style={{ fontSize: "var(--text-sm)" }}
        >
          Sign in to compete
        </Link>
      </div>
    );
  }

  const joined = participant.status === "joined" ? participant.participant : null;
  const groupProblemCount = (problems.data ?? []).filter(
    (problem) => problem.isGroupProblem,
  ).length;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="min-w-0">
        <Crumbs trail={[{ href: "/contest", label: "Coding Night" }, { label: "Problems" }]} />

        <h1 className="mt-1 font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
          Problems
        </h1>
        <p className="mt-1 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          Running samples is always free. Only submissions are scored.
        </p>

        {/*
          Above the list, not below it. Whether you are on a team decides what the list can
          contain, so a student reading top to bottom has the explanation before the thing it
          explains — which is the difference between "the site is broken" and "I am waiting for an
          organizer". Held until the problems have loaded, so the group count it quotes is real
          rather than zero-for-one-frame.
        */}
        {joined !== null && problems.status === "ready" && (
          <div className="mt-4">
            <AssignmentNotice
              needsTeam={joined.needsTeam}
              setLabel={joined.chosenSetLabel}
              groupProblemCount={groupProblemCount}
            />
          </div>
        )}

        <div className="mt-4">
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
          {problems.status === "ready" && <ProblemBrowser problems={problems.data} />}
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
