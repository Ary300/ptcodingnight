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

  /** Team formation. Contest-scoped like everything else a competitor reaches after joining. */
  myTeam: (contestId: string) => `/api/contests/${encodeURIComponent(contestId)}/teams/mine`,
  teamStandings: (contestId: string) =>
    `/api/contests/${encodeURIComponent(contestId)}/team-standings`,

  // --- admin ---
  adminSession: "/api/admin/session",
  adminFreeze: (contestId: string) =>
    `/api/admin/contests/${encodeURIComponent(contestId)}/freeze`,
  adminExport: (contestId: string) =>
    `/api/admin/contests/${encodeURIComponent(contestId)}/export`,
  adminOverride: (submissionId: string) =>
    `/api/admin/submissions/${encodeURIComponent(submissionId)}/override`,

  // --- admin: team management ---
  adminRoster: (contestId: string) =>
    `/api/admin/contests/${encodeURIComponent(contestId)}/roster`,
  adminTeams: (contestId: string) => `/api/admin/contests/${encodeURIComponent(contestId)}/teams`,
  adminTeam: (teamId: string) => `/api/admin/teams/${encodeURIComponent(teamId)}`,
  adminMoveParticipant: (contestId: string) =>
    `/api/admin/contests/${encodeURIComponent(contestId)}/roster/move`,
  adminReassignSet: (contestId: string) =>
    `/api/admin/contests/${encodeURIComponent(contestId)}/roster/set`,
  /**
   * The contest's roster membership, as distinct from `/roster`, which is the VIEW of it.
   *
   * `GET` lists known accounts that are NOT on it yet, `POST` puts one on, `DELETE` takes one off.
   * This is the route the reported bug needed and did not have: a `Participant` could only ever be
   * created by that person signing in, so a contest created this morning contained nobody and
   * could contain nobody.
   */
  adminContestParticipants: (contestId: string) =>
    `/api/admin/contests/${encodeURIComponent(contestId)}/participants`,
  adminAddableUsers: (contestId: string, query: string) =>
    `/api/admin/contests/${encodeURIComponent(contestId)}/participants?q=${encodeURIComponent(query)}`,
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
// Teams
// ---------------------------------------------------------------------------

/**
 * A team as a competitor sees it.
 *
 * `joinCode` is included, and that is deliberate: it is not a credential. A team's membership is
 * already public on the leaderboard, and the worst a leaked code does is put somebody on a team
 * an organizer can move them off. What actually protects the roster is server-side — one team per
 * participant, a size limit, and formation closing when the contest starts.
 *
 * There is no `size` field. **Team size is the divisor in every team score**, so it is derived
 * from `members` at scoring time and never stored or transmitted as a count — a count is a second
 * source of truth that drifts from the roster it describes (CLAUDE.md).
 */
export const TeamMemberSchema = z.object({
  participantId: z.string(),
  displayName: z.string(),
});

export const TeamViewSchema = z.object({
  teamId: z.string(),
  name: z.string(),
  joinCode: z.string(),
  maxTeamSize: z.number().int().positive(),
  members: z.array(TeamMemberSchema),
});
export type TeamView = z.infer<typeof TeamViewSchema>;

export const CreateTeamRequestSchema = z.object({
  name: z.string().trim().min(1, "Name your team").max(40),
});

export const JoinTeamRequestSchema = z.object({
  /** Normalised server-side, so `7km-4p2` and `7KM4P2` are the same code. */
  code: z.string().trim().min(1, "Enter the team code").max(24),
});

export const TeamMembershipResponseSchema = z.object({
  team: TeamViewSchema,
  /** The set this participant holds after joining. Null when the contest assigns none. */
  chosenSetId: z.string().nullable(),
  /** True when the call was a no-op because they were already on this team. */
  alreadyMember: z.boolean(),
});

/**
 * One contest as an organizer sees it in a list — enough to pick the right one and no more.
 *
 * `participantCount` is here because it is the sanity check an organizer actually makes before
 * touching a roster: "is this the contest with 42 people in it, or last year's". `joinCode` is
 * deliberately absent — there is no join code path any more, and a field nothing can be done with
 * is a field somebody will try to do something with.
 */
