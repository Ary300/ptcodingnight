import { z } from "zod";

/**
 * The judge job contract.
 *
 * A job crosses a process boundary (web -> Redis/BullMQ -> worker) and describes work on
 * untrusted code, so both directions are parsed, never cast. If a job fails to parse, the
 * worker must not guess — it fails the submission as `IE` and alerts, because a malformed
 * job means the enqueuer and the worker disagree about the contract.
 *
 * Spec: docs/PRD.md §7.
 */

/**
 * One value per VARIANT in lib/judge/runtimes.ts, matching the Prisma `Language` enum.
 *
 * Kept as a literal list rather than derived from the registry because this is the WIRE
 * contract: a value arriving over HTTP or off the queue must be validated against a fixed set,
 * and generating that set from the same module the runner reads would mean a typo in the
 * registry silently becomes a valid wire value.
 */
export const LanguageSchema = z.enum([
  "PYTHON_312",
  "JAVA_8",
  "JAVA_11",
  "JAVA_17",
  "JAVA_21",
  "C_17",
  "CPP_11",
  "CPP_17",
  "JAVASCRIPT_NODE22",
  "GO_123",
]);
export type Language = z.infer<typeof LanguageSchema>;

export const VerdictSchema = z.enum(["AC", "WA", "TLE", "MLE", "RE", "CE", "IE"]);
export type Verdict = z.infer<typeof VerdictSchema>;

/**
 * Output comparison is pluggable (PRD §7.2). Default is whitespace-normalized.
 * `special` defers to a per-problem checker for problems with multiple valid answers.
 */
export const ComparatorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("exact") }),
  z.object({ kind: z.literal("whitespace") }),
  z.object({ kind: z.literal("float"), epsilon: z.number().positive() }),
  z.object({ kind: z.literal("special"), checkerRef: z.string().min(1) }),
]);
export type Comparator = z.infer<typeof ComparatorSchema>;

/** One test case as the worker needs it: paths on disk, never inline blobs (PRD §5). */
export const JudgeTestCaseSchema = z.object({
  testCaseId: z.string().min(1),
  ordinal: z.number().int().nonnegative(),
  inputPath: z.string().min(1),
  expectedOutputPath: z.string().min(1),
  /**
   * Sample cases may return a full diff to the student. Hidden cases return pass/fail and
   * timing only. The worker uses this flag to decide how much detail to emit — it is the
   * first of two gates, the API edge being the second.
   */
  isSample: z.boolean(),
  points: z.number().int().nonnegative(),
  group: z.string().nullable(),
});
export type JudgeTestCase = z.infer<typeof JudgeTestCaseSchema>;

/** Resource ceilings applied to the per-submission container. */
export const JudgeLimitsSchema = z.object({
  timeLimitMs: z.number().int().positive(),
  memoryLimitMb: z.number().int().positive(),
  /**
   * Hard wall-clock kill, always 3x the problem time limit (PRD §7.1). Carried explicitly
   * rather than recomputed in the worker so the value that ran is the value that is logged.
   */
  wallClockKillMs: z.number().int().positive(),
  pidsLimit: z.number().int().positive(),
  tmpfsBytes: z.number().int().positive(),
  cpus: z.number().positive(),
});
export type JudgeLimits = z.infer<typeof JudgeLimitsSchema>;

/** What a job carries IN. */
export const JudgeJobSchema = z.object({
  submissionId: z.string().min(1),
  language: LanguageSchema,
  sourceCode: z.string(),
  limits: JudgeLimitsSchema,
  comparator: ComparatorSchema,
  testCases: z.array(JudgeTestCaseSchema).min(1),
  /**
   * Requeue counter. `IE` is retried exactly once (PRD §7.2); on attempt 2 an internal
   * error is escalated to an admin alert instead of a third run.
   */
  attempt: z.number().int().min(1).default(1),
});
export type JudgeJob = z.infer<typeof JudgeJobSchema>;

