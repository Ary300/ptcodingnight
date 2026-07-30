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
// Routes — the canonical URL set, and part of the contract
// ---------------------------------------------------------------------------

/**
 * Every path the API serves and every path a client may call.
 *
 * This exists because freezing the request and response *shapes* was not enough. During
 * Phase 4b the four agents agreed on every payload and still disagreed on nine of twelve
 * URLs: the frontend called `/api/problems` and `/api/standings`, the API served
 * `/api/contests/[id]/problems` and `/api/contests/[id]/standings`. Typechecking cannot
 * catch that — both sides compile perfectly and the app 404s at runtime. G7 caught it.
 *
 * Contest-scoped rather than flat, deliberately. `Contest` is a first-class entity with
 * history (PRD §5); flat paths would need an implicit "current contest", which is hidden
 * state that breaks the moment two contests exist or an organizer opens last year's board.
 *
 * Both sides import from here. Adding a route means adding a line here first.
 */
export const API_ROUTES = {
  // --- competitor ---
  /**
   * Flat, not contest-scoped, and that is not an inconsistency.
   *
   * A student arrives holding a join CODE off the board at the front of the room, not a
   * contest id — and `Contest.joinCode` is `@unique` in the schema precisely so the code is
   * the lookup key. A contest-scoped join route would require an id obtainable only by
   * joining. Every route below is scoped because by then the client knows which contest it
   * is in; this one is how it finds out.
   */
  join: "/api/join",
  problems: (contestId: string) => `/api/contests/${encodeURIComponent(contestId)}/problems`,
  problem: (contestId: string, slug: string) =>
    `/api/contests/${encodeURIComponent(contestId)}/problems/${encodeURIComponent(slug)}`,
  standings: (contestId: string) => `/api/contests/${encodeURIComponent(contestId)}/standings`,
  /**
   * The projector's board. Un-scoped on purpose, and the only read route that is.
   *
   * The screen on the wall has no login and nobody types an id into it: an organizer opens it
   * and the room expects the contest that is running now. `?contestId=` pins a specific one,
   * which is what the awards screen links to for a finished board.
   */
  publicStandings: (contestId?: string) =>
    contestId === undefined
      ? "/api/standings"
      : `/api/standings?contestId=${encodeURIComponent(contestId)}`,
  /** Contest-level SSE. One stream carries verdicts, standings and contest state. */
  stream: (contestId: string) => `/api/contests/${encodeURIComponent(contestId)}/stream`,

  runSamples: "/api/run-samples",
  submissions: "/api/submissions",
  submission: (id: string) => `/api/submissions/${encodeURIComponent(id)}`,

  // --- admin ---
  adminSession: "/api/admin/session",
  adminFreeze: (contestId: string) =>
    `/api/admin/contests/${encodeURIComponent(contestId)}/freeze`,
  adminExport: (contestId: string) =>
    `/api/admin/contests/${encodeURIComponent(contestId)}/export`,
  adminOverride: (submissionId: string) =>
    `/api/admin/submissions/${encodeURIComponent(submissionId)}/override`,
} as const;

/**
 * Routes the contract defines but NO handler implements yet. Listed so the gap is explicit
 * rather than discovered as a 404.
 *
 * Hints depend on `docs/TODO.md` T1: the PRD prices hints precisely but never says what a
 * hint contains, so there is nothing for a hint route to return. Until that is resolved the
 * hint UI must degrade rather than call a path that cannot exist.
 */
export const UNIMPLEMENTED_ROUTES = ["hints"] as const;

// ---------------------------------------------------------------------------
// Envelope (rules/common/patterns.md)
// ---------------------------------------------------------------------------

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * The response envelope as a discriminated union, so `if (res.success)` narrows `data` to
 * non-null and `error` to null on one branch and the reverse on the other.
 *
 * Exported as a type and a schema factory rather than left for each caller to reconstruct:
 * a hand-rolled version of this narrows badly, and the resulting `'data' is possibly null`
 * errors get "fixed" with a non-null assertion, which is how a null response body becomes a
 * runtime crash during a contest.
 */
