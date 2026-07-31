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
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-label="Your assignment"
      className="flex items-stretch overflow-hidden rounded border border-ink/15 bg-paper"
    >
      <Rail state="brand" />
      <div className="flex-1 px-4 py-3">{children}</div>
    </section>
  );
}

export function AssignmentNotice({
  needsTeam,
  setLabel,
  groupProblemCount,
}: AssignmentNoticeProps) {
  if (needsTeam) {
    return (
      <Panel>
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
          An organizer will put you on a team — there is nothing for you to do. Your problem set is
          assigned along with your team, so until then{" "}
          {groupProblemCount === 0
            ? "you will not see any problems of your own."
            : `the only problems you can open are the ${
                groupProblemCount === 1 ? "group problem" : `${String(groupProblemCount)} group problems`
              } below, which everyone can open.`}
        </p>
        <p className="mt-1 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          Points you score before you are added still count — they join your team&apos;s total the
          moment you are on it.{" "}
          <Link href="/team" className="text-panther underline underline-offset-2">
            More about team scoring
          </Link>
        </p>
      </Panel>
    );
  }

  if (setLabel === null) {
    return (
      <Panel>
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
          No problem set assigned yet
        </h2>
        <p className="mt-1" style={{ fontSize: "var(--text-sm)" }}>
          You are on a team, but an organizer has not assigned your set. The group problems below
          are open to everyone in the meantime.
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <h2 className="font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
        Your problem set is{" "}
        <span className="numeric text-panther">{setLabel}</span>
      </h2>
      <p className="mt-1 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
        Sets are assigned by an organizer, never chosen, so this is fixed for the round. The rows
        marked <span className="text-ink">group</span> are open to every competitor.
      </p>
    </Panel>
  );
}
