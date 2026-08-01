"use client";

import { useCallback } from "react";

import { Crumbs } from "@/components/ui";

import { contestApi } from "../data/backend";
import { useParticipant } from "../data/participant";
import { useResource } from "../data/useResource";
import { AssignmentNotice } from "./AssignmentNotice";
import { ContestEndedPanel } from "./ContestEndedPanel";
import { PreStartPanel } from "./PreStartPanel";
import { ProblemBrowser } from "./ProblemBrowser";
import { ProblemList } from "./ProblemList";
import { SignInRequired } from "./SignInRequired";
import { StandingsCard } from "./StandingsCard";
import type { ContestPhase } from "./phase";

/**
 * The lobby a student lands in: the problem list, and a glance at where they stand.
 *
 * An un-joined visitor gets a link, not a redirect. A `router.replace` here races the
 * `sessionStorage` read that decides whether they are joined at all, and the failure mode is
 * a student bounced back to the join screen mid-contest for no visible reason.
 *
 * The breadcrumb is HackerRank's, and it earns its line: the dark bar says which tab you are on
 * but not which contest you are in, and a student on a phone has no other place to read that.
 *
 * ## Three lobbies, one screen
 *
 * A contest is in one of three phases and this screen used to draw only the middle one.
 *
 *  - **before** — the reported bug. A bare red line, "This contest has not started yet", a "Try
 *    again" link, and nothing else, next to a standings panel rendering the student's own name.
 *    That is a dead end wearing an error costume: nothing had gone wrong, there was nothing to try
 *    again, and the screen named neither the contest nor the time it opened. It is now a real
 *    lobby: the contest's name, a countdown, the student's team and set, and the problems listed
 *    as locked. See `PreStartPanel`.
 *  - **live** — unchanged.
 *  - **after** — equally bare, and worse in one respect: the live lobby rendered verbatim, so a
 *    finished contest still promised free sample runs and submittable problems. See
 *    `ContestEndedPanel`.
 *
 * The phase arrives as a prop from a server component, because no competitor-reachable API carries
 * the contest's name or its `startsAt` — see `app/(competitor)/contest/contest-phase.ts`. It is
 * optional so that a caller with nothing to say (a test, or a screen that renders this component
 * without the loader) still gets the live lobby, exactly as before.
 */

export interface LobbyViewProps {
  /** Where the contest is in its own night. Null for an anonymous or organizer viewer. */
  readonly phase?: ContestPhase | null;
}

