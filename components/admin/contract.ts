import { z } from "zod";

import type { JudgeHealthView } from "@/lib/schemas/api";
import type { SeedPastStatus, SeedType } from "@/lib/schemas/seed";

/**
 * Admin-side view models.
 *
 * `lib/schemas/api.ts` is the frozen HTTP contract and is orchestrator-owned; it covers the
 * competitor surface, standings, and the two admin mutations that already exist
 * (`OverrideVerdictRequestSchema`, `FreezeRequestSchema`). It does **not** yet describe
 * contest creation, problem authoring, test-case upload, the reference-solution runner,
 * rejudge, or judge health.
 *
 * Everything in this file that is not re-exported from `lib/schemas/` is therefore the
 * admin UI's *proposed* shape for those gaps, kept in one place so it is trivial to delete
 * once the real schemas land.
 *
 * The submission feed and judge health are no longer among the gaps — `AdminConsoleViewSchema`
 * describes both, `GET /api/admin/contests/{id}/console` serves them, and the two types below are
 * re-exports rather than proposals.
 */

// ---------------------------------------------------------------------------
// Problem bank
// ---------------------------------------------------------------------------

/**
 * PRD §8: a problem stays in DRAFT until it has an original statement and own-generated
 * test data. A DRAFT problem cannot be added to a live contest — enforced in the API, and
 * surfaced here so the refusal is never a surprise.
 */
export const PROBLEM_STATES = ["DRAFT", "READY", "ARCHIVED"] as const;
export type ProblemState = (typeof PROBLEM_STATES)[number];

export interface AdminProblemSummary {
  readonly problemId: string;
  readonly slug: string;
  readonly title: string;
  readonly state: ProblemState;
  readonly type: SeedType;
  /** Imported history flag from `data/problems_seed.csv`. The reason the picker exists. */
  readonly pastStatus: SeedPastStatus;
  readonly difficulty: "E" | "M" | "H" | null;
  readonly division: "Intermediate" | "Advanced" | null;
  readonly notes: string | null;
  readonly hasOriginalStatement: boolean;
  readonly testCaseCount: number;
  readonly sampleCaseCount: number;
  /** null = the reference solution has never been run against its own tests. */
  readonly referencePasses: boolean | null;
}

/** Why a problem may not be added to a live contest. Empty array = it may. */
export function draftBlockers(problem: AdminProblemSummary): readonly string[] {
  const blockers: string[] = [];
  if (problem.state === "DRAFT") blockers.push("Problem is in DRAFT");
  if (problem.state === "ARCHIVED") blockers.push("Problem is archived");
  if (!problem.hasOriginalStatement) blockers.push("No original statement written");
  if (problem.testCaseCount === 0) blockers.push("No test cases");
  if (problem.referencePasses !== true) {
    blockers.push("Reference solution has not passed its own tests");
  }
  return blockers;
}

// ---------------------------------------------------------------------------
// Contest builder
// ---------------------------------------------------------------------------

export const SCORING_PRESETS = [
  {
    id: "classic",
    name: "Coding Night Classic",
    summary: "Partial credit, 5-minute penalty, hints cost 15% of base points.",
  },
  {
    id: "icpc",
    name: "ICPC",
    summary: "Binary accepted / not, 20-minute penalty, rank by solves then penalty.",
  },
] as const;

export type ScoringPresetId = (typeof SCORING_PRESETS)[number]["id"];

export const DivisionDraftSchema = z.object({
  key: z.string().min(1),
  name: z.string().trim().min(1, "Division needs a name").max(40),
});
export type DivisionDraft = z.infer<typeof DivisionDraftSchema>;

/**
 * `datetime-local` values, i.e. "2026-11-14T18:00" in the organiser's own timezone. They
 * are converted to instants at the API edge, not here — a component is the wrong place to
 * decide what "6pm" means.
 */
const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time");