export const AdminContestSummarySchema = z.object({
  contestId: z.string(),
  name: z.string(),
  // The Prisma enum verbatim. Spelling it out rather than importing keeps the wire contract a
  // thing this file owns — but it must MATCH, so it is asserted against the enum in a unit test.
  state: z.enum(["DRAFT", "SCHEDULED", "RUNNING", "FROZEN", "ENDED", "ARCHIVED"]),
  startsAt: z.string(),
  endsAt: z.string(),
  participantCount: z.number().int().nonnegative(),
  teamCount: z.number().int().nonnegative(),
});
export type AdminContestSummary = z.infer<typeof AdminContestSummarySchema>;

/** Newest first, and sorted in the engine rather than by whatever order Postgres returns. */
export const AdminContestListSchema = z.object({
  contests: z.array(AdminContestSummarySchema),
});
export type AdminContestList = z.infer<typeof AdminContestListSchema>;

/**
 * The judge queue as the console draws it.
 *
 * `reachable` is a first-class field rather than an error. "Redis is down" is exactly what an
 * organizer opens this screen to learn, so it has to be something the screen can RENDER — turning
 * it into a failed request replaces the answer with a spinner at the worst possible moment.
 */
export const JudgeHealthViewSchema = z.object({
  reachable: z.boolean(),
  queueDepth: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  workersOnline: z.number().int().nonnegative(),
  oldestWaitingMs: z.number().int().nonnegative().nullable(),
});
export type JudgeHealthView = z.infer<typeof JudgeHealthViewSchema>;

/**
 * One row of the organizer's submission feed.
 *
 * `language` is the registry's `LanguageSchema`, not a hand-written union. The admin contract used
 * to spell out `"PYTHON_312" | "JAVA_21"` — two of the ten variants the judge actually runs — and
 * a stale language id does not fail to typecheck: it parses as a string and dies at the registry
 * lookup. That exact mistake has four homes in this codebase and has been found three separate
 * times (CLAUDE.md). Importing the enum is the only version that cannot drift.
 */
export const AdminSubmissionRowSchema = z.object({
  submissionId: z.string(),
  participantId: z.string(),
  displayName: z.string(),
  divisionName: z.string(),
  slotLabel: z.string(),
  problemTitle: z.string(),
  language: LanguageSchema,
  submittedAt: z.string(),
  /** null while queued or judging. */
  verdict: VerdictSchema.nullable(),
  score: z.number().int(),
  runtimeMs: z.number().int().nonnegative().nullable(),
});
export type AdminSubmissionRow = z.infer<typeof AdminSubmissionRowSchema>;

/**
 * Everything the live console reads, in one response.
 *
 * `total` travels with a windowed `submissions` so the screen can say "the most recent 200 of
 * 431" out loud. A feed that silently stops at N reads as "that is all of them", which is how a
 * stuck submission goes unnoticed for an hour.
 */
export const AdminConsoleViewSchema = z.object({
  contestId: z.string(),
  contestName: z.string(),
  frozen: z.boolean(),
  total: z.number().int().nonnegative(),
  submissions: z.array(AdminSubmissionRowSchema),
  health: JudgeHealthViewSchema,
});
export type AdminConsoleView = z.infer<typeof AdminConsoleViewSchema>;

/**
 * Creating a contest.
 *
 * Times arrive as ISO strings rather than as a local-time string plus a zone, because a contest
 * window is an instant and the browser is the only party that knows the organizer's zone. The form
 * converts once, at the edge, and everything downstream handles a `Date`.
 *
 * No `joinCode`. The builder used to generate one and ask the organizer to write it down; there is
 * no join route for it to open, so prompting for it was prompting for a credential that does
 * nothing. The column is still non-null in the schema, and `createContest` fills it.
 */
export const CreateContestRequestSchema = z.object({
  name: z.string().trim().min(1, "Give the contest a name").max(120),
  startsAt: z.string(),
  endsAt: z.string(),
  freezeAt: z.string().nullable(),
  scoringPresetId: z.enum(["classic", "icpc"]),
  divisions: z.array(z.string().trim().min(1).max(40)),
});
export type CreateContestRequest = z.infer<typeof CreateContestRequestSchema>;

export const CreateContestResponseSchema = z.object({ contestId: z.string() });

