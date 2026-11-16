"use client";

import { useCallback } from "react";

import Link from "next/link";

import { Button, Crumbs } from "@/components/ui";

import { contestApi } from "../data/backend";
import { useParticipant } from "../data/participant";
import { useResource } from "../data/useResource";
import { AssignmentNotice } from "./AssignmentNotice";
import { ContestEndedPanel } from "./ContestEndedPanel";
import { PracticeProgressCard } from "./PracticeProgressCard";
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
  /**
   * The server's authoritative read of who is here. The client `useParticipant` hook maps an
   * organizer to "anonymous" because an admin has no participantId, so without this an organizer
   * who follows "View as a student" is falsely told to sign in. Defaulted so existing callers and
   * tests are unaffected.
   */
  readonly viewerKind?: "anonymous" | "competitor" | "admin";
}

export function LobbyView({ phase = null, viewerKind }: LobbyViewProps) {
  const participant = useParticipant();

  const assignmentKey =
    participant.status === "joined" ? participant.scopeKey : participant.status;

  /*
    The practice arena never asks for standings. Its board is a column of other guests, all tied on
    zero, and the arena's card is built from the problem list instead (`PracticeProgressCard`). Not
    fetching it means no other guest's row reaches this lobby at all. The phase is a prop the page
    keys this component on, so it cannot change under a mounted lobby.
  */
  const practiceArena = phase !== null && phase.isPractice;

  const loadProblems = useCallback(() => contestApi.listProblems(), []);
  const loadStandings = useCallback(
    () => (practiceArena ? Promise.resolve(null) : contestApi.getStandings()),
    [practiceArena],
  );

  // Assignment is authorization scope, not only a label. Passing it as an explicit resource key
  // forces both reads to leave their pre-assignment snapshot behind when the session poll changes.
  const problems = useResource(loadProblems, assignmentKey);
  const standings = useResource(loadStandings, assignmentKey);

  // An organizer took the "View as a student" link and has no competitor identity to show. That
  // is not a sign-in failure, so it does not get the sign-in panel; it gets a true sentence and a
  // way back to the console. The server settles this (`viewerKind`), because the client hook reads
  // an admin as anonymous.
  if (viewerKind === "admin") {
    return <OrganizerViewingNotice />;
  }

  if (participant.status === "loading") {
    return (
      <p role="status" className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
        Checking your sign-in…
      </p>
    );
  }

  if (participant.status === "error") {
    return (
      <div role="alert" className="max-w-md rounded-panel border border-panther/35 bg-paper p-4">
        <h1 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
          We could not check your sign-in
        </h1>
        <p className="mt-1 text-ink/75" style={{ fontSize: "var(--text-sm)" }}>
          {participant.message}
        </p>
        <Button className="mt-3" variant="secondary" onClick={() => window.location.reload()}>
          Reload the page
        </Button>
      </div>
    );
  }

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
    `practiceArena` (above) is the permanent practice arena the guest door leads to. It must be
    impossible to mistake its questions for the night's contest, so the heading, the intro and the
    right-hand card all say so, and every "time remaining" or "scored" framing is replaced: the
    arena's window ends in 2100, and a seventy-year countdown reads as a bug.
  */

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
    /*
      "Checking your sign-in…" is replaced by the whole lobby in one client-side swap. The
      rise on the arriving grid makes that swap followable. TRANSFORM ONLY is load-bearing
      here: StandingsCard inside is bg-ink full of text-paper/50-60, and a wrapper opacity
      fade would drag all of it below its contrast floor mid-animation (the measured 4.16:1
      failure).
    */
    <div className="motion-swap-in grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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
        {/* Steps down to --text-lg below `sm` (the pattern ProblemWorkspace set): a flat 40px
            h1 wraps at 360 and spends 120px+ of the first screen before any content. */}
        {/*
          A greeting by name, so the student sees straight away that the code they typed was theirs.
          First name only, from the roster. A practice guest ("Guest 4821") has no name to use.
        */}
        {joined !== null && !practiceArena && (
          <p
            className="mt-2 font-display font-bold text-panther"
            style={{ fontSize: "var(--text-md)" }}
          >
            {greetingFor(joined.displayName, practiceArena)}
          </p>
        )}
        <h1 className="mt-1 font-display font-bold text-[length:var(--text-lg)] sm:text-[length:var(--text-xl)]">
          {practiceArena
            ? "Practice problems"
            : beforeStart && phase !== null
              ? phase.name
              : "Problems"}
        </h1>

        {/*
          The subtitle used to be unconditional, and it was false in two of the three phases: a
          contest that has not started and a contest that has finished both refuse a sample run
          (`resolveTarget` calls `assertCanSubmit` on the run-samples path too). Saying "running
          samples is always free" on those screens is the kind of small lie a student discovers by
          pressing the button.
        */}
        {practiceArena ? (
          <PracticeIntro />
        ) : phase === null || phase.submissionsOpen ? (
          <p className="mt-1 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            You can run the sample tests as often as you like. Only submissions are scored.
          </p>
        ) : (
          <p className="mt-1 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            {beforeStart
              ? "Submissions open when the contest starts."
              : "Submissions are closed."}
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

          Not in the practice arena either. The arena has no teams and no assigned sets, so "an
          organizer will assign your team and problem set" would be a promise about a night that
          has not been scheduled, directly under a panel that just said none of this counts.
        */}
        {joined !== null &&
          problems.status === "ready" &&
          !beforeStart &&
          !afterEnd &&
          !practiceArena && (
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
                className="rounded-panel border border-rule-edge bg-paper p-4 text-ink/75"
                style={{ fontSize: "var(--text-sm)" }}
              >
                {problems.error}{" "}
                {/* Button quiet, not a hand-rolled panther link: reload-after-error is a row
                    action and the product has exactly one grammar for those (ui/Button's
                    docblock). A third underlined-red skin here was inventory defect D11. */}
                <Button variant="quiet" onClick={problems.reload}>
                  Check again
                </Button>
              </p>
            ) : (
              <div role="alert">
                <p className="text-panther" style={{ fontSize: "var(--text-sm)" }}>
                  {problems.error}
                </p>
                {/* The error sentence above carries the red; the action is the shared quiet
                    button, same as every other in-flow retry (D11). */}
                <Button variant="quiet" size="sm" className="mt-1" onClick={problems.reload}>
                  Try again
                </Button>
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
                  {/* Titles are withheld so nobody can look a problem up before the start; the
                      copy states the fact and leaves the policy reasoning here. */}
                  {titlesWithheld
                    ? "Problem titles appear when the contest starts."
                    : "What each is worth is shown beside it."}
                </p>
                <ProblemList problems={visibleProblems} />
              </section>
            ) : (
              <ProblemBrowser
                problems={visibleProblems}
                slotWidth={practiceArena ? "compact" : "wide"}
              />
            ))}
        </div>
      </section>

      <div className="min-w-0">
        {practiceArena && problems.status === "ready" && (
          <PracticeProgressCard problems={visibleProblems} />
        )}
        {!practiceArena && standings.status === "ready" && standings.data !== null && (
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


/**
 * The practice arena's intro, directly under its heading.
 *
 * It replaces a greeting, a "Nothing here is scored" subtitle and a bordered panel that said the
 * same things a second time. What is left is the two facts a guest needs: what the problems are
 * for, and that practice is not how they get in on the night. The heading above already says
 * this is practice, which is the label that keeps the arena from impersonating the contest.
 * Plain paragraphs, not a live region: being in the arena is the ordinary course of the year, and
 * the text does not change while the student reads it.
 */
function PracticeIntro() {
  return (
    <div data-practice-intro className="mt-2">
      <p className="text-balance" style={{ fontSize: "var(--text-sm)" }}>
        Use these unscored problems to try the editor and the judge before Coding Night.
      </p>
      <p className="mt-1 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
        Practice is closed while the contest is running. On the night, sign in with the join code
        on your slip.
      </p>
    </div>
  );
}


/** "Hi Katherine, welcome to Coding Night." Exported for its unit test. */
export function greetingFor(displayName: string, practice: boolean): string {
  const place = practice ? "the practice problems" : "Coding Night";
  if (/^Guest \d+$/.test(displayName.trim())) return `Welcome to ${place}.`;
  const first = displayName.trim().split(/\s+/)[0] ?? "";
  return first === "" ? `Welcome to ${place}.` : `Hi ${first}, welcome to ${place}.`;
}

/**
 * What an organizer sees on /contest.
 *
 * They arrive here from the "View as a student" item in the organizer menu, so the honest message
 * is that this is the student view and they are not a competitor in it, plus the way back. Not an
 * error, not a sign-in prompt.
 */
function OrganizerViewingNotice() {
  return (
    <div role="status" className="max-w-md">
      <h1 className="font-display font-bold" style={{ fontSize: "var(--text-lg)" }}>
        This is the student view
      </h1>
      <p className="mt-2 text-ink/75" style={{ fontSize: "var(--text-sm)" }}>
        Organizer accounts do not have a team or problem set. Use a student account to test the
        participant flow, or return to the console to manage the contest.
      </p>
      <Link
        href="/admin"
        className="mt-4 inline-block rounded-chip bg-panther px-4 py-2 font-semibold text-paper transition-[background-color,transform] duration-[var(--motion-press)] hover:bg-panther-deep active:scale-[0.97]"
        style={{ fontSize: "var(--text-sm)" }}
      >
        Back to the organizer console
      </Link>
    </div>
  );
}
