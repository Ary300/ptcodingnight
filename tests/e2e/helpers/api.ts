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
  type JoinRequest,
  type ProblemDetail,
  type ProblemSummary,
  type StandingsResponse,
  type SubmissionView,
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

  // --- admin ---------------------------------------------------------------

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
