import type { Verdict } from "@/lib/schemas/judge";

import type { ProblemState } from "@/components/admin/contract";

/**
 * Small state markers for the admin surface.
 *
 * Everything here is on `--paper`, so the palette is limited to `--ink` and `--panther`
 * (5.08 AA). Verdicts are additionally distinguished by their letter code, never by colour
 * alone — the same rule the leaderboard follows for rank movement (DESIGN.md §3), and the
 * reason a colour-blind organiser can still read this feed.
 */

const STATE_COPY: Record<ProblemState, { label: string; hint: string }> = {
  DRAFT: {
    label: "DRAFT",
    hint: "Cannot be added to a live contest until it has an original statement and its own test data.",
  },
  READY: { label: "READY", hint: "Cleared for use in a live contest." },
  ARCHIVED: { label: "ARCHIVED", hint: "Retired from the bank." },
};

export function ProblemStatePill({ state }: { state: ProblemState }) {
  const copy = STATE_COPY[state];
  const emphatic = state === "DRAFT";

  return (
    <span
      className={`inline-flex items-center rounded-chip px-2 py-0.5 font-semibold whitespace-nowrap ${
        emphatic ? "border border-panther text-panther" : "border border-rule-edge text-ink/75"
      }`}
      style={{ fontSize: "var(--text-xs)" }}
      title={copy.hint}
    >
      {copy.label}
      <span className="sr-only">. {copy.hint}</span>
    </span>
  );
}

/**
 * A contest's lifecycle state, for lists where several contests sit next to each other.
 *
 * `RUNNING` and `FROZEN` are the emphatic ones, and for opposite reasons: one means students are
 * submitting right now, the other means the public board has stopped moving while the admin views
 * have not. Both are states where an organizer editing a roster is editing a live score, so they
 * are the two an organizer must not mistake for a contest that has finished.
 *
 * The state's own word carries the meaning — the border is a second channel, never the only one.
 */
/**
 * Typed against the same six literals the API schema and `contest-setup.ts` spell out, so a
 * renamed lifecycle state fails to compile here instead of rendering a pill with no hint.
 */
type ContestState = "DRAFT" | "SCHEDULED" | "RUNNING" | "FROZEN" | "ENDED" | "ARCHIVED";

const CONTEST_STATE_HINT: Record<ContestState, string> = {
  DRAFT: "Not published. Students cannot see it.",
  SCHEDULED: "Published, not started.",
  RUNNING: "Live. Students are submitting now.",
  FROZEN: "Live, and the public board has stopped updating.",
  ENDED: "Over. Standings are final.",
  ARCHIVED: "Retired.",
};

export function ContestStatePill({ state }: { state: ContestState }) {
  const emphatic = state === "RUNNING" || state === "FROZEN";
  const hint = CONTEST_STATE_HINT[state];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-chip px-2 py-0.5 font-semibold whitespace-nowrap ${
        emphatic ? "border border-panther text-panther" : "border border-rule-edge text-ink/75"
      }`}
      style={{ fontSize: "var(--text-xs)" }}
      title={hint}
    >
      {/*
        The dot is what HackerRank puts on a live contest, and it is the one glance-speed cue in
        a list where every other row is bordered grey. Decoration only: the word RUNNING is the
        signal, per the never-colour-alone rule.
      */}
      {state === "RUNNING" && (
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-panther" />
      )}
      {state}
      <span className="sr-only">. {hint}</span>
    </span>
  );
}

const VERDICT_NAME: Record<Verdict, string> = {
  AC: "Accepted",
  WA: "Wrong answer",
  TLE: "Time limit exceeded",
  MLE: "Memory limit exceeded",
  RE: "Runtime error",
  CE: "Compile error",
  // PRD §7.2: never a student-facing failure. In the admin console it is the loudest thing
  // on the row, because it means we do not know whether the submission was correct.
  IE: "Internal error - requeue once, then alert",
};

export function VerdictPill({ verdict }: { verdict: Verdict | null }) {
  if (verdict === null) {
    return (
      <span className="numeric text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
        judging
      </span>
    );
  }

  const strong = verdict === "IE";
  const solid = verdict === "AC";

  return (
    <span
      className={`numeric inline-flex items-center rounded-chip px-2 py-0.5 font-semibold whitespace-nowrap ${
        strong
          ? "bg-panther text-paper"
          : solid
            ? "border border-rule-firm"
            : "border border-panther/50 text-panther"
      }`}
      style={{ fontSize: "var(--text-xs)" }}
    >
      {verdict}
      <span className="sr-only">. {VERDICT_NAME[verdict]}</span>
    </span>
  );
}

export function verdictName(verdict: Verdict): string {
  return VERDICT_NAME[verdict];
}