/**
 * A contest's line-up, set in one call.
 *
 * `setLabel` null means a GROUP problem — every team works it regardless of which set a player was
 * assigned. That is the distinction the whole Coding Night format rests on, so it is a field
 * rather than something inferred from the slot label's spelling.
 */
export const SetContestProblemsRequestSchema = z.object({
  problems: z.array(
    z.object({
      problemId: z.string(),
      slotLabel: z.string().trim().min(1).max(24),
      basePoints: z.number().int().nonnegative(),
      setLabel: z.string().trim().min(1).max(8).nullable(),
      divisionId: z.string().nullable(),
    }),
  ),
  reason: z.string().trim().min(1, "Say why this line-up changed").max(300),
});
export const SetContestProblemsResponseSchema = z.object({
  count: z.number().int().nonnegative(),
});

/** Publishing, opening and ending a contest. Freezing is NOT here — it belongs to the console. */
export const SetContestStateRequestSchema = z.object({
  state: z.enum(["SCHEDULED", "RUNNING", "ENDED"]),
  reason: z.string().trim().min(1, "Say why").max(300),
});
export const SetContestStateResponseSchema = z.object({ state: z.string() });

/**
 * One problem in the bank, as the organizer's screen shows it.
 *
 * `readyBlockers` is a LIST OF REASONS rather than a boolean, because "why can I not use this
 * one" is the question actually being asked, and a disabled button with no explanation is how an
 * organizer ends up editing the database.
 *
 * There is deliberately no `referencePasses` field. Whether a reference solution passes is known
 * only by running it through the real judge in a real container, which is G13's job
 * (`npm run test:content`). The screen this replaces displayed a green "reference passed" computed
 * by a function that never executed any code.
 */
export const AdminProblemRowSchema = z.object({
  problemId: z.string(),
  slug: z.string(),
  title: z.string(),
  state: z.enum(["DRAFT", "READY", "ARCHIVED"]),
  difficulty: z.enum(["E", "M", "H"]).nullable(),
  pastStatus: z.string().nullable(),
  round: z.string(),
  hasOriginalStatement: z.boolean(),
  testCaseCount: z.number().int().nonnegative(),
  sampleCaseCount: z.number().int().nonnegative(),
  readyBlockers: z.array(z.string()),
});
export type AdminProblemRow = z.infer<typeof AdminProblemRowSchema>;

export const AdminProblemBankSchema = z.object({
  problems: z.array(AdminProblemRowSchema),
});
export type AdminProblemBank = z.infer<typeof AdminProblemBankSchema>;

/**
 * One person on the roster, as an ORGANIZER sees them.
 *
 * Strictly wider than `TeamMemberSchema`, which is the student-facing shape and stays a name and
 * an id. The three extra fields each answer a question only the organizer's screen has:
 *
 *  - `email` tells two students with the same name apart. That is not hypothetical — the reason
 *    `uniqueDisplayName` invents a "(2)" suffix is that `Participant` is unique on
 *    `(contestId, displayName)` and two Alex Chens really do turn up.
 *  - `userId` says whether the participant is backed by an account at all. Null is a legacy
 *    join-by-code row, which cannot be re-added once removed because there is no account to add.
 *  - `submissionCount` is what removing them destroys, so the screen can say so BEFORE the click
 *    rather than after. `Submission.participantId` cascades on delete.
 *
 * None of this is on the student-facing `TeamViewSchema`, and it must not be: a competitor reading
 * their own team has no business holding their teammates' email addresses.
 */
export const RosterMemberSchema = TeamMemberSchema.extend({
  userId: z.string().nullable(),
  email: z.string().nullable(),
  submissionCount: z.number().int().nonnegative(),
});
export type RosterMember = z.infer<typeof RosterMemberSchema>;

/** The organizer's roster view: every team plus everybody on none. */
export const AdminRosterSchema = z.object({
  maxTeamSize: z.number().int().positive(),
  formationOpen: z.boolean(),
  teams: z.array(
    TeamViewSchema.extend({
      memberCount: z.number().int().nonnegative(),
      members: z.array(RosterMemberSchema),
    }),
  ),
  unassigned: z.array(RosterMemberSchema),
});
export type AdminRoster = z.infer<typeof AdminRosterSchema>;

