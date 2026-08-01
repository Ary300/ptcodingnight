import Link from "next/link";
import type { ReactNode } from "react";

import { ContestStateActions } from "@/components/admin/ContestStateActions";
import { AlertPlate, Panel } from "@/components/admin/Panel";

import { AssignSetsButton } from "../assign-sets-button";
import { contestSetup, type ContestSetup } from "../contest-setup";

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

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="Before this contest can run"
        aside={
          <span className="numeric text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
            {remaining === 0 ? "nothing left" : `${String(remaining)} to do`}
          </span>
        }
        description="Everything a student needs to see a problem and have it scored. The API refuses to publish a contest with an empty line-up; this is the same fact, shown before you press anything."
      >
        <ol className="flex flex-col">
          {steps.map((step) => (
            <li
              key={step.title}
              className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-rule-hair py-3.5 last:border-b-0"
            >
              <span
                className={`mt-0.5 w-24 shrink-0 font-semibold ${MARKER[step.state].tone}`}
                style={{ fontSize: "var(--text-xs)" }}
              >
                <span aria-hidden="true">{MARKER[step.state].glyph} </span>
                {MARKER[step.state].word}
              </span>

              <div className="min-w-0 flex-1">
                <h3
                  className={step.state === "todo" ? "font-bold" : "font-semibold"}
                  style={{ fontSize: "var(--text-sm)" }}
                >
                  {step.title}
                </h3>
                <p className="mt-0.5 max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
                  {step.detail}
                </p>
              </div>

              {step.action !== null && <div className="shrink-0">{step.action}</div>}
            </li>
          ))}
        </ol>
      </Panel>

      <Panel
        title="Lifecycle"
        description="A contest is born DRAFT and students cannot see it. Publishing is a separate, deliberate act, and ending one, with a room still submitting, cannot be undone."
      >
        <ContestStateActions contestId={setup.contestId} state={setup.state} />

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-rule-edge pt-4">
          <Link
            href="/contest"
            className="underline underline-offset-4 hover:text-panther"
            style={{ fontSize: "var(--text-sm)" }}
          >
            Open the student view
          </Link>
          <Link
            href={`/projector?contest=${encodeURIComponent(setup.contestId)}`}
            className="underline underline-offset-4 hover:text-panther"
            style={{ fontSize: "var(--text-sm)" }}
          >
            Open the projector for this contest
          </Link>
        </div>
      </Panel>

      {setup.state === "DRAFT" && setup.problemCount === 0 && (
        <AlertPlate tone="notice" title="Publishing will be refused" live={false}>
          A published contest with an empty line-up is the failure that looks most like a working
          one: students sign in, see nothing, and conclude the platform is broken. Add the line-up
          on the <strong>Problems</strong> tab first.
        </AlertPlate>
      )}

      <Panel
        title="Window"
        description="When students are let in, when they are locked out, and when the public board stops updating."
      >
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-3" style={{ fontSize: "var(--text-sm)" }}>
          <Fact label="Starts" value={formatWhen(setup.startsAt)} />
          <Fact label="Ends" value={formatWhen(setup.endsAt)} />
          <Fact
            label="Board freezes"
            value={setup.freezeAt === null ? "No freeze" : formatWhen(setup.freezeAt)}
          />
        </dl>
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
      <dd className="numeric mt-0.5">{value}</dd>
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
  return when.toLocaleString(undefined, {
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
  waiting: { glyph: "·", word: "Not yet", tone: "text-ink/60" },
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
          : `${String(setup.problemCount)} ${setup.problemCount === 1 ? "problem" : "problems"} in the line-up, each with a slot, its points and its set.`,
      state: setup.problemCount > 0 ? "done" : "todo",
      action: <TabLink href={`${base}/problems`} label="Problems" />,
    },
    {
      title: "Build the roster",
      detail:
        setup.teamCount === 0
          ? "No teams yet. A team score is a mean over its roster, so a contest with no teams has no board."
          : `${String(setup.teamCount)} ${setup.teamCount === 1 ? "team" : "teams"}, ${String(setup.participantCount)} signed in${setup.unassignedCount === 0 ? "" : `, ${String(setup.unassignedCount)} on no team (their points are in nobody's pool)`}.`,
      state: setup.teamCount > 0 && setup.unassignedCount === 0 ? "done" : "todo",
      action: <TabLink href={`${base}/teams`} label="Teams" />,
    },
    {
      title: "Assign problem sets",
      detail:
        setup.participantCount === 0
          ? "Nobody to assign yet. Sets are dealt from a stored seed once the roster exists, so a disputed assignment can be re-derived rather than argued about."
          : setup.unassignedSetCount === 0
            ? "Every player has a Round 1 set."
            : `${String(setup.unassignedSetCount)} of ${String(setup.participantCount)} have no set. A player with no set can open the group problems and nothing else.`,
      // "Not yet" while nobody has signed in: there is nothing to deal sets to, and no button.
      state:
        setup.participantCount === 0
          ? "waiting"
          : setup.unassignedSetCount === 0
            ? "done"
            : "todo",
      action:
        setup.participantCount > 0 && setup.unassignedSetCount > 0 ? (
          <AssignSetsButton contestId={setup.contestId} />
        ) : null,
    },
    {
      title: "Publish it",
      detail:
        setup.state === "DRAFT"
          ? "Still a DRAFT. Students cannot see it, cannot open a problem, and cannot submit."
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
      className="inline-block rounded border border-rule-edge px-3 py-1.5 font-semibold hover:border-rule-firm"
      style={{ fontSize: "var(--text-xs)" }}
    >
      {label}
    </Link>
  );
}
