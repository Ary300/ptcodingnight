import type { APIRequestContext, APIResponse } from "@playwright/test";
import { z } from "zod";
import { mintCompetitorSession } from "./session";

import {
  ApiErrorSchema,
  ProblemDetailSchema,
  ProblemSummarySchema,
  RunSamplesResponseSchema,
  StandingsResponseSchema,
  SubmissionViewSchema,
  TeamStandingsResponseSchema,
  type ProblemDetail,
  type ProblemSummary,
  type SetCompositionInput,
  type StandingsResponse,
  type SubmissionView,
  type TeamStandingsResponse,
  type SubmitRequest,
} from "@/lib/schemas/api";

/**
 * A typed client for the routes under `app/api/**`, used by the E2E specs.
 *
 * Written against the paths that actually exist, taken from the route files rather than from
 * `components/contest/data/http-backend.ts` — the two disagree, which `wiring.spec.ts` asserts
 * about directly.
 *
 * Every response is parsed with the schema from `lib/schemas/api.ts`, so a spec that passes has
 * also proved the wire contract holds. Casting here would let a route return a shape no client
 * can read and still show green.
 */

export class ApiCallError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiCallError";
  }
}

/**
 * The two halves of the envelope, checked one at a time.
 *
 * `apiResponseSchema` builds a discriminated union whose inferred output does not narrow
 * through a generic type parameter, and the usual "fix" for that is a cast — which would defeat
 * the point of parsing at all. Two concrete schemas tried in order costs one extra `safeParse`
 * and keeps every branch honestly typed.
 */