/**
 * A known account that is not yet on this contest's roster.
 *
 * `pastContests` is the field that closes the reported bug from the organizer's side: the people
 * they wanted to add to Test2 were "the people who participated in the Demo", and a picker that
 * shows only names cannot tell them which Alex Chen that was.
 */
export const AddableUserSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  email: z.string().nullable(),
  gradYear: z.number().int().nullable(),
  role: z.enum(["COMPETITOR", "ADMIN"]),
  pastContests: z.array(z.string()),
});
export type AddableUser = z.infer<typeof AddableUserSchema>;

export const AddableUsersSchema = z.object({
  users: z.array(AddableUserSchema),
  /** True when the search was cut off at the limit, so the screen can say "keep typing". */
  truncated: z.boolean(),
});

/**
 * Adding somebody to a contest needs no reason, and every other organizer roster action does.
 *
 * The reason exists because a roster change is a SCORE change: team size is the divisor. Adding a
 * participant creates them with no team, so they are in nobody's divisor and no score can move —
 * there is nothing yet to explain. The audit row still records who did it and when.
 */
export const AdminAddParticipantRequestSchema = z.object({
  userId: z.string().min(1),
});

/**
 * Every organizer mutation carries a reason, and the schema requires it.
 *
 * A roster change is a score change with extra steps — moving one participant changes TWO
 * divisors — so "why" is not optional metadata. Making it a required field means the audit row
 * cannot be written without one.
 */
export const AdminReasonSchema = z.object({
  /**
   * The message is on the TYPE as well as the length. `.min(3, msg)` only fires for a value that
   * is already a string, so omitting the field entirely produced Zod's default "expected string,
   * received undefined" — which tells an organizer nothing about what the form wants.
   */
  reason: z
    .string({ error: "Give a reason — it goes in the audit log" })
    .trim()
    .min(3, "Give a reason — it goes in the audit log")
    .max(300),
});

export const AdminCreateTeamRequestSchema = z.object({
  name: z.string().trim().min(1, "Name the team").max(40),
});

export const AdminRenameTeamRequestSchema = AdminReasonSchema.extend({
  name: z.string().trim().min(1, "Name the team").max(40),
});

export const AdminMoveParticipantRequestSchema = AdminReasonSchema.extend({
  participantId: z.string().min(1),
  /** Null moves them off every team without deleting anything. */
  teamId: z.string().min(1).nullable(),
});

export const AdminReassignSetRequestSchema = AdminReasonSchema.extend({
  participantId: z.string().min(1),
  setId: z.string().min(1).nullable(),
});

/**
 * Taking somebody off a contest entirely. Declared here rather than beside `AddableUserSchema`
 * because it extends `AdminReasonSchema`, and a `const` cannot be read before its own line runs.
 */
export const AdminRemoveParticipantRequestSchema = AdminReasonSchema.extend({
  participantId: z.string().min(1),
  /**
   * Must be sent as `true` before a participant with judged submissions is deleted.
   *
   * `Submission.participantId` is `onDelete: Cascade`, so removing them takes their judged work
   * with it, and standings are re-derived from that log. Defaulting to false means the destructive
   * case has to be asked for in words rather than arrived at by leaving a field out.
   */
  deleteSubmissions: z.boolean().default(false),
});

export const AdminRemoveParticipantResponseSchema = z.object({
  removed: z.object({
    participantId: z.string(),
    displayName: z.string(),
    submissionsDeleted: z.number().int().nonnegative(),
  }),
  roster: AdminRosterSchema,
});

// ---------------------------------------------------------------------------
// Problems
// ---------------------------------------------------------------------------

/**
 * A sample case. Samples are published by definition, so full I/O is fine here.
 *
 * **`ordinal` is 1-BASED**, matching `TestCase.ordinal` in the database and the worker, which
 * numbers tests `index + 1`. Stated here because it was not, and the two sides disagreed: the
 * client rendered `ordinal + 1`, which is right for a 0-based feed and shows a student "Sample 2"
 * for the first sample of every problem. It looked correct for as long as the UI was reading a
 * stub that happened to be 0-based.
 */
