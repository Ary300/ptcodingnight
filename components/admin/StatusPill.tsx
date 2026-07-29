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
      className={`inline-flex items-center rounded px-2 py-0.5 font-semibold whitespace-nowrap ${
        emphatic ? "border border-panther text-panther" : "border border-ink/25 opacity-80"
      }`}
      style={{ fontSize: "var(--text-xs)" }}
      title={copy.hint}
    >
      {copy.label}
      <span className="sr-only">. {copy.hint}</span>
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
      <span className="numeric opacity-60" style={{ fontSize: "var(--text-xs)" }}>
        judging
      </span>
    );
  }

  const strong = verdict === "IE";
  const solid = verdict === "AC";

  return (
    <span
      className={`numeric inline-flex items-center rounded px-2 py-0.5 font-semibold whitespace-nowrap ${
        strong
          ? "bg-panther text-paper"
          : solid
            ? "border border-ink/40"
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
