import type { APIRequestContext, APIResponse } from "@playwright/test";
import { z } from "zod";

import {
  ApiErrorSchema,
  JoinResponseSchema,
  ProblemDetailSchema,
  ProblemSummarySchema,
  RunSamplesResponseSchema,
  StandingsResponseSchema,
  SubmissionViewSchema,
  TeamStandingsResponseSchema,
  type JoinRequest,
  type ProblemDetail,
  type ProblemSummary,
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
  constructor(
    private readonly request: APIRequestContext,
    readonly contestId: string,
  ) {}

  join(body: JoinRequest): Promise<APIResponse> {
    return this.request.post(`/api/contests/${this.contestId}/join`, { data: body });
  }

  async joinOrThrow(body: JoinRequest): Promise<z.infer<typeof JoinResponseSchema>> {
    return unwrap(await this.join(body), JoinResponseSchema);
  }

  async listProblems(): Promise<ProblemSummary[]> {
    const response = await this.request.get(`/api/contests/${this.contestId}/problems`);
    return unwrap(response, z.array(ProblemSummarySchema));
  }

  getProblemRaw(slug: string): Promise<APIResponse> {
    return this.request.get(
      `/api/contests/${this.contestId}/problems/${encodeURIComponent(slug)}`,
    );
  }

  async getProblem(slug: string): Promise<ProblemDetail> {
    return unwrap(await this.getProblemRaw(slug), ProblemDetailSchema);
  }

  runSamplesRaw(body: SubmitRequest): Promise<APIResponse> {
    return this.request.post("/api/run-samples", { data: body });
  }

  async runSamples(body: SubmitRequest): Promise<z.infer<typeof RunSamplesResponseSchema>> {
    return unwrap(await this.runSamplesRaw(body), RunSamplesResponseSchema);
  }

  submitRaw(body: SubmitRequest): Promise<APIResponse> {
    return this.request.post("/api/submissions", { data: body });
  }

  async submit(body: SubmitRequest): Promise<SubmissionView> {
    return unwrap(await this.submitRaw(body), SubmissionViewSchema);
  }

  getSubmissionRaw(submissionId: string): Promise<APIResponse> {
    return this.request.get(`/api/submissions/${encodeURIComponent(submissionId)}`);
  }

  async getSubmission(submissionId: string): Promise<SubmissionView> {
    return unwrap(await this.getSubmissionRaw(submissionId), SubmissionViewSchema);
  }

  async listMySubmissions(): Promise<SubmissionView[]> {
    const response = await this.request.get("/api/submissions");
    return unwrap(response, z.array(SubmissionViewSchema));
  }

  standingsRaw(): Promise<APIResponse> {
    return this.request.get(`/api/contests/${this.contestId}/standings`);
  }

  async standings(): Promise<StandingsResponse> {
    return unwrap(await this.standingsRaw(), StandingsResponseSchema);
  }

  // --- team board ----------------------------------------------------------

  teamStandingsRaw(): Promise<APIResponse> {
    return this.request.get(`/api/contests/${this.contestId}/team-standings`);
  }

  async teamStandings(): Promise<TeamStandingsResponse> {
    return unwrap(await this.teamStandingsRaw(), TeamStandingsResponseSchema);
  }

  // --- auth ----------------------------------------------------------------

  passwordLoginRaw(email: string, password: string): Promise<APIResponse> {
    return this.request.post("/api/auth/password", { data: { email, password } });
  }

  sessionRaw(): Promise<APIResponse> {
    return this.request.get("/api/auth/session");
  }

  signOutRaw(): Promise<APIResponse> {
    return this.request.delete("/api/auth/session");
  }

  oauthStartRaw(provider: "google" | "github"): Promise<APIResponse> {
    // `maxRedirects: 0` so the redirect itself is the assertion. Following it would send the test
    // to accounts.google.com, which is both slow and not our code.
    return this.request.get(`/api/auth/${provider}`, { maxRedirects: 0 });
  }

  // --- admin ---------------------------------------------------------------

  liveSessionsRaw(): Promise<APIResponse> {
    return this.request.get("/api/admin/sessions");
  }

  revokeSessionRaw(body: {
    sessionId?: string;
    participantId?: string;
    reason: string;
  }): Promise<APIResponse> {
    return this.request.post("/api/admin/sessions", { data: body });
  }

  assignSetsRaw(body: { reassign?: boolean; seed?: string } = {}): Promise<APIResponse> {
    return this.request.post(`/api/admin/contests/${this.contestId}/assign-sets`, { data: body });
  }

  reDeriveAssignmentRaw(): Promise<APIResponse> {
    return this.request.get(`/api/admin/contests/${this.contestId}/assign-sets`);
  }

  sideActivitiesRaw(teamId: string): Promise<APIResponse> {
    return this.request.get(`/api/admin/teams/${teamId}/side-activities`);
  }

  addSideActivityRaw(teamId: string, body: { label: string; points: number }): Promise<APIResponse> {
    return this.request.post(`/api/admin/teams/${teamId}/side-activities`, { data: body });
  }

  adminLoginRaw(passcode: string): Promise<APIResponse> {
    return this.request.post("/api/admin/session", { data: { passcode } });
  }

  async adminLogin(passcode: string): Promise<void> {
    await unwrap(await this.adminLoginRaw(passcode), z.object({ role: z.literal("ADMIN") }));
  }

  freezeRaw(frozen: boolean): Promise<APIResponse> {
    return this.request.post(`/api/admin/contests/${this.contestId}/freeze`, {
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

  exportRaw(): Promise<APIResponse> {
    return this.request.get(`/api/admin/contests/${this.contestId}/export`);
  }

  overrideRaw(body: {
    submissionId: string;
    verdict: string;
    score: number;
    reason: string;
  }): Promise<APIResponse> {
    return this.request.post(`/api/admin/submissions/${encodeURIComponent(body.submissionId)}/override`, {
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