export const SampleCaseSchema = z.object({
  ordinal: z.number().int().positive(),
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

/**
 * Template code for one language, pre-filled into the editor the first time a student opens the
 * problem: the function stub they complete, plus the visible harness that reads stdin and prints
 * the answer. Generated by `lib/judge/starters/` from the problem's declared signature.
 *
 * It is the whole file, never a fragment, because a submission IS one whole file. Splicing a
 * student's function into a harness at judge time would mean the line numbers in a compile error
 * name lines the student cannot see.
 */
export const StarterCodeSchema = z.object({
  language: LanguageSchema,
  code: z.string(),
});
export type StarterCode = z.infer<typeof StarterCodeSchema>;

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
  /**
   * One entry per allowed language, or ABSENT for a problem that declares no signature.
   *
   * Optional rather than a defaulted empty array on purpose. Most of the 125-problem bank has no
   * signature and never will, and for those the editor opens empty and the student writes a raw
   * stdin-to-stdout program, exactly as before this field existed. Absent says "this problem has
   * no starters"; it is not a degraded or half-loaded state, and a client must not render one.
   *
   * Ordered by the registry's language order, so a problem always serialises to the same bytes.
   */
  starters: z.array(StarterCodeSchema).optional(),
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
  /** 1-based, like `SampleCaseSchema.ordinal` and `TestCase.ordinal`. */
  ordinal: z.number().int().positive(),
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
 * One problem, as it stands for one player.
 *
 * Present only when the viewer is entitled to it — see `TeamPlayerRowSchema.problems`. Every
 * number here is already computed by `computeTeamStandings`; this schema exists because the mapper
 * used to discard them, not because the scoring engine had to learn anything new. Nothing in
 * `lib/scoring/` changed to add it, which is the evidence that no score moved.
 */
export const TeamPlayerProblemSchema = z.object({
  contestProblemId: z.string(),
  /** `ContestProblem.slotLabel` — "A-E1", "Group 1". From the database, never from the engine. */
  slotLabel: z.string(),
  title: z.string(),
  basePoints: z.number().int().nonnegative(),
  /** Best score across this player's submissions, after the hint deduction, floored at zero. */
  score: z.number().int().nonnegative(),
  /**
   * Rejected submissions on this problem — Codeforces' red `-2`.
   *
   * NOT an attempt count, and must never be labelled one: a first-try accept is `0`, exactly the
   * same as never submitting. `score` is what separates those two.
   */
  rejectedCount: z.number().int().nonnegative(),
  penaltyMinutes: z.number().int().nonnegative(),
  hintsTaken: z.number().int().nonnegative(),
  /** Points the hints cost. This is why a 250-point problem can read 212. */
  hintDeduction: z.number().int().nonnegative(),
  /** First submission that scored above zero. Null means never scored. */
  firstScoredAt: z.string().nullable(),
  /**
   * A group problem counts once FOR THE TEAM and is excluded from this player's `score`
   * (`lib/scoring/team.ts`). Flagged so the breakdown can show the points and still add up.
   */
  isGroupProblem: z.boolean(),
});
export type TeamPlayerProblem = z.infer<typeof TeamPlayerProblemSchema>;

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

  /**
   * Individual problems this player scored above zero. Counted over the same problems `score`
   * sums, in the mapper, so the two can never disagree.
   *
   * Unlike `problems` this is NOT gated: a count of solves is the same class of fact as the point
   * total already on this row, and the projector prints that publicly.
   */
  solvedCount: z.number().int().nonnegative(),
  /**
   * The last submission by this player that raised their own total. Null if they never scored.
   * "Still moving" versus "stalled forty minutes ago" — ungated for the same reason as
   * `solvedCount`, and it is what an organizer scans for a stuck student.
   */
  lastScoreIncreaseAt: z.string().nullable(),
  /**
   * The per-problem breakdown, or `null` when the viewer may not read it.
   *
   * **`null` and `[]` are DIFFERENT CLAIMS and the UI renders them differently.** `[]` is "this
   * player has attempted nothing"; `null` is "not yours to read". Collapsing them would print a
   * lie about a real student.
   *
   * Non-null only for an organizer, or for a competitor asking about their OWN team. Both team
   * standings routes are public with no login, because the projector has no session — so the
   * payload is the disclosure boundary, not the component. Anything put here unconditionally is
   * on the wall and readable by every rival team in the room.
   */
  problems: z.array(TeamPlayerProblemSchema).nullable(),
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