export function LobbyView({ phase = null }: LobbyViewProps) {
  const participant = useParticipant();

  const loadProblems = useCallback(() => contestApi.listProblems(), []);
  const loadStandings = useCallback(() => contestApi.getStandings(), []);

  const problems = useResource(loadProblems);
  const standings = useResource(loadStandings);

  // The wording, the button and the tone now come from one place — see `SignInRequired`, which is
  // this block extracted so that /team and /submissions stop inventing their own.
  if (participant.status === "anonymous") {
    return <SignInRequired level={1} what="tonight's problems" />;
  }

  const joined = participant.status === "joined" ? participant.participant : null;
  // Both counts come off the SAME list the student is looking at. The notice's wording depends on
  // whether the list is group-only, and a count taken from anywhere else could disagree with the
  // rows underneath it — which is exactly the bug it used to have.
  const visibleProblems = problems.data ?? [];
  const groupProblemCount = visibleProblems.filter((problem) => problem.isGroupProblem).length;

  const beforeStart = phase !== null && phase.phase === "before";
  const afterEnd = phase !== null && phase.phase === "after";

  /*
    The server withholds the titles until the start (`listProblems` in lib/contest/problems.ts:
    our bank's titles are public problem titles, so an early one can simply be looked up). It sends
    an empty slug with them, which is the only signal on the wire that a row is redacted.

    Read off the rows rather than inferred from the phase, for the same reason `AssignmentNotice`
    counts its own list: a panel that describes data it was never shown is a panel that eventually
    describes it wrongly.
  */
  const titlesWithheld = visibleProblems.some((problem) => problem.slug === "");

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="min-w-0">
        <Crumbs
          trail={[
            { href: "/contest", label: "Coding Night" },
            { label: beforeStart ? "Lobby" : "Problems" },
          ]}
        />

        {/*
          Before the start the contest's own name is the heading, because "Problems" is not what
          this screen is yet and the student has nowhere else to read what they signed in to.
        */}
        <h1 className="mt-1 font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
          {beforeStart && phase !== null ? phase.name : "Problems"}
        </h1>

        {/*
          The subtitle used to be unconditional, and it was false in two of the three phases: a
          contest that has not started and a contest that has finished both refuse a sample run
          (`resolveTarget` calls `assertCanSubmit` on the run-samples path too). Saying "running
          samples is always free" on those screens is the kind of small lie a student discovers by
          pressing the button.
        */}
        {phase === null || phase.submissionsOpen ? (
          <p className="mt-1 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            Running samples is always free. Only submissions are scored.
          </p>
        ) : (
          <p className="mt-1 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            {beforeStart
              ? "The judge is not accepting anything yet. Everything below opens at the start."
              : "The judge is closed. Nothing you do now is scored."}
          </p>
        )}

        {beforeStart && phase !== null && (
          <div className="mt-4">
            <PreStartPanel phase={phase} />
          </div>
        )}

        {afterEnd && phase !== null && (
          <div className="mt-4">
            <ContestEndedPanel phase={phase} />
          </div>
        )}

        {/*
          Above the list, not below it. Whether you are on a team decides what the list can
          contain, so a student reading top to bottom has the explanation before the thing it
          explains — which is the difference between "the site is broken" and "I am waiting for an
          organizer". Held until the problems have loaded, so the group count it quotes is real
          rather than zero-for-one-frame.

          Only while the contest is live. Every phrasing in it is about what you may open and
          submit to, which is untrue before the start and untrue after the end — and after the end
          it was the loudest wrong thing on the screen, promising "they are all yours to score on"
          under a heading that could not say the night was over. `PreStartPanel` and
          `ContestEndedPanel` carry the team and the set in those two phases instead.
        */}
        {joined !== null && problems.status === "ready" && !beforeStart && !afterEnd && (
          <div className="mt-4">
            <AssignmentNotice
              needsTeam={joined.needsTeam}
              setLabel={joined.chosenSetLabel}
              groupProblemCount={groupProblemCount}
              visibleProblemCount={visibleProblems.length}
            />
          </div>
        )}

        <div className="mt-4">
          {problems.status === "loading" && (
            <p role="status" className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
              Loading problems…
            </p>
          )}
          {problems.status === "error" &&
            (beforeStart ? (
              /*
                Before the start, a failed list is not an alarm.

                The commonest way to reach it is a contest an organizer has not published yet, and
                the server says so in words. Painting that sentence in `--panther` under a
                `role="alert"` with a "Try again" link is how the original bug looked, one level
                down: nothing has gone wrong, there is nothing to retry, and the red says otherwise.
                A status line and a plainly-labelled button say the same thing without the costume.
              */
              <p
                role="status"
                className="rounded border border-ink/15 bg-paper p-4 text-ink/75"
                style={{ fontSize: "var(--text-sm)" }}
              >
                {problems.error}{" "}
                <button
                  type="button"
                  onClick={problems.reload}
                  className="text-panther underline underline-offset-2"
                >
                  Check again
                </button>
              </p>
            ) : (
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
            ))}
          {problems.status === "ready" &&
            (beforeStart ? (
              /*
                The locked line-up, with a heading and without the filter rail.

                Listing the problems as locked rather than hiding them is the point: a count and a
                shape are not secret, and an empty screen is indistinguishable from a broken one.
                The rail goes, though — filtering four rows by "solved / unsolved" before anybody
                has solved anything is furniture, and it is the widest thing on the page at 360px.
              */
              <section aria-label="Tonight's problems">
                <h2 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
                  Tonight&apos;s problems
                </h2>
                <p className="mt-1 mb-2 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
                  {visibleProblems.length === 1
                    ? "1 problem, locked until the start."
                    : `${String(visibleProblems.length)} problems, locked until the start.`}{" "}
                  {titlesWithheld
                    ? "The titles stay hidden until then, so nobody can look a problem up early. The slot and what it is worth are not secret."
                    : "What each is worth is shown beside it."}
                </p>
                <ProblemList problems={visibleProblems} />
              </section>
            ) : (
              <ProblemBrowser problems={visibleProblems} />
            ))}
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
