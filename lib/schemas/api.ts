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
  problems: (contestId: string) =>
    `/api/contests/${encodeURIComponent(contestId)}/problems`,
  problem: (contestId: string, slug: string) =>
    `/api/contests/${encodeURIComponent(contestId)}/problems/${encodeURIComponent(slug)}`,
  standings: (contestId: string) =>
    `/api/contests/${encodeURIComponent(contestId)}/standings`,
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
  stream: (contestId: string) =>
    `/api/contests/${encodeURIComponent(contestId)}/stream`,

  runSamples: "/api/run-samples",
  submissions: "/api/submissions",
  submission: (id: string) => `/api/submissions/${encodeURIComponent(id)}`,

  /** The signed-in student's own account: read the profile, rename, manage the avatar. */
  me: "/api/me",
  myAvatar: "/api/me/avatar",
  /** A user's avatar image, by id, for an `<img src>`. `v` busts the cache when it changes. */
  userAvatar: (userId: string, version?: string | null) =>
    version === undefined || version === null
      ? `/api/users/${encodeURIComponent(userId)}/avatar`
      : `/api/users/${encodeURIComponent(userId)}/avatar?v=${encodeURIComponent(version)}`,

  /** Team formation. Contest-scoped like everything else a competitor reaches after joining. */
  myTeam: (contestId: string) =>
    `/api/contests/${encodeURIComponent(contestId)}/teams/mine`,
  /** Who on my team has attempted this GROUP problem, with what verdict. Empty off group problems. */
  teamProblemFeed: (contestId: string, slug: string) =>
    `/api/contests/${encodeURIComponent(contestId)}/problems/${encodeURIComponent(slug)}/team-feed`,
  teamStandings: (contestId: string) =>
    `/api/contests/${encodeURIComponent(contestId)}/team-standings`,

  // --- admin ---
  adminSession: "/api/admin/session",
  /** The problem bank: `GET` lists it, `POST` creates a coding question. */
  adminProblems: "/api/admin/problems",
  adminFreeze: (contestId: string) =>
    `/api/admin/contests/${encodeURIComponent(contestId)}/freeze`,
  adminExport: (contestId: string) =>
    `/api/admin/contests/${encodeURIComponent(contestId)}/export`,
  adminOverride: (submissionId: string) =>
    `/api/admin/submissions/${encodeURIComponent(submissionId)}/override`,

  // --- admin: team management ---
  adminRoster: (contestId: string) =>
    `/api/admin/contests/${encodeURIComponent(contestId)}/roster`,
  adminTeams: (contestId: string) =>
    `/api/admin/contests/${encodeURIComponent(contestId)}/teams`,
  adminTeam: (teamId: string) =>
    `/api/admin/teams/${encodeURIComponent(teamId)}`,
  adminMoveParticipant: (contestId: string) =>
    `/api/admin/contests/${encodeURIComponent(contestId)}/roster/move`,
  adminReassignSet: (contestId: string) =>
    `/api/admin/contests/${encodeURIComponent(contestId)}/roster/set`,
  adminSetDivision: (contestId: string) =>
    `/api/admin/contests/${encodeURIComponent(contestId)}/roster/division`,
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
  /**
   * The contest's SET PLAN: which problems are in set A, B, C, D.
   *
   * `GET` reads back the stored recipe and the sets it produced; `POST` previews or applies a new
   * one. One route for both modes because the preview and the apply must be the same computation:
   * a preview an organizer approves and an apply that deals differently is the one outcome this
   * whole screen exists to prevent, and two routes are two chances to diverge.
   *
   * Distinct from `/assign-sets`, which decides which PLAYER holds a set. This decides what is IN
   * one.
   */
  adminContestSets: (contestId: string) =>
    `/api/admin/contests/${encodeURIComponent(contestId)}/sets`,
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
    z.object({
      success: z.literal(false),
      data: z.null(),
      error: ApiErrorSchema,
    }),
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
  state: z.enum([
    "DRAFT",
    "SCHEDULED",
    "RUNNING",
    "FROZEN",
    "ENDED",
    "ARCHIVED",
  ]),
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
  /**
   * Live worker HEARTBEAT keys, not Redis's client list. This field replaced `workersOnline`,
   * which counted connections — a wedged worker keeps its connection and a freshly dead one can
   * leave a stale registration, so the old number could say "1" over a queue nothing was
   * draining. A heartbeat is written by the worker itself every 10 s with a 30 s expiry
   * (lib/judge/heartbeat.ts): zero here is the positive fact "no judge is running", within one
   * TTL of it becoming true.
   */
  workerCount: z.number().int().nonnegative(),
  /**
   * Age of the OLDEST waiting job; null when nothing waits. Age, not depth, is the alarm
   * input: three jobs with no consumer is catastrophic, three hundred draining in seconds
   * is a healthy burst.
   */
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
/**
 * Stage attribution for one judged submission, as the console renders it: derived DURATIONS,
 * not the raw epoch marks the worker recorded (`JudgeTimingsSchema` in lib/schemas/judge.ts).
 * The server does the subtraction once so every screen agrees on what "queue" means.
 *
 * `compileMs` is null for runs with no separate compile container (interpreted and parse-only
 * languages); `createMs`/`runMs` are null when the run never reached that stage. `attempt` is
 * the BullMQ attempt number — 2 means the one IE retry ran, which is the first thing to rule
 * out when a submission's latency looks wrong.
 */