export type ApiResponse<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: ApiError };

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data, error: null };
}

export function fail(error: ApiError): ApiResponse<never> {
  return { success: false, data: null, error };
}

/** Zod schema for the envelope around a given payload. Use for parsing responses client-side. */
export function apiResponseSchema<T extends z.ZodTypeAny>(data: T) {
  return z.discriminatedUnion("success", [
    z.object({ success: z.literal(true), data, error: z.null() }),
    z.object({ success: z.literal(false), data: z.null(), error: ApiErrorSchema }),
  ]);
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
  /**
   * The Round 1 set this player was assigned, if assignment has already run.
   *
   * Null before assignment. The student is TOLD their set here rather than choosing one — sets are
   * randomly assigned and never previewed (PRD §6.2).
   */
  chosenSetId: z.string().nullable(),
  chosenSetLabel: z.string().nullable(),
  /**
   * True when this participant is on no team yet.
   *
   * The UI must surface it. A participant with no team contributes to no team score, and since team
   * size is the divisor in every team score, silently joining without one produces a student who
   * appears to be competing and is not.
   */
  needsTeam: z.boolean(),
  /**
   * True when this call returned an existing participant instead of creating one.
   *
   * Joining is idempotent per browser: a second join presenting a valid join claim is handed back
   * the same participant and, critically, the same `chosenSetId`. Re-joining used to draw a fresh
   * set, which made it a way to preview the other sets before the round (docs/TODO.md T5).
   */
  rejoined: z.boolean(),
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

/**
 * One player's line inside a team, for the expandable breakdown.
 *
 * Not a ranked row — players are not ranked against each other any more, teams are. This exists so
 * a student can see how their team's mean was arrived at (PRD §9.1). Someone who can check the
 * arithmetic does not have to trust it, which is the entire point of replacing the spreadsheet.
 */
export const TeamPlayerRowSchema = z.object({
  participantId: z.string(),
  displayName: z.string(),
  /** This player's own points: individual problems only. Group points are a team fact. */
  score: z.number(),
  penaltyMinutes: z.number().int().nonnegative(),
  /** Which Round 1 set they were assigned. Null before assignment. */
  chosenSetLabel: z.string().nullable(),
});
export type TeamPlayerRow = z.infer<typeof TeamPlayerRowSchema>;

export const TeamStandingRowSchema = z.object({
  teamId: z.string(),
  name: z.string(),
  rank: z.number().int().positive(),
  /** True when level with another team on every ranking key. Displayed as a tie, never broken. */
  isTied: z.boolean(),

  /**
   * The team score, in points, as a decimal. `543.75` is a normal value.
   *
   * Derived from `scoreHundredths`, which is what the engine compares and ranks. Never sum or
   * compare this field — see docs/SCORING.md §3.
   */
  score: z.number(),
  scoreHundredths: z.number().int(),

  /** The divisor. Sent so the UI can show the arithmetic rather than only the total. */
  teamSize: z.number().int().nonnegative(),
  playerPoolPoints: z.number().int(),
  groupPoints: z.number().int(),
  sideActivityPoints: z.number().int(),
  penaltyMinutes: z.number().int().nonnegative(),

  players: z.array(TeamPlayerRowSchema),
});
export type TeamStandingRow = z.infer<typeof TeamStandingRowSchema>;

export const TeamStandingsResponseSchema = z.object({
  contestId: z.string(),
  frozen: z.boolean(),
  asOf: z.string(),
  endsAt: z.string(),
  /** Ranked best first. One entry per team; players nest inside. */
  teams: z.array(TeamStandingRowSchema),
});
export type TeamStandingsResponse = z.infer<typeof TeamStandingsResponseSchema>;

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