export const ContestDraftSchema = z
  .object({
    name: z.string().trim().min(1, "Give the contest a name").max(120),
    startsAtLocal: localDateTime,
    endsAtLocal: localDateTime,
    /** Optional: no freeze means the board never stops updating (PRD §6.3). */
    freezeAtLocal: z.union([localDateTime, z.literal("")]),
    joinCode: z
      .string()
      .trim()
      .min(4, "Join codes are at least 4 characters")
      .max(24)
      .regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and hyphens only"),
    scoringPresetId: z.enum(["classic", "icpc"]),
    divisions: z.array(DivisionDraftSchema).min(1, "At least one division"),
  })
  .refine((c) => c.endsAtLocal > c.startsAtLocal, {
    message: "The contest must end after it starts",
    path: ["endsAtLocal"],
  })
  .refine(
    (c) => c.freezeAtLocal === "" || (c.freezeAtLocal > c.startsAtLocal && c.freezeAtLocal <= c.endsAtLocal),
    { message: "Freeze must fall inside the contest window", path: ["freezeAtLocal"] },
  )
  .refine(
    (c) => new Set(c.divisions.map((d) => d.name.trim().toLowerCase())).size === c.divisions.length,
    { message: "Division names must be distinct", path: ["divisions"] },
  );

export type ContestDraft = z.infer<typeof ContestDraftSchema>;

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

export interface TestCaseDraft {
  readonly id: string;
  readonly ordinal: number;
  readonly input: string;
  readonly expectedOutput: string;
  readonly isSample: boolean;
  readonly points: number;
  readonly group: string | null;
}

// ---------------------------------------------------------------------------
// Reference-solution runner
// ---------------------------------------------------------------------------

/**
 * PRD §9.2: the runner "fails loudly if the reference solution does not pass its own tests".
 * That loud failure is the requirement — shipping test data whose own reference disagrees
 * with it is the single most common way a contest breaks at 7pm.
 */
export interface ReferenceCaseOutcome {
  readonly ordinal: number;
  readonly isSample: boolean;
  readonly passed: boolean;
  readonly runtimeMs: number | null;
  /** Admin-only. Organisers author this data, so a full diff here is not a leak. */
  readonly detail: string | null;
}

export interface ReferenceRunReport {
  readonly startedAt: string;
  readonly language: "PYTHON_312" | "JAVA_21";
  readonly cases: readonly ReferenceCaseOutcome[];
  /** Compiler stderr when the reference itself failed to build. */
  readonly compileError: string | null;
}

export function referenceRunFailures(
  report: ReferenceRunReport,
): readonly ReferenceCaseOutcome[] {
  return report.cases.filter((c) => !c.passed);
}

// ---------------------------------------------------------------------------
// Live console
// ---------------------------------------------------------------------------

/**
 * Re-exported from the wire contract rather than declared here.
 *
 * These two shapes used to be hand-written in this file, and they drifted exactly as you would
 * expect: `AdminSubmissionRow.language` said `"PYTHON_312" | "JAVA_21"` while the judge runs ten
 * variants, and `JudgeHealth` carried a `lastHeartbeatAgoMs` nothing ever measured. A UI type
 * that describes the server's response is the server's type — a second copy is a place for a
 * screen to be confidently wrong about what it was sent.
 */
export type { AdminSubmissionRow } from "@/lib/schemas/api";
export type { JudgeHealthView as JudgeHealth } from "@/lib/schemas/api";

export type JudgeHealthLevel = "ok" | "watch" | "down";

/** One place decides what "the judge is unhealthy" means, so the console cannot disagree with itself. */
export function judgeHealthLevel(health: JudgeHealthView): JudgeHealthLevel {
  // Redis unreachable outranks everything: with no queue to ask, every other number below is
  // zero, and a screen reading "0 queued, 0 failed" is the picture of a healthy contest.
  if (!health.reachable) return "down";
  if (health.workersOnline === 0) return "down";
  if (health.failed > 0) return "watch";
  if (health.oldestWaitingMs !== null && health.oldestWaitingMs > 60_000) return "watch";
  if (health.queueDepth > 25) return "watch";
  return "ok";
}