export const AdminSubmissionTimingsSchema = z.object({
  queueMs: z.number().int().nonnegative(),
  createMs: z.number().int().nonnegative().nullable(),
  compileMs: z.number().int().nonnegative().nullable(),
  runMs: z.number().int().nonnegative().nullable(),
  attempt: z.number().int().min(1),
});
export type AdminSubmissionTimings = z.infer<typeof AdminSubmissionTimingsSchema>;

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
  /** null while unjudged, and for every submission judged before timings were recorded. */
  timings: AdminSubmissionTimingsSchema.nullable(),
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
 * `round` is explicit and contest-scoped. A GROUP problem belongs to no set; an INDIVIDUAL problem
 * belongs to exactly one set. Keeping both facts in the request lets the boundary reject a
 * contradictory row instead of silently guessing what a blank set means.
 */
export const SetContestProblemsRequestSchema = z.object({
  problems: z.array(
    z
      .object({
        problemId: z.string(),
        slotLabel: z.string().trim().min(1).max(24),
        basePoints: z.number().int().nonnegative(),
        round: z.enum(["INDIVIDUAL", "GROUP"]),
        setLabel: z.string().trim().min(1).max(8).nullable(),
        /**
         * Which division's players see this row. Null means all of them.
         *
         * `min(1)` because an empty string is neither: it would sail into the ownership check
         * and come back as "belongs to a different contest", which is a misleading answer to a
         * malformed request. "All divisions" is spelled null, on the wire and in the row.
         */
        divisionId: z.string().min(1).nullable(),
      })
      .superRefine((problem, ctx) => {
        if (problem.round === "GROUP" && problem.setLabel !== null) {
          ctx.addIssue({
            code: "custom",
            path: ["setLabel"],
            message: "A group question cannot belong to an individual set",
          });
        }
        if (problem.round === "INDIVIDUAL" && problem.setLabel === null) {
          ctx.addIssue({
            code: "custom",
            path: ["setLabel"],
            message: "An individual question needs a set",
          });
        }
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
  chosenSetId: z.string().nullable(),
  chosenSetLabel: z.string().nullable(),
  /**
   * The division this player competes in, or null for none. Null is not a display nicety: a
   * player with no division sees only division-null problems, so the organizer's screen has to
   * show it and offer to change it. The name rides along so the row never has to join the id
   * against the contest's division list to say a word a human reads.
   */
  divisionId: z.string().nullable(),
  divisionName: z.string().nullable(),
});
export type RosterMember = z.infer<typeof RosterMemberSchema>;

/** The organizer's roster view: every team plus everybody on none. */
export const AdminRosterSchema = z.object({
  maxTeamSize: z.number().int().positive(),
  formationOpen: z.boolean(),
  setSelection: z.enum([
    "RANDOM_ASSIGNED",
    "PLAYER_CHOOSES",
    "ONE_SET_PER_TEAM",
  ]),
  problemSets: z.array(z.object({ setId: z.string(), label: z.string() })),
  /**
   * The contest's divisions, in board order. Empty for a contest with none, which is what the
   * screen keys "show division controls at all" on. The per-division headcount is derived from
   * the members client-side rather than sent as counts, for the same reason team size is never
   * stored: a transmitted count is a second source of truth for a list that is already here.
   */
  divisions: z.array(z.object({ divisionId: z.string(), name: z.string() })),
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
 * Organizer roster mutations MAY carry a reason; none is demanded.
 *
 * They used to require one, on the argument that a roster change is a score change. The organizer
 * overruled it from the room: typing a sentence into every assignment while forty students wait
 * is friction exactly where the night has none to spare. The audit row still records who, what,
 * before and after - the reason column is just allowed to be empty now, and an organizer who has
 * something to say still has the field to say it in.
 */
export const AdminReasonSchema = z.object({
  reason: z.string().trim().max(300).optional().default(""),
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
  /**
   * Set the player's division in the same action. Omitted means "leave it alone"; null means
   * "no division". This exists because assigning a team and assigning a division were two forms,
   * and the organizer assigning forty students asked for one: "when we are assigning someone to
   * a team we want to assign their division then too".
   */
  divisionId: z.string().min(1).nullable().optional(),
});

export const AdminReassignSetRequestSchema = AdminReasonSchema.extend({
  participantId: z.string().min(1),
  setId: z.string().min(1).nullable(),
});

/**
 * Put a player in a division, or in none with `divisionId: null`.
 *
 * Follows the move-to-team shape exactly, reason included: division decides which problems the
 * player can open and which board ranks them, so "why is this student suddenly Advanced" needs
 * the same audit-row answer as "why did our team score change". Changing division deliberately
 * does NOT touch their set assignment; re-planning sets is its own explicit action.
 */
export const AdminSetDivisionRequestSchema = AdminReasonSchema.extend({
  participantId: z.string().min(1),
  divisionId: z.string().min(1).nullable(),
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

/**
 * One teammate's attempt on a GROUP problem: who, when, what the judge said. Never the code and
 * never a diff - the feed is ICPC's shared screen recreated for a team on separate laptops, and
 * its whole job is coordination ("Priya is on it", "the 80 is already banked"), not code review.
 */
export const TeamFeedEntrySchema = z.object({
  submissionId: z.string(),
  displayName: z.string(),
  /** True on the viewer's own rows, so the UI can say "you" instead of echoing their name. */
  mine: z.boolean(),
  language: LanguageSchema,
  submittedAt: z.string(),
  /** Null while the judge is still running. */
  verdict: VerdictSchema.nullable(),
  score: z.number().int(),
});

/**
 * The team's attempt log for one GROUP problem. The team's score for it is the BEST single
 * submission here (lib/scoring replays them max-only), so `bestScore` is stated with the feed:
 * a worse attempt arriving can never lower it, and the row that set it is the one that counts.
 */
export const TeamProblemFeedSchema = z.object({
  /** Null when the viewer is on no team yet - the feed has nobody to show. */
  teamName: z.string().nullable(),
  bestScore: z.number().int(),
  entries: z.array(TeamFeedEntrySchema),
});

export type TeamProblemFeed = z.infer<typeof TeamProblemFeedSchema>;

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

export const SubmitRequestSchema = z.object({
  contestProblemId: z.string().min(1),
  language: LanguageSchema,
  sourceCode: z
    .string()
    .min(1, "Write some code first")
    .max(200_000, "Source is too large"),
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

/**
 * Where an unjudged submission stands in the judge queue.
 *
 * "active" means a worker holds it right now; "waiting" means `ahead` jobs will be taken first
 * (`ahead` is 0 when it is next, and always 0 for "active"). The point of the field is that a
 * slow submission must look SLOW, never broken: a student staring at a spinner with no idea
 * whether the judge has forgotten them is the 12-minute-verdict failure mode, worn client-side.
 *
 * "offline" means zero live worker heartbeats (lib/judge/heartbeat.ts): the submission is
 * saved and queued, and nothing will judge it until a worker returns. It outranks a position,
 * because a queue position that never moves is the worst possible display — it looks like
 * working. `ahead` is always 0 for "offline"; a count of jobs nobody is taking is not a
 * position, it is a countdown with no clock.
 */
export const QueuePositionSchema = z.object({
  state: z.enum(["waiting", "active", "offline"]),
  ahead: z.number().int().nonnegative(),
});
export type QueuePosition = z.infer<typeof QueuePositionSchema>;

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
  /**
   * OPTIONAL on purpose, and absence means "no claim", not "position zero". The position is
   * read from Redis on a best-effort basis; if Redis cannot answer, the field is omitted and
   * the verdict panel simply says nothing new. A position read must never break a verdict
   * read, so nothing downstream may require this field. Never present once `verdict` is set.
   */
  queuePosition: QueuePositionSchema.optional(),
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
  /** Configured columns, including a set that currently has no assigned player. */
  setLabels: z.array(z.string()),
  groupPointsInsideMean: z.boolean(),
  sideActivitiesFlat: z.boolean(),
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
  reason: z
    .string()
    .trim()
    .min(1, "Give a reason for the override")
    .max(500),
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

// ---------------------------------------------------------------------------
// Account / profile
// ---------------------------------------------------------------------------

/** The bounds a display name must satisfy. Kept in step with lib/contest/account.ts. */
const DISPLAY_NAME_MAX = 40;

/** What a student sees on their own Settings page. Never carries another account's data. */
export const AccountProfileSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  email: z.string().nullable(),
  gradYear: z.number().int().nullable(),
  hasAvatar: z.boolean(),
  avatarUpdatedAt: z.string().nullable(),
});
export type AccountProfile = z.infer<typeof AccountProfileSchema>;

/** The rename request. Trimmed and length-checked here; normalised again server-side. */
export const RenameAccountRequestSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Your name cannot be empty.")
    .max(DISPLAY_NAME_MAX),
});
export type RenameAccountRequest = z.infer<typeof RenameAccountRequestSchema>;

/**
 * The rename response. `adjustedOnABoard` reports a uniqueness suffix. A frozen or completed
 * result keeps its published competition name and reports that separately.
 */
export const RenameAccountResponseSchema = z.object({
  displayName: z.string(),
  adjustedOnABoard: z.boolean(),
  preservedOnLockedBoards: z.boolean(),
});
export type RenameAccountResponse = z.infer<typeof RenameAccountResponseSchema>;

// ---------------------------------------------------------------------------
// Authoring a coding question (organizer)
// ---------------------------------------------------------------------------

/** The six types a starter-code parameter or return may take. Mirrors SignatureTypeSchema. */
export const AuthoredSignatureTypeSchema = z.enum([
  "int",
  "long",
  "string",
  "int[]",
  "long[]",
  "string[]",
]);

export const AuthoredSignatureParamSchema = z.object({
  name: z.string().min(1),
  type: AuthoredSignatureTypeSchema,
});

/** The optional starter-code signature, in the simple flat form the builder collects. */
export const AuthoredSignatureSchema = z.object({
  name: z.string().min(1),
  returns: AuthoredSignatureTypeSchema,
  params: z.array(AuthoredSignatureParamSchema),
});

export const AuthoredTestCaseSchema = z.object({
  input: z.string(),
  expectedOutput: z.string(),
  isSample: z.boolean(),
});

/**
 * The request that creates a coding question. No question type (all coding) and no language list
 * (all six, always), by design: those are the two HackerRank steps this flow deliberately omits.
 */
export const CreateProblemRequestSchema = z.object({
  title: z.string().trim().min(1, "Give the question a title.").max(120),
  statementMd: z.string().min(1, "Write the problem statement."),
  inputSpec: z.string().optional(),
  outputSpec: z.string().optional(),
  constraints: z.string().optional(),
  difficulty: z.enum(["E", "M", "H"]),
  timeLimitMs: z.number().int().min(500).max(10_000).optional(),
  memoryLimitMb: z.number().int().min(64).max(1024).optional(),
  signature: AuthoredSignatureSchema.nullable().optional(),
  testCases: z
    .array(AuthoredTestCaseSchema)
    .min(1, "Add at least one test case."),
});
export type CreateProblemRequest = z.infer<typeof CreateProblemRequestSchema>;

export const CreateProblemResponseSchema = z.object({
  problemId: z.string(),
  slug: z.string(),
  title: z.string(),
});
export type CreateProblemResponse = z.infer<typeof CreateProblemResponseSchema>;

// ---------------------------------------------------------------------------
// Building the contest's problem sets (organizer)
// ---------------------------------------------------------------------------

export const DifficultySchema = z.enum(["E", "M", "H"]);

/**
 * One line of the recipe: "one Hard", "two Medium", and what a problem on that line is worth.
 *
 * `points` is optional and per LINE rather than global, because difficulties are not worth the
 * same: a set whose Hard scores what its Easy scores is a set nobody has a reason to finish. It
 * lives inside the composition rather than beside it so the stored recipe is self-describing —
 * re-reading a contest planned last year yields the points it was actually built with, instead of
 * whatever the current default happens to be.
 */
export const SetCompositionEntrySchema = z.object({
  difficulty: DifficultySchema,
  count: z.number().int().min(0).max(20),
  points: z.number().int().min(0).max(10_000).optional(),
});
export type SetCompositionEntryInput = z.infer<
  typeof SetCompositionEntrySchema
>;

/**
 * The whole recipe for one set.
 *
 * At most one line per difficulty: two "Easy" lines would be a recipe with two different answers
 * for what an Easy is worth, and the arithmetic in a shortfall message would count the same pool
 * twice. Rejected here rather than merged, because merging silently changes what the organizer
 * typed.
 */
export const SetCompositionSchema = z
  .array(SetCompositionEntrySchema)
  .min(1, "Say how many problems of each difficulty a set should hold.")
  .max(3)
  .refine(
    (entries) =>
      new Set(entries.map((entry) => entry.difficulty)).size === entries.length,
    "Each difficulty may appear once in the recipe.",
  );
export type SetCompositionInput = z.infer<typeof SetCompositionSchema>;

/**
 * `preview` computes and returns; `apply` writes. Two modes on one route rather than two routes,
 * so the plan an organizer approved is produced by exactly the code that then stores it.
 */
const SetPlanCommonSchema = {
  composition: SetCompositionSchema,
  setCount: z
    .number()
    .int()
    .min(1, "Build at least one set.")
    .max(
      26,
      "26 sets is A to Z, and a contest will not need a second row of labels.",
    ),
  /**
   * How many whole-team (GROUP) questions the plan deals after every division's sets. Optional
   * with a default so a request written before team questions existed still parses, as zero,
   * which is what it meant.
   */
  groupCount: z.number().int().min(0).max(20).default(0),
};

const SetPlanSeedSchema = z.string().min(8).max(64);
const SetPoolVersionSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const SetPlanRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    ...SetPlanCommonSchema,
    mode: z.literal("preview"),
    /** Omit to deal a fresh preview; provide one to reproduce a stored plan. */
    seed: SetPlanSeedSchema.optional(),
  }),
  z.object({
    ...SetPlanCommonSchema,
    mode: z.literal("apply"),
    /** The exact seed returned by the preview. Apply never silently mints another one. */
    seed: SetPlanSeedSchema,
    /** The exact usable-pool fingerprint returned by the preview. */
    poolVersion: SetPoolVersionSchema,
  }),
]);
export type SetPlanRequest = z.infer<typeof SetPlanRequestSchema>;

/** A problem as it sits in a planned set. Enough for the organizer to recognise it on screen. */
export const PlannedSetProblemSchema = z.object({
  problemId: z.string(),
  slug: z.string(),
  title: z.string(),
  difficulty: DifficultySchema.nullable(),
  /** "A-E1", "B-H1". Derived from the set label and the recipe line, and written to the row. */
  slotLabel: z.string(),
  basePoints: z.number().int().nonnegative(),
});

export const PlannedSetSchema = z.object({
  /** "A", "B", "C", … the column heading on the organizer's sheet. */
  label: z.string(),
  /**
   * Which division this column belongs to. Null for a contest with no divisions. Labels restart
   * at "A" within each division, so the label alone stops identifying a set once divisions exist.
   */
  divisionId: z.string().nullable(),
  divisionName: z.string().nullable(),
  problems: z.array(PlannedSetProblemSchema),
});

/**
 * One recipe line the bank cannot satisfy, carrying the arithmetic rather than a verdict.
 *
 * Four sets needing one Hard each is four DISTINCT Hard problems, because no problem may appear in
 * two sets. An organizer told only "not enough problems" has to work that out themselves.
 */
export const SetShortfallSchema = z.object({
  /** Null is the team-question line: group questions need problems, not a difficulty. */
  difficulty: DifficultySchema.nullable(),
  /** Whose demand went short. Null for a contest with no divisions, and on the team line. */
  divisionName: z.string().nullable(),
  /** `count × setCount`: how many distinct problems of this difficulty the recipe needs. */
  needed: z.number().int().nonnegative(),
  /** How many usable ones the bank actually holds. */
  available: z.number().int().nonnegative(),
});

/**
 * The plan, or the refusal.
 *
 * A recipe the bank cannot fill is a NORMAL ANSWER rather than an error: the organizer is still
 * choosing, and the numbers are the useful part of the reply. So it comes back inside a successful
 * envelope with `ok: false` and the exact shortfalls, and `applied` on the enclosing object says
 * whether anything was written.
 */
export const SetPlanOutcomeSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    sets: z.array(PlannedSetSchema),
    /** The whole-team questions, drawn from problems no set in any division took. */
    groupProblems: z.array(PlannedSetProblemSchema),
  }),
  z.object({
    ok: z.literal(false),
    shortfalls: z.array(SetShortfallSchema),
    message: z.string(),
  }),
]);
export type SetPlanOutcome = z.infer<typeof SetPlanOutcomeSchema>;