const FailureEnvelopeSchema = z.object({
  success: z.literal(false),
  data: z.null(),
  error: ApiErrorSchema,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function unwrap<S extends z.ZodTypeAny>(
  response: APIResponse,
  schema: S,
): Promise<z.infer<S>> {
  const body: unknown = await response.json();

  const failed = FailureEnvelopeSchema.safeParse(body);
  if (failed.success) {
    throw new ApiCallError(
      response.status(),
      failed.data.error.code,
      `${response.url()} failed: ${failed.data.error.code} — ${failed.data.error.message}`,
    );
  }

  if (isRecord(body) && body.success === true && body.error === null) {
    // The payload itself is still parsed against the real schema — the envelope is narrowed by
    // hand only because a generic `z.object({ data: S })` does not infer through `S`.
    const payload = schema.safeParse(body.data);
    if (payload.success) return payload.data as z.infer<S>;

    throw new ApiCallError(
      response.status(),
      "MALFORMED_RESPONSE",
      `${response.url()} returned a payload that does not match the contract: ${payload.error.message}`,
    );
  }

  throw new ApiCallError(
    response.status(),
    "MALFORMED_RESPONSE",
    `${response.url()} returned ${response.status()} with a body that is not the API envelope: ${JSON.stringify(body)}`,
  );
}

/** The raw envelope, for the specs that assert on a *rejection* rather than a payload. */
export async function readEnvelope(
  response: APIResponse,
): Promise<{ status: number; code: string | null; message: string | null }> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = FailureEnvelopeSchema.safeParse(body);
  if (!parsed.success) return { status: response.status(), code: null, message: null };
  return {
    status: response.status(),
    code: parsed.data.error.code,
    message: parsed.data.error.message,
  };
}

/**
 * Status plus the SUCCESS payload, unvalidated.
 *
 * For specs that assert on a response shape no schema in `lib/schemas/api.ts` describes — an
 * ad-hoc admin payload, say. `readEnvelope` deliberately exposes only the failure shape, and
 * widening it would blur the line between "assert this was rejected" and "assert what it returned".
 *
 * `data` is `unknown`: the caller narrows. Anything that has a schema should go through `unwrap`.
 */
export async function readOk(
  response: APIResponse,
): Promise<{ status: number; data: unknown }> {
  const body: unknown = await response.json().catch(() => null);

  if (typeof body === "object" && body !== null && "data" in body) {
    return { status: response.status(), data: (body as { data: unknown }).data };
  }

  return { status: response.status(), data: body };
}

export class ContestApi {
  /**
   * Session cookie, once this client has signed in.
   *
   * Carried as a per-request HEADER rather than in the context's cookie jar, and that is a
   * Playwright constraint rather than a preference: an `APIRequestContext`'s cookies cannot be
   * modified after it is created, and every spec creates its context before it knows who it will
   * be. Sending the header explicitly is what let the migration off join codes leave each spec's
   * setup alone.
   */
  private cookie: string | null = null;

  constructor(
    private readonly request: APIRequestContext,
    readonly contestId: string,
  ) {}

  /**
   * The request context, with this client's session attached to every call.
   *
   * A wrapper rather than 33 edited call sites. The first attempt rewrote each `this.req().get(…)`
   * to add a headers option and mangled the multi-line ones — it had to parse arguments to do it,
   * and parsing TypeScript with a regex is how you end up with `this.req().get(, { … })`. This
   * needs no parsing: every call site changed by replacing one identifier.
   */
  private req() {
    const cookie = this.cookie;
    const withAuth = <T extends { headers?: Record<string, string> }>(options?: T) => {
      if (cookie === null) return options;
      return {
        ...(options ?? ({} as T)),
        headers: { ...(options?.headers ?? {}), cookie },
      };
    };
    return {
      get: (url: string, options?: Parameters<APIRequestContext["get"]>[1]) =>
        this.request.get(url, withAuth(options)),
      post: (url: string, options?: Parameters<APIRequestContext["post"]>[1]) =>
        this.request.post(url, withAuth(options)),
      put: (url: string, options?: Parameters<APIRequestContext["put"]>[1]) =>
        this.request.put(url, withAuth(options)),
      patch: (url: string, options?: Parameters<APIRequestContext["patch"]>[1]) =>
        this.request.patch(url, withAuth(options)),
      delete: (url: string, options?: Parameters<APIRequestContext["delete"]>[1]) =>
        this.request.delete(url, withAuth(options)),
    };
  }

  /**
   * Sign in as a competitor in this contest, the way the OAuth callback does.
   *
   * Replaces `joinOrThrow`, which POSTed a join code to a route that no longer exists. A student
   * signs in with a provider now and an organizer puts them on a team, so there is no code to
   * present — this creates the participant and mints the session directly, which is exactly what
   * the callback does once the consent screen is behind it.
   *
   * `teamId` stays null: team membership is decided in the organizer's roster and nowhere else, so
   * a spec that wants a team goes through the admin routes like an organizer would.
   */
  async signIn(
    options: { displayName?: string; divisionId?: string | null; chosenSetId?: string | null } = {},
  ): Promise<{ participantId: string; displayName: string; contestId: string }> {
    const session = await mintCompetitorSession(this.contestId, options);
    this.cookie = session.cookie;
    return {
      participantId: session.participantId,
      displayName: session.displayName,
      contestId: this.contestId,
    };
  }

  /** Adopt a session minted elsewhere — for specs that need two clients on one participant. */
  useSession(cookie: string): void {
    this.cookie = cookie;
  }

  /**
   * This client's session as a `Cookie` header, for a transport that is not this client.
   *
   * SSE is the case: `collectSse` opens its own connection with `fetch`, so it needs the header
   * rather than the client. `cookieHeader(context)` cannot supply it — `signIn` mints the session
   * directly and holds it here, so it never passes through the request context's cookie jar and
   * `storageState()` reports nothing.
   */
  sessionCookie(): string | null {
    return this.cookie;
  }

  async listProblems(): Promise<ProblemSummary[]> {
    const response = await this.req().get(`/api/contests/${this.contestId}/problems`);
    return unwrap(response, z.array(ProblemSummarySchema));
  }

  getProblemRaw(slug: string): Promise<APIResponse> {
    return this.req().get(
      `/api/contests/${this.contestId}/problems/${encodeURIComponent(slug)}`,
    );
  }

  async getProblem(slug: string): Promise<ProblemDetail> {
    return unwrap(await this.getProblemRaw(slug), ProblemDetailSchema);
  }

  runSamplesRaw(body: SubmitRequest): Promise<APIResponse> {
    return this.req().post("/api/run-samples", { data: body });
  }

  async runSamples(body: SubmitRequest): Promise<z.infer<typeof RunSamplesResponseSchema>> {
    return unwrap(await this.runSamplesRaw(body), RunSamplesResponseSchema);
  }

  submitRaw(body: SubmitRequest): Promise<APIResponse> {
    return this.req().post("/api/submissions", { data: body });
  }

  async submit(body: SubmitRequest): Promise<SubmissionView> {
    return unwrap(await this.submitRaw(body), SubmissionViewSchema);
  }

  getSubmissionRaw(submissionId: string): Promise<APIResponse> {
    return this.req().get(`/api/submissions/${encodeURIComponent(submissionId)}`);
  }

  async getSubmission(submissionId: string): Promise<SubmissionView> {
    return unwrap(await this.getSubmissionRaw(submissionId), SubmissionViewSchema);
  }

  async listMySubmissions(): Promise<SubmissionView[]> {
    const response = await this.req().get("/api/submissions");
    return unwrap(response, z.array(SubmissionViewSchema));
  }

  standingsRaw(): Promise<APIResponse> {
    return this.req().get(`/api/contests/${this.contestId}/standings`);
  }

  async standings(): Promise<StandingsResponse> {
    return unwrap(await this.standingsRaw(), StandingsResponseSchema);
  }

  // --- team board ----------------------------------------------------------

  teamStandingsRaw(): Promise<APIResponse> {
    return this.req().get(`/api/contests/${this.contestId}/team-standings`);
  }

  async teamStandings(): Promise<TeamStandingsResponse> {
    return unwrap(await this.teamStandingsRaw(), TeamStandingsResponseSchema);
  }

  // --- teams ---------------------------------------------------------------

  createTeamRaw(body: { name: string }): Promise<APIResponse> {
    return this.req().post(`/api/contests/${this.contestId}/teams`, { data: body });
  }

  joinTeamRaw(body: { code: string }): Promise<APIResponse> {
    return this.req().post(`/api/contests/${this.contestId}/teams/join`, { data: body });
  }

  leaveTeamRaw(): Promise<APIResponse> {
    return this.req().post(`/api/contests/${this.contestId}/teams/leave`, { data: {} });
  }

  myTeamRaw(): Promise<APIResponse> {
    return this.req().get(`/api/contests/${this.contestId}/teams/mine`);
  }

  // --- admin: roster -------------------------------------------------------

  rosterRaw(): Promise<APIResponse> {
    return this.req().get(`/api/admin/contests/${this.contestId}/roster`);
  }

  createTeamAsAdminRaw(body: {
    name: string;
    /** The division this team fields for; omitted or null makes an open team. */
    divisionId?: string | null;
  }): Promise<APIResponse> {
    return this.req().post(`/api/admin/contests/${this.contestId}/teams`, { data: body });
  }

  moveParticipantRaw(body: {
    participantId: string;
    teamId: string | null;
    reason?: string;
    /** Set the division in the same move; omitted leaves it alone, null clears it. */
    divisionId?: string | null;
  }): Promise<APIResponse> {
    return this.req().post(`/api/admin/contests/${this.contestId}/roster/move`, { data: body });
  }

  /** My team's attempts on one GROUP problem. 404s on individual problems by design. */
  teamProblemFeedRaw(slug: string): Promise<APIResponse> {
    return this.req().get(
      `/api/contests/${this.contestId}/problems/${encodeURIComponent(slug)}/team-feed`,
    );
  }

  reassignSetRaw(body: {
    participantId: string;
    setId: string | null;
    reason?: string;
  }): Promise<APIResponse> {
    return this.req().post(`/api/admin/contests/${this.contestId}/roster/set`, { data: body });
  }

  renameTeamRaw(teamId: string, body: { name: string; reason?: string }): Promise<APIResponse> {
    return this.req().patch(`/api/admin/teams/${encodeURIComponent(teamId)}`, { data: body });
  }

  dissolveTeamRaw(teamId: string, body: { reason?: string }): Promise<APIResponse> {
    return this.req().delete(`/api/admin/teams/${encodeURIComponent(teamId)}`, { data: body });
  }

  // --- auth ----------------------------------------------------------------

  passwordLoginRaw(email: string, password: string): Promise<APIResponse> {
    return this.req().post("/api/auth/password", { data: { email, password } });
  }

  sessionRaw(): Promise<APIResponse> {
    return this.req().get("/api/auth/session");
  }

  signOutRaw(): Promise<APIResponse> {
    return this.req().delete("/api/auth/session");
  }

  oauthStartRaw(provider: "google" | "github"): Promise<APIResponse> {
    // `maxRedirects: 0` so the redirect itself is the assertion. Following it would send the test
    // to accounts.google.com, which is both slow and not our code.
    return this.req().get(`/api/auth/${provider}`, { maxRedirects: 0 });
  }

  // --- admin ---------------------------------------------------------------

  liveSessionsRaw(): Promise<APIResponse> {
    return this.req().get("/api/admin/sessions");
  }

  revokeSessionRaw(body: {
    sessionId?: string;
    participantId?: string;
    reason: string;
  }): Promise<APIResponse> {
    return this.req().post("/api/admin/sessions", { data: body });
  }

  assignSetsRaw(body: { reassign?: boolean; seed?: string } = {}): Promise<APIResponse> {
    return this.req().post(`/api/admin/contests/${this.contestId}/assign-sets`, { data: body });
  }

  planSetsRaw(body: {
    mode: "preview" | "apply";
    composition: SetCompositionInput;
    setCount: number;
    seed?: string;
    poolVersion?: string;
  }): Promise<APIResponse> {
    return this.req().post(`/api/admin/contests/${this.contestId}/sets`, { data: body });
  }

  reDeriveAssignmentRaw(): Promise<APIResponse> {
    return this.req().get(`/api/admin/contests/${this.contestId}/assign-sets`);
  }

  sideActivitiesRaw(teamId: string): Promise<APIResponse> {
    return this.req().get(`/api/admin/teams/${teamId}/side-activities`);
  }

  addSideActivityRaw(teamId: string, body: { label: string; points: number }): Promise<APIResponse> {
    return this.req().post(`/api/admin/teams/${teamId}/side-activities`, { data: body });
  }

  adminLoginRaw(passcode: string): Promise<APIResponse> {
    return this.req().post("/api/admin/session", { data: { passcode } });
  }

  async adminLogin(passcode: string): Promise<void> {
    await unwrap(await this.adminLoginRaw(passcode), z.object({ role: z.literal("ADMIN") }));
  }

  freezeRaw(frozen: boolean): Promise<APIResponse> {
    return this.req().post(`/api/admin/contests/${this.contestId}/freeze`, {
      data: { frozen },
    });
  }

  async freeze(frozen: boolean): Promise<{ frozen: boolean; state: string; freezeAt: string | null }> {
    return unwrap(
      await this.freezeRaw(frozen),
      z.object({
        contestId: z.string(),
        state: z.string(),
        frozen: z.boolean(),
        freezeAt: z.string().nullable(),
      }),
    );
  }

  consoleRaw(): Promise<APIResponse> {
    return this.req().get(`/api/admin/contests/${this.contestId}/console`);
  }

  rejudgeRaw(submissionId: string, reason: string): Promise<APIResponse> {
    return this.req().post(
      `/api/admin/submissions/${encodeURIComponent(submissionId)}/rejudge`,
      { data: { reason } },
    );
  }

  createContestRaw(body: {
    name: string;
    startsAt: string;
    endsAt: string;
    freezeAt: string | null;
    scoringPresetId: "classic" | "icpc";
    divisions: string[];
  }): Promise<APIResponse> {
    return this.req().post("/api/admin/contests", { data: body });
  }

  setContestProblemsRaw(
    contestId: string,
    body: {
      reason: string;
      problems: {
        problemId: string;
        slotLabel: string;
        basePoints: number;
        round: "INDIVIDUAL" | "GROUP";
        setLabel: string | null;
        divisionId: string | null;
      }[];
    },
  ): Promise<APIResponse> {
    return this.req().put(`/api/admin/contests/${contestId}/problems`, { data: body });
  }

  setContestStateRaw(contestId: string, state: string, reason: string): Promise<APIResponse> {
    return this.req().post(`/api/admin/contests/${contestId}/state`, { data: { state, reason } });
  }

  adminContestsRaw(): Promise<APIResponse> {
    return this.req().get("/api/admin/contests");
  }

  exportRaw(): Promise<APIResponse> {
    return this.req().get(`/api/admin/contests/${this.contestId}/export`);
  }

  overrideRaw(body: {
    submissionId: string;
    verdict: string;
    score: number;
    reason: string;
  }): Promise<APIResponse> {
    return this.req().post(`/api/admin/submissions/${encodeURIComponent(body.submissionId)}/override`, {
      data: body,
    });
  }
}

/**
 * The `Cookie` header for a context's session, for the one thing Playwright's request fixture
 * cannot do: read an open SSE stream (see `helpers/sse.ts`).
 */
export async function cookieHeader(context: APIRequestContext): Promise<string | null> {
  const state = await context.storageState();
  const cookies = state.cookies.filter((cookie) => cookie.name === "ptcn_session");
  if (cookies.length === 0) return null;
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

/** Poll a submission until the judge has ruled on it, or the deadline passes. */
export async function waitForVerdict(
  api: ContestApi,
  submissionId: string,
  timeoutMs: number,
  pollMs = 250,
): Promise<SubmissionView> {
  const deadline = Date.now() + timeoutMs;
  let last: SubmissionView | null = null;

  while (Date.now() < deadline) {
    last = await api.getSubmission(submissionId);
    if (last.verdict !== null) return last;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(
    `submission ${submissionId} had no verdict after ${timeoutMs} ms (last seen: ${JSON.stringify(last)}). ` +
      "The judge worker (npm run worker) and the Docker daemon must both be running for this spec.",
  );
}
