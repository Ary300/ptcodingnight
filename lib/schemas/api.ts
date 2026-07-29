import { z } from "zod";

import { LanguageSchema, VerdictSchema } from "@/lib/schemas/judge";

/**
 * The HTTP contract. Frozen before Phase 4b fan-out so the API and the three frontend
 * scopes cannot drift apart.
 *
 * The important idea here is structural: **the wire types make a hidden-test-data leak
 * impossible to express**, rather than merely forbidding one. `PublicTestResultSchema` has
 * no field that could carry expected output. An agent cannot accidentally serialise it,
 * because there is nowhere to put it. Discipline fails under deadline; a missing field does
 * not.
 *
 * Spec: docs/PRD.md §9. Route handlers stay thin — validate, delegate, respond.
 */

// ---------------------------------------------------------------------------
// Envelope (rules/common/patterns.md)
// ---------------------------------------------------------------------------

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export function ok<T>(data: T): { success: true; data: T; error: null } {
  return { success: true, data, error: null };
}

export function fail(error: ApiError): { success: false; data: null; error: ApiError } {
  return { success: false, data: null, error };
}

// ---------------------------------------------------------------------------
// Join
// ---------------------------------------------------------------------------

export const JoinRequestSchema = z.object({
  joinCode: z.string().trim().min(1, "Enter the join code").max(64),
  /** Fallback path when Google Workspace is unavailable on the night (PRD §4). */
  displayName: z.string().trim().min(1, "Enter a display name").max(40),
  divisionId: z.string().min(1).nullable().default(null),
});
export type JoinRequest = z.infer<typeof JoinRequestSchema>;

