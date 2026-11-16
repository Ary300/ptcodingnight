import Link from "next/link";
import type { ReactNode } from "react";

import { ContestStateActions } from "@/components/admin/ContestStateActions";
import { EndTimeControl } from "@/components/admin/EndTimeControl";
import { FreezeSchedule } from "@/components/admin/FreezeSchedule";
import { GroupUnlock } from "@/components/admin/GroupUnlock";
import { AlertPlate, Panel } from "@/components/admin/Panel";
import { groupUnlockAtFromMinutes, minutesBeforeEndOf } from "@/lib/contest/admin";

import { AssignSetsButton } from "../assign-sets-button";
import { contestSetup, type ContestSetup } from "../contest-setup";
import { EVENT_TIME_ZONE } from "@/lib/contest/event-time";

/**
 * `/admin/contests/{id}/setup` — what is left to do before this contest can run.
 *
 * ## The question this answers
 *
 * A first-time organizer's problem was never "which button is Publish". It was that the only way
 * to find out what a contest still needed was to press Publish and read the refusal —
 * `setContestState` rejects a contest with no problems, with a good sentence, AFTER the click. The
 * facts behind that refusal are three counts and a state, so they are shown before anything is
 * pressed, in the order the night needs them.
 *
 * **The checklist does not re-implement the rule.** `problemCount` is the same count
 * `setContestState` guards on, read from the same table, so the screen and the API cannot drift
 * into disagreeing about whether a contest is publishable.
 *
 * ## Not colour alone
 *
 * Every step states its status in WORDS beside a glyph — "Done", "To do", "Not yet" — and the rows
 * differ in weight as well (DESIGN.md §3). A checklist read as green-versus-red is a checklist that
 * says nothing to a third of a room on a projector.
 */