export const SetPlanResponseSchema = z.object({
  contestId: z.string(),
  mode: z.enum(["preview", "apply"]),
  /** False for every preview, and for an apply the bank could not fill. Never inferred from `mode`. */
  applied: z.boolean(),
  setCount: z.number().int().nonnegative(),
  /** How many problems one set holds under this recipe. */
  setSize: z.number().int().nonnegative(),
  /** How many whole-team questions the recipe asked this plan to deal. */
  groupCount: z.number().int().nonnegative(),
  composition: SetCompositionSchema,
  /** The seed this deal came from. Null when nothing was dealt. */
  seed: z.string().nullable(),
  /** How many problems in the bank were usable at all. The denominator behind any shortfall. */
  poolSize: z.number().int().nonnegative(),
  /** SHA-256 fingerprint of the ordered usable pool behind this exact deal. */
  poolVersion: SetPoolVersionSchema,
  plan: SetPlanOutcomeSchema,
});
export type SetPlanResponse = z.infer<typeof SetPlanResponseSchema>;

/** A set as it exists in the database now, as opposed to one that has only been planned. */
export const StoredSetSchema = z.object({
  setId: z.string(),
  label: z.string(),
  divisionId: z.string().nullable(),
  divisionName: z.string().nullable(),
  problems: z.array(
    PlannedSetProblemSchema.extend({ contestProblemId: z.string() }),
  ),
});