export const JoinResponseSchema = z.object({
  participantId: z.string(),
  contestId: z.string(),
  displayName: z.string(),
  divisionId: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Problems
// ---------------------------------------------------------------------------

/** A sample case. Samples are published by definition, so full I/O is fine here. */
export const SampleCaseSchema = z.object({
  ordinal: z.number().int().nonnegative(),
  input: z.string(),
  expectedOutput: z.string(),
});

export const ProblemSummarySchema = z.object({
  contestProblemId: z.string(),
  slug: z.string(),
  title: z.string(),
  slotLabel: z.string(),
  difficulty: z.enum(["E", "M", "H"]).nullable(),
  basePoints: z.number().int(),
  isGroupProblem: z.boolean(),
  /** This participant's standing on it: null until they submit. */
  bestScore: z.number().int().nonnegative().nullable(),
  solved: z.boolean(),
  unlocked: z.boolean(),
});
export type ProblemSummary = z.infer<typeof ProblemSummarySchema>;

export const ProblemDetailSchema = ProblemSummarySchema.extend({
  statementMd: z.string(),
  inputSpec: z.string(),
  outputSpec: z.string(),
  constraints: z.string(),
  timeLimitMs: z.number().int().positive(),
  memoryLimitMb: z.number().int().positive(),
  allowedLanguages: z.array(LanguageSchema),
  samples: z.array(SampleCaseSchema),
  hintsTaken: z.number().int().nonnegative(),
  hintCost: z.number().int().nonnegative(),
});
export type ProblemDetail = z.infer<typeof ProblemDetailSchema>;

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

export const SubmitRequestSchema = z.object({
  contestProblemId: z.string().min(1),
  language: LanguageSchema,
  sourceCode: z.string().min(1, "Write some code first").max(200_000, "Source is too large"),
});
export type SubmitRequest = z.infer<typeof SubmitRequestSchema>;

/**
 * A per-test result as a NON-ADMIN client is allowed to see it.
 *
 * There is deliberately no `expectedOutput`, no `actualOutput`, no `input`, and no length
 * or hash of any of them. For a hidden case, `diffSnippet` is always null — see
 * `lib/judge/diff.ts`, which is the only place a snippet is built.
 *
 * If you find yourself wanting to add a field here to improve the student experience, that
 * is the moment to stop: students will diff their way to the test data (PRD §7.2).
 */
export const PublicTestResultSchema = z.object({
  ordinal: z.number().int().nonnegative(),
  isSample: z.boolean(),
  verdict: VerdictSchema,
  runtimeMs: z.number().int().nonnegative().nullable(),
  /** Non-null only for sample cases, capped at 200 characters. */
  diffSnippet: z.string().max(200).nullable(),
});
export type PublicTestResult = z.infer<typeof PublicTestResultSchema>;

export const SubmissionViewSchema = z.object({
  submissionId: z.string(),
  contestProblemId: z.string(),
  language: LanguageSchema,
  submittedAt: z.string(),
  /** Null while queued or judging. */
  verdict: VerdictSchema.nullable(),
  score: z.number().int().nonnegative(),
  runtimeMs: z.number().int().nonnegative().nullable(),
  testResults: z.array(PublicTestResultSchema),
  /** Compiler stderr, verbatim, only when the verdict is CE. */
  compileError: z.string().nullable(),
});
export type SubmissionView = z.infer<typeof SubmissionViewSchema>;

/** "Run samples" is free and unjudged — it never creates a Submission (PRD §9.1). */
export const RunSamplesRequestSchema = SubmitRequestSchema;
export const RunSamplesResponseSchema = z.object({
  results: z.array(PublicTestResultSchema),
});

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export const StandingRowSchema = z.object({
  rank: z.number().int().positive(),
  isTied: z.boolean(),
  participantId: z.string(),
  displayName: z.string(),
  score: z.number().int(),
  penaltyMinutes: z.number().int(),
  /** Rank movement since the previous published board. Drives the rail and the glyph. */
  delta: z.number().int(),
});
export type StandingRow = z.infer<typeof StandingRowSchema>;

export const StandingsResponseSchema = z.object({
  contestId: z.string(),
  /** True while the public board is frozen. Admin responses are never frozen. */
  frozen: z.boolean(),
  /** The instant these standings reflect — `freezeAt` when frozen, otherwise now. */
  asOf: z.string(),
  endsAt: z.string(),
  divisions: z.array(
    z.object({
      divisionId: z.string(),
      name: z.string(),
      rows: z.array(StandingRowSchema),
    }),
  ),
});
export type StandingsResponse = z.infer<typeof StandingsResponseSchema>;

// ---------------------------------------------------------------------------
// Hints
// ---------------------------------------------------------------------------

export const HintRequestSchema = z.object({
  contestProblemId: z.string().min(1),
});

export const HintBalanceSchema = z.object({
  warmupsSolved: z.number().int().nonnegative(),
  hintsEarned: z.number().int().nonnegative(),
  hintsSpent: z.number().int().nonnegative(),
  hintsAvailable: z.number().int().nonnegative(),
  /** What the NEXT hint on this problem costs, shown before the student commits. */
  nextHintCost: z.number().int().nonnegative(),
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const OverrideVerdictRequestSchema = z.object({
  submissionId: z.string().min(1),
  verdict: VerdictSchema,
  score: z.number().int().nonnegative(),
  /** Required. Every override is audit-logged with a reason (PRD §9.2). */
  reason: z.string().trim().min(1, "A reason is required for an override").max(500),
});

export const FreezeRequestSchema = z.object({
  frozen: z.boolean(),
});

// ---------------------------------------------------------------------------
// SSE
// ---------------------------------------------------------------------------

/**
 * Server-sent event names. Polling is the documented fallback (PRD §10), so every event
 * here must also be derivable from a plain GET — no state may exist only in the stream.
 */
export const SSE_EVENTS = {
  verdict: "verdict",
  standings: "standings",
  contestState: "contest-state",
} as const;

export const VerdictEventSchema = z.object({
  submissionId: z.string(),
  verdict: VerdictSchema.nullable(),
  score: z.number().int().nonnegative(),
  testResults: z.array(PublicTestResultSchema),
});