export default async function ContestSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const setup = await contestSetup(id);

  if (setup === null) {
    // The shell above already carries the plate naming the bad id; repeating it here would be the
    // same sentence twice on one screen.
    return null;
  }

  const steps = stepsFor(setup);
  const remaining = steps.filter((step) => step.state !== "done").length;
  const preparing = setup.state === "DRAFT" || setup.state === "SCHEDULED";
  const live = setup.state === "RUNNING" || setup.state === "FROZEN";
  const checklistTitle = preparing
    ? "Before this contest can run"
    : live
      ? "Live contest check"
      : "Final contest check";
  const checklistDescription =
    setup.state === "DRAFT"
      ? "Complete these steps before publishing the contest."
      : setup.state === "SCHEDULED"
        ? "Published. Students can sign in now and wait in the lobby until the start."
        : live
      ? "The contest is running. Any item below needs an organizer's attention, but it does not stop the live round."
      : "The contest is over. This is the final record of how it was set up.";

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title={checklistTitle}
        aside={
          // Open Sans, not `numeric`: "2 to do" is a phrase, and the mono face is reserved for
          // digit runs that align in a column.
          <span className="text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
            {remaining === 0
              ? "all clear"
              : preparing
                ? `${String(remaining)} to do`
                : `${String(remaining)} ${remaining === 1 ? "issue" : "issues"}`}
          </span>
        }
        description={checklistDescription}
      >
        <ol className="flex flex-col">
          {steps.map((step) => (
            <li
              key={step.title}
              className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-rule-hair py-3.5 last:border-b-0"
            >
              {/*
                `w-auto` below `sm`: a fixed 96px marker plus a shrink-0 action used to crush the
                body column to 65px at 360, one word per line. The marker takes only what it needs
                there and lines up as a column from `sm`.
              */}
              <span
                className={`mt-0.5 w-auto shrink-0 font-semibold sm:w-24 ${MARKER[step.state].tone}`}
                style={{ fontSize: "var(--text-xs)" }}
              >
                <span aria-hidden="true">{MARKER[step.state].glyph} </span>
                {MARKER[step.state].word}
              </span>

              <div className="min-w-0 flex-1">
                {/*
                  The action sits beside the title it acts on, not `ml-auto`-pinned to the card's
                  far edge: at 1440 that put the button up to a metre of screen from its sentence,
                  and the three actions right-ragged against each other.
                */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <h3
                    className={step.state === "todo" ? "font-bold" : "font-semibold"}
                    style={{ fontSize: "var(--text-sm)" }}
                  >
                    {step.title}
                  </h3>
                  {step.action}
                </div>
                <p className="mt-0.5 max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
                  {step.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel
        title="Lifecycle"
        description={
          setup.state === "DRAFT"
            ? "Draft contests are private. Publish when setup is complete, then start and end the contest from here."
            : "Start and end the contest from here."
        }
      >
        {/*
          The two most-used pre-doors actions, FIRST and as buttons. They were 16px underlined
          body-text links under the panel's closing rule, which put them below the fold on a
          1440x900 laptop. Styled to match Button's `secondary` variant so they sit at the same
          42px height as the lifecycle controls below.
        */}
        <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-rule-edge pb-5">
          <Link
            href="/contest"
            className="inline-flex items-center rounded-chip border border-rule-edge bg-paper px-4 py-2 font-semibold text-ink hover:bg-ink/5"
            style={{ fontSize: "var(--text-sm)", lineHeight: "1.5rem" }}
          >
            Open the student view
          </Link>
          <Link
            href={`/projector?contest=${encodeURIComponent(setup.contestId)}`}
            className="inline-flex items-center rounded-chip border border-rule-edge bg-paper px-4 py-2 font-semibold text-ink hover:bg-ink/5"
            style={{ fontSize: "var(--text-sm)", lineHeight: "1.5rem" }}
          >
            Open the projector for this contest
          </Link>
        </div>

        <ContestStateActions contestId={setup.contestId} state={setup.state} />
      </Panel>

      {setup.state === "DRAFT" && setup.problemCount === 0 && (
        <AlertPlate tone="notice" title="Publishing will be refused" live={false}>
          Add at least one ready question on the <strong>Problems</strong> tab before publishing.
        </AlertPlate>
      )}

      <Panel
        title="Window"
        description="When the contest runs, when the team questions open, and when the public board stops updating."
      >
        {/*
          Four facts. Two columns from `sm` and four from `lg`: a three-column grid held a fourth
          fact as a lone orphan row, and four columns at 640px wrap "Aug 1, 8:09 PM EDT" to three
          lines each.
        */}
        <dl
          className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4"
          style={{ fontSize: "var(--text-sm)" }}
        >
          <Fact label="Starts" value={formatWhen(setup.startsAt)} />
          <Fact label="Ends" value={formatWhen(setup.endsAt)} />
          <Fact
            label="Team questions open"
            value={
              setup.groupUnlockMinutes === null
                ? "At the start"
                : formatWhen(groupUnlockAtFromMinutes(setup.startsAt, setup.groupUnlockMinutes))
            }
          />
          <Fact
            label="Board freezes"
            value={setup.freezeAt === null ? "No freeze" : formatWhen(setup.freezeAt)}
          />
        </dl>

        {/*
          The end could only be set by the create form. An early Open now, a judge outage that
          deserves ten more minutes, and an End contest pressed by mistake each needed psql.
        */}
        <div className="mt-5 border-t border-rule-edge pt-5">
          <h3 className="font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
            {setup.state === "ENDED" ? "Reopen the contest" : "Change the end time"}
          </h3>
          <div className="mt-2">
            <EndTimeControl
              contestId={setup.contestId}
              endsAt={setup.endsAt.toISOString()}
              state={setup.state}
            />
          </div>
        </div>

        {/*
          The night opens with an individual stretch. This is the clock that ends it, set in the
          organizer's own unit, minutes after the start, and derived on every read so a contest
          started early opens its team questions early too.
        */}
        <div className="mt-5 border-t border-rule-edge pt-5">
          <h3 className="font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
            Open team questions after the individual stretch
          </h3>
          <div className="mt-2">
            <GroupUnlock
              contestId={setup.contestId}
              startsAt={setup.startsAt.toISOString()}
              minutesAfterStart={setup.groupUnlockMinutes}
              groupProblemCount={setup.groupProblemCount}
              over={setup.state === "ENDED" || setup.state === "ARCHIVED"}
            />
          </div>
        </div>

        {/*
          The freeze was READ-ONLY here and settable only in the create form, as an absolute
          datetime. So a contest that already existed could not be given a freeze at all without
          going into the database, which is the state the organizer found it in.
        */}
        <div className="mt-5 border-t border-rule-edge pt-5">
          <h3 className="font-display font-bold" style={{ fontSize: "var(--text-sm)" }}>
            Freeze the board before the finish
          </h3>
          <div className="mt-2">
            <FreezeSchedule
              contestId={setup.contestId}
              endsAt={setup.endsAt.toISOString()}
              freezeAt={setup.freezeAt === null ? null : setup.freezeAt.toISOString()}
              minutesBeforeEnd={minutesBeforeEndOf(setup.endsAt, setup.freezeAt)}
              frozenNow={setup.state === "FROZEN"}
            />
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
        {label}
      </dt>
      {/* Open Sans, not `numeric`: "Aug 1, 8:09 PM EDT" and "No freeze" are phrases, and the
          mono face is reserved for digit runs that align in a column. */}
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

/**
 * The window, with its ZONE printed.
 *
 * This renders on the server, so `undefined` resolves to the SERVER's locale and zone — not the
 * organizer's. On a box set to UTC that silently shifts a 7pm contest to "Aug 1, 12:00 AM", which
 * is the same class of mistake `ContestBuilder` converts `datetime-local` to avoid on the way in.
 * `timeZoneName` makes the shift visible instead of plausible: an organizer who reads "8:38 PM
 * UTC" knows to do the arithmetic; one who reads "8:38 PM" does not know there is any to do.
 */
function formatWhen(when: Date): string {
  // Pinned to the event's zone. `undefined` resolved to the SERVER's zone, and the production
  // droplet runs UTC, so a 7:00 PM start printed as "Nov 17, 12:00 AM UTC" right above sentences
  // saying 7:00 PM (2026-11-15 organizer sweep).
  return when.toLocaleString("en-US", {
    timeZone: EVENT_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/**
 * Three states, not two.
 *
 * "Not yet" is for a step that cannot be acted on until an earlier one lands — there is nobody to
 * deal problem sets to before anyone has signed in. Rendering that as "To do" in the same red as a
 * real blocker tells the organizer to go and do something that has no button, which is the kind of
 * nagging that teaches people to stop reading a checklist.
 *
 * It still counts toward "N to do", because it genuinely is not finished.
 */
type StepState = "done" | "todo" | "waiting";

const MARKER: Record<StepState, { glyph: string; word: string; tone: string }> = {
  // Never colour alone (DESIGN.md §3): each state is a glyph AND a word, and the row's own weight
  // changes with it.
  done: { glyph: "✓", word: "Done", tone: "text-ink/60" },
  todo: { glyph: "▸", word: "To do", tone: "text-panther" },
  waiting: { glyph: "○", word: "Not yet", tone: "text-ink/60" },
};

interface Step {
  readonly title: string;
  readonly detail: string;
  readonly state: StepState;
  readonly action: ReactNode;
}

/**
 * The steps, in the order they have to happen.
 *
 * Set assignment comes after the roster because it assigns the people on it, and publishing comes
 * last because it is the only step a student can see the result of.
 */
function stepsFor(setup: ContestSetup): readonly Step[] {
  const base = `/admin/contests/${setup.contestId}`;

  return [
    {
      title: "Put problems in it",
      detail:
        setup.problemCount === 0
          ? "Nothing in the line-up yet. Until there is, this contest cannot be published."
          : `${String(setup.problemCount)} ${setup.problemCount === 1 ? "problem" : "problems"} in the line-up.`,
      state: setup.problemCount > 0 ? "done" : "todo",
      action: <TabLink href={`${base}/problems`} label="Problems" />,
    },
    {
      title: "Build the roster",
      detail:
        (setup.teamCount === 0
          ? "No teams yet. Add teams and place every participant on a roster."
          : `${String(setup.teamCount)} ${setup.teamCount === 1 ? "team" : "teams"}, ${String(setup.participantCount)} ${setup.participantCount === 1 ? "participant" : "participants"}${setup.unassignedCount === 0 ? "" : `, ${String(setup.unassignedCount)} still ${setup.unassignedCount === 1 ? "needs" : "need"} a team`}.`) +
        // Only when the contest HAS divisions: in one, a player with no division sees only the
        // division-null problems, which is usually just the group round. A warning, not a
        // blocker — the step's done state stays about teams, which is what publishing needs.
        (setup.divisionCount > 0 && setup.noDivisionCount > 0 && setup.participantCount > 0
          ? ` ${String(setup.noDivisionCount)} ${setup.noDivisionCount === 1 ? "player has" : "players have"} no division, so they can open only the questions every division shares. Set divisions on the Teams tab.`
          : ""),
      state: setup.teamCount > 0 && setup.unassignedCount === 0 ? "done" : "todo",
      action: <TabLink href={`${base}/teams`} label="Teams" />,
    },
    {
      title: "Assign problem sets",
      detail:
        setup.participantCount === 0
          ? setup.setSelection === "RANDOM_ASSIGNED"
            ? "Nobody to assign yet. Build the roster first, then deal the sets."
            : "Nobody to assign yet. Add the roster first, then choose each player's set on the Teams tab."
          : setup.unassignedSetCount === 0
            ? "Every player has a Round 1 set."
            : setup.setSelection === "RANDOM_ASSIGNED"
              ? `${String(setup.unassignedSetCount)} of ${String(setup.participantCount)} have no set. A player with no set can open the group problems and nothing else.`
              : `${String(setup.unassignedSetCount)} of ${String(setup.participantCount)} have no set. Choose them on the Teams tab; a player with no set can open group problems only.`,
      // "Not yet" while nobody has signed in: there is nothing to deal sets to, and no button.
      state:
        setup.participantCount === 0
          ? "waiting"
          : setup.unassignedSetCount === 0
            ? "done"
            : "todo",
      action:
        setup.participantCount > 0 && setup.unassignedSetCount > 0 ? (
          setup.setSelection === "RANDOM_ASSIGNED" ? (
            <AssignSetsButton contestId={setup.contestId} />
          ) : (
            <TabLink href={`${base}/teams`} label="Choose sets" />
          )
        ) : null,
    },
    {
      title: "Publish it",
      detail:
        setup.state === "DRAFT"
          ? "Still a draft, so students cannot see it or submit to it."
          : setup.state === "SCHEDULED"
            ? "Published. Students can see it and will be let in when the window opens."
            : setup.state === "ENDED" || setup.state === "ARCHIVED"
              ? "This contest is over. The Awards tab has the final board and the exports."
              : "Live. Students are submitting now.",
      // "Not yet" while the line-up is empty, because the API will refuse the press.
      state:
        setup.state !== "DRAFT" ? "done" : setup.problemCount === 0 ? "waiting" : "todo",
      action: null,
    },
  ];
}

function TabLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-block rounded-chip border border-rule-edge px-3 py-1.5 font-semibold hover:border-rule-firm"
      style={{ fontSize: "var(--text-xs)" }}
    >
      {label}
    </Link>
  );
}