/**
 * A whole-team question as it stands in the database. `dealtByPlan` separates the recipe's own
 * draws, which a re-plan replaces, from questions an organizer placed by hand on the Problems
 * tab, which a re-plan must not touch. The screen has to show which is which, or a re-plan
 * looks like it ate an organizer's hand-picked question.
 */
export const StoredGroupProblemSchema = PlannedSetProblemSchema.extend({
  contestProblemId: z.string(),
  dealtByPlan: z.boolean(),
});

/**
 * What is already there: the stored recipe and the sets it produced.
 *
 * `groupProblemCount` is here because the plan deliberately does not touch GROUP problems, and an
 * organizer about to re-plan needs to see that the whole-team questions survive it. A number that
 * does not change across a re-plan is the visible form of that guarantee.
 */
export const StoredSetPlanResponseSchema = z.object({
  contestId: z.string(),
  contestState: z.string(),
  composition: SetCompositionSchema.nullable(),
  setCount: z.number().int().nonnegative().nullable(),
  /** The stored recipe's team-question count. Zero for contests planned before it existed. */
  groupCount: z.number().int().nonnegative(),
  seed: z.string().nullable(),
  poolSize: z.number().int().nonnegative(),
  sets: z.array(StoredSetSchema),
  /** Every whole-team question as it stands, the hand-picked ones included. */
  groupProblems: z.array(StoredGroupProblemSchema),
  groupProblemCount: z.number().int().nonnegative(),
});
export type StoredSetPlanResponse = z.infer<typeof StoredSetPlanResponseSchema>;
