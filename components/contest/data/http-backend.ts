import { z } from "zod";

import {
  HintBalanceSchema,
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

import { ContestApiError, type ContestApi } from "./contest-api";
import {
  ApiEnvelopeSchema,
  SubmissionListSchema,
  type HintBalance,
  type JoinResponse,
  type RunSamplesResponse,
} from "./contract";

/**
 * The real backend, written against the frozen contract so the swap in `contest-api.ts` is
 * one line. **It has never been run** — `app/api/**` is owned by another agent and does not
 * exist in this worktree. Treat the route paths below as the UI's half of the contract, to
 * be reconciled at merge.
 *
 * Every response is parsed, never cast. The contract's whole point is that a hidden-test
 * leak is not expressible in `PublicTestResultSchema`; parsing rather than casting is what
 * makes that guarantee reach the client instead of stopping at the server.
 */

const ROUTES = {
  join: "/api/join",
  problems: "/api/problems",
  problem: (slug: string) => `/api/problems/${encodeURIComponent(slug)}`,
  runSamples: "/api/run-samples",
  submissions: "/api/submissions",
  submission: (id: string) => `/api/submissions/${encodeURIComponent(id)}`,
  submissionStream: (id: string) => `/api/submissions/${encodeURIComponent(id)}/stream`,
  standings: "/api/standings",
  hints: "/api/hints",
  hintBalance: (contestProblemId: string) =>
    `/api/hints?contestProblemId=${encodeURIComponent(contestProblemId)}`,
} as const;

async function request<T extends z.ZodType>(
  path: string,
  schema: T,
  init?: RequestInit,
): Promise<z.infer<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ContestApiError(
      "NETWORK",
      "Could not reach the contest server. Check the room's network and tell an organizer.",
    );
  }

  const body: unknown = await response.json().catch(() => null);
  const envelope = ApiEnvelopeSchema.safeParse(body);

  if (!envelope.success) {
    throw new ContestApiError(
      "MALFORMED_RESPONSE",
      "The server sent something this page could not read. Tell an organizer.",
    );
  }

  const { success, error, data } = envelope.data;
  if (!success || error !== null) {
    throw new ContestApiError(
      error?.code ?? "UNKNOWN",
      error?.message ?? "The contest server rejected that. Tell an organizer.",
    );
  }

  const payload = schema.safeParse(data);
  if (!payload.success) {
    throw new ContestApiError(
      "MALFORMED_RESPONSE",
      "The server sent something this page could not read. Tell an organizer.",
    );
  }
  return payload.data;
}

function post<T extends z.ZodType>(path: string, schema: T, payload: unknown) {
  return request(path, schema, { method: "POST", body: JSON.stringify(payload) });
}

export const httpContestApi: ContestApi = {
  label: "live server",

  join(request_: JoinRequest): Promise<JoinResponse> {
    return post(ROUTES.join, JoinResponseSchema, request_);
  },

  listProblems(): Promise<ProblemSummary[]> {
    return request(ROUTES.problems, z.array(ProblemSummarySchema));
  },

  getProblem(slug: string): Promise<ProblemDetail> {
    return request(ROUTES.problem(slug), ProblemDetailSchema);
  },

  runSamples(request_: SubmitRequest): Promise<RunSamplesResponse> {
    return post(ROUTES.runSamples, RunSamplesResponseSchema, request_);
  },

  submit(request_: SubmitRequest): Promise<SubmissionView> {
    return post(ROUTES.submissions, SubmissionViewSchema, request_);
  },

  getSubmission(submissionId: string): Promise<SubmissionView> {
    return request(ROUTES.submission(submissionId), SubmissionViewSchema);
  },

  listSubmissions(): Promise<SubmissionView[]> {
    return request(ROUTES.submissions, SubmissionListSchema);
  },

  getStandings(): Promise<StandingsResponse> {
    return request(ROUTES.standings, StandingsResponseSchema);
  },

  getHintBalance(contestProblemId: string): Promise<HintBalance> {
    return request(ROUTES.hintBalance(contestProblemId), HintBalanceSchema);
  },

  takeHint(contestProblemId: string): Promise<HintBalance> {
    return post(ROUTES.hints, HintBalanceSchema, { contestProblemId });
  },

  verdictStreamUrl(submissionId: string): string {
    return ROUTES.submissionStream(submissionId);
  },
};
