import Link from "next/link";

import { Rail } from "@/components/ui";

/**
 * What the lobby says about the student's team and their problem set.
 *
 * ## The state this exists for
 *
 * A student who has signed in but is not yet on a team sees almost nothing: a problem SET is
 * assigned when an organizer puts them on a team, so until that happens the only rows they can
 * open are the group problems. That is correct behaviour and it looked exactly like a broken
 * page — a nearly empty list with no explanation and nothing to click. A student in that state
 * reasonably concludes the site is down, and the fix they reach for is reloading it, which
 * changes nothing.
 *
 * So the state is named. Three facts, in the order a student needs them:
 *
 *  1. you are not on a team yet,
 *  2. an organizer will add you — there is nothing for you to do,
 *  3. the problems you can see meanwhile are the group ones.
 *
 * ## Why the assigned set is named at all
 *
 * Sets are assigned, never chosen, and never previewed (PRD §6.2). Naming the set is therefore the
 * *only* feedback a student gets about it, and without it "why does my neighbour have different
 * problems" has no answer on any screen.
 *
 * ## Why every sentence here is derived from the list, never assumed
 *
 * This panel used to state, unconditionally, that "the only problems you can open are the N group
 * problems below" — while all six rows underneath it rendered as ordinary links, and the API
 * accepted a submission to every one of them. The premise was wrong in a way no test could see,
 * because the notice was never told anything about the list it was describing.
 *
 * The server decides. `listProblems` filters the contest's problems through `canReadSet`
 * (lib/contest/set-assignment.ts) before it returns them, and `canReadSet` returns true for every
 * set when the contest has `allowReadingUnassignedSets` — which `scripts/seed-demo.ts` sets on
 * purpose. **So a row that reached this screen is a row the student may open and submit to**,
 * always: scope is enforced by omission from the payload, not by the row being inert. The same
 * filter guards the submit route, so there is no second policy for this notice to get wrong.
 *
 * That makes `visibleProblemCount` and `groupProblemCount` the only two numbers this component
 * needs, and it makes the restrictive wording conditional on the one thing that actually implies
 * it: the list containing nothing but group problems.
 *
 * ## Colour is not the channel
 *
 * The panther rail and the red heading are the third channel, never the first (DESIGN.md §3):
 * every state here says what it is in words, and the notice reads identically with the colour
 * removed. Nothing is dimmed with a wrapper `opacity` — muted text is `text-ink/60` applied once,
 * which is the measured floor in DESIGN.md §7.
 */

export interface AssignmentNoticeProps {
  /** From the session: the participant has no team, so no set has been assigned. */
  readonly needsTeam: boolean;
  /** The label of the assigned set, when there is one. */
  readonly setLabel: string | null;
  /** How many of the visible problems are group problems — the ones everybody can open. */
  readonly groupProblemCount: number;
  /**
   * How many rows the list is actually showing. Every one of them is openable and submittable —
   * see the note above. Without this the notice cannot tell "you may only open the group
   * problems" from "you may open all of these", and it guessed wrong.
   */
  readonly visibleProblemCount: number;
}

/** `2 group problems`, `1 group problem`. Kept out of the JSX so the branches stay readable. */
function groupPhrase(count: number): string {
  return count === 1 ? "group problem" : `${String(count)} group problems`;
}

/**
 * `swapKey` names which of the three states the panel is showing. The background session poll
 * swaps the whole sentence set in place when a team or set assignment lands, on a screen that
 * says "This page updates automatically" — so the content div is keyed on the state and rises
 * in over --motion-swap when it changes, instead of the words silently being different. The
 * section and its rail stay mounted; only the words move, transform-only, ink on paper.
 */
function Panel({ swapKey, children }: { swapKey: string; children: React.ReactNode }) {
  return (
    <section
      aria-label="Your assignment"
      className="flex items-stretch overflow-hidden rounded-panel border border-rule-edge bg-paper"
    >
      <Rail state="brand" />
      <div key={swapKey} className="motion-swap-in flex-1 px-4 py-3">
        {children}
      </div>
    </section>
  );
}

export function AssignmentNotice({
  needsTeam,
  setLabel,
  groupProblemCount,
  visibleProblemCount,
}: AssignmentNoticeProps) {
  // True only when the list contains nothing but group problems. Anything else on screen is a
  // problem the server chose to send this student, which means they may open and submit to it.
  const groupOnly = visibleProblemCount === groupProblemCount;

  if (needsTeam) {
    return (
      <Panel swapKey="needs-team">
        {/*
          A heading, not a live region. `role` on an `h2` REPLACES the heading role, which would
          take the one line that explains the whole screen out of the heading outline — and there
          is nothing urgent here for a live region to announce anyway: an organizer is going to
          add them, and the fact does not change while they read it.
        */}
        <h2 className="font-display font-bold text-panther" style={{ fontSize: "var(--text-sm)" }}>
          You are not on a team yet
        </h2>
        <p className="mt-1" style={{ fontSize: "var(--text-sm)" }}>
          An organizer will assign your team and problem set. Until then, {" "}
          {visibleProblemCount === 0
            ? "there is nothing for you to open yet."
            : groupOnly
              ? `the only problems you can open are the ${groupPhrase(groupProblemCount)} below, which everyone can open.`
              : `you can open and submit to every problem listed below: all ${String(visibleProblemCount)} of them, not just the ${groupPhrase(groupProblemCount)}.`}
        </p>
        <p className="mt-1 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          This page updates automatically. Points you earn now will move with you to your team.{" "}
          <Link href="/team" className="text-panther underline underline-offset-2">
            More about team scoring
          </Link>
        </p>
      </Panel>
    );
  }

  if (setLabel === null) {
    return (
      <Panel swapKey="no-set">
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
          No problem set assigned yet
        </h2>
        <p className="mt-1" style={{ fontSize: "var(--text-sm)" }}>
          You are on a team, but an organizer has not assigned your set.{" "}
          {groupOnly
            ? "The group problems below are open to everyone in the meantime."
            : "Everything listed below is open to you in the meantime, and you can submit to any of it."}
        </p>
        <p className="mt-1 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          This page checks for the assignment automatically.
        </p>
      </Panel>
    );
  }

  return (
    <Panel swapKey={`set-${setLabel}`}>
      <h2 className="font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
        Your problem set is{" "}
        <span className="numeric text-panther">{setLabel}</span>
      </h2>
      {/*
        This used to end with "the rows marked group are open to every competitor", which a
        student read as "and the rest of these rows are not mine". Both halves of that were
        wrong on a contest with `allowReadingUnassignedSets`: the other sets' rows were listed,
        openable, and accepted submissions. Say what is actually true of the list on screen.
      */}
      <p className="mt-1 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
        An organizer assigned it, and it is fixed for the round.{" "}
        {groupOnly
          ? "Your set and the rows marked group are what you see below."
          : "Every problem listed below is open to you and yours to score on."}
      </p>
    </Panel>
  );
}