/** Per-test outcome. */
export const JudgeTestResultSchema = z.object({
  testCaseId: z.string().min(1),
  verdict: VerdictSchema,
  runtimeMs: z.number().int().nonnegative().nullable(),
  memoryKb: z.number().int().nonnegative().nullable(),
  /**
   * Truncated to at most DIFF_SNIPPET_MAX_CHARS, and only ever populated for sample cases.
   * Students reconstruct hidden test data by diffing if you let them (PRD §7.2).
   */
  diffSnippet: z.string().max(200).nullable(),
});
export type JudgeTestResult = z.infer<typeof JudgeTestResultSchema>;

/**
 * Stage attribution for one judged run — the six-point model, as epoch-anchored milliseconds.
 *
 * The two queue marks come from BullMQ's own clocks (`job.timestamp` and `job.processedOn`);
 * the three container marks are recorded monotonically inside the worker and converted to
 * epoch-anchored numbers before they cross the queue. Readers derive the buckets:
 *
 *   queue   = dequeuedAtMs - enqueuedAtMs
 *   create  = containerStartedAtMs - dequeuedAtMs
 *   compile = compileFinishedAtMs - containerStartedAtMs
 *   run     = lastTestFinishedAtMs - (compileFinishedAtMs ?? containerStartedAtMs)
 *
 * `compileFinishedAtMs` is null for runs with no separate compile container (interpreted and
 * parse-only languages). The container marks are individually nullable because a job can fail
 * before reaching a stage — a CE never runs a test — and every reader must treat absence as
 * absence. `attempt` is the BullMQ attempt number: 2 means the one IE retry ran (PRD §7.2),
 * which is the first thing to check when a submission's latency looks wrong.
 */
export const JudgeTimingsSchema = z.object({
  enqueuedAtMs: z.number().int().nonnegative(),
  dequeuedAtMs: z.number().int().nonnegative(),
  containerStartedAtMs: z.number().int().nonnegative().nullable(),
  compileFinishedAtMs: z.number().int().nonnegative().nullable(),
  lastTestFinishedAtMs: z.number().int().nonnegative().nullable(),
  attempt: z.number().int().min(1),
});
export type JudgeTimings = z.infer<typeof JudgeTimingsSchema>;

/** What a verdict carries OUT. */
export const JudgeResultSchema = z.object({
  submissionId: z.string().min(1),
  verdict: VerdictSchema,
  /** Sum of `points` over passing cases. The participant's problem score is the BEST of
   * these across submissions, computed in lib/scoring/ — not here. */
  score: z.number().int().nonnegative(),
  /** Max across tests, not sum. */
  runtimeMs: z.number().int().nonnegative().nullable(),
  memoryKb: z.number().int().nonnegative().nullable(),
  testResults: z.array(JudgeTestResultSchema),
  /** Compiler stderr, returned verbatim to the student. Only set when verdict is `CE`. */
  compileError: z.string().nullable(),
  /** Pointer to the retained structured judge log, for dispute resolution. */
  judgeLogRef: z.string().nullable(),
  /**
   * Optional, not defaulted: results produced before this field existed are still sitting in
   * Redis as completed jobs, and they must keep parsing. Absence and null both mean "no
   * timings were recorded".
   */
  timings: JudgeTimingsSchema.nullable().optional(),
});
export type JudgeResult = z.infer<typeof JudgeResultSchema>;

/** Hard cap on any diff returned to a client. Enforced here and again at the API edge. */
export const DIFF_SNIPPET_MAX_CHARS = 200;

/**
 * Aggregation precedence, worst-first. A submission's verdict is the worst verdict any of
 * its test cases produced; `AC` only when every case passed.
 *
 * `IE` outranks everything: an internal error means we do not actually know whether the
 * submission was correct, so it must never be reported as a student-facing failure.
 */
export const VERDICT_PRECEDENCE: readonly Verdict[] = [
  "IE",
  "CE",
  "RE",
  "MLE",
  "TLE",
  "WA",
  "AC",
] as const;
