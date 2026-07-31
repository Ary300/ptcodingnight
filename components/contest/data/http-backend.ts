import { z } from "zod";

import {
  API_ROUTES,
  ProblemDetailSchema,
  ProblemSummarySchema,
  RunSamplesResponseSchema,
  StandingsResponseSchema,
  SubmissionViewSchema,
  type ProblemDetail,
  type ProblemSummary,
  type StandingsResponse,
  type SubmissionView,
  type SubmitRequest,
} from "@/lib/schemas/api";

import { ContestApiError, type ContestApi } from "./contest-api";
import { readParticipant } from "./participant";
import {
  ApiEnvelopeSchema,
  SubmissionListSchema,
  type HintBalance,
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

/**
 * Resolve the contest this client is in.
 *
 * Every route is contest-scoped (see `API_ROUTES` in lib/schemas/api.ts),
 * because `Contest` is a first-class entity with history and a flat path would need an
 * implicit "current contest" — hidden state that breaks the moment an organizer opens last
 * year's board. The id arrives in the join response and is stored with the participant.
 */
function currentContestId(): string {
  const participant = readParticipant();
  if (participant === null) {
    throw new ContestApiError(
      "NOT_JOINED",
      "You are not in a contest yet. Join with the code from the board.",
    );
  }
  return participant.contestId;
}

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

  /**
   * `async`, and that keyword is load-bearing on every method that calls `currentContestId()`.
   *
   * Without it the not-joined throw is **synchronous**, so it escapes the caller's rejection
   * handling entirely — `useResource` passes `load()` to a `.then(onFulfilled, onRejected)` pair,
   * and a function that throws before returning a promise never reaches `onRejected`. The error
   * went straight past the three states that screen is written to draw and took the React tree
   * with it.
   *
   * That made `/join` unusable against the real API: `CompetitorChrome` wraps the whole route
   * group and reads standings, so the one page a student reaches *before* joining crashed with
   * "This page couldn't load". It was invisible only because the UI defaulted to the stub.
   *
   * A contract method must reject, never throw.
   */
  async listProblems(): Promise<ProblemSummary[]> {
    return request(API_ROUTES.problems(currentContestId()), z.array(ProblemSummarySchema));
  },

  async getProblem(slug: string): Promise<ProblemDetail> {
    return request(API_ROUTES.problem(currentContestId(), slug), ProblemDetailSchema);
  },

  runSamples(request_: SubmitRequest): Promise<RunSamplesResponse> {
    return post(API_ROUTES.runSamples, RunSamplesResponseSchema, request_);
  },

  submit(request_: SubmitRequest): Promise<SubmissionView> {
    return post(API_ROUTES.submissions, SubmissionViewSchema, request_);
  },

  getSubmission(submissionId: string): Promise<SubmissionView> {
    return request(API_ROUTES.submission(submissionId), SubmissionViewSchema);
  },

  listSubmissions(): Promise<SubmissionView[]> {
    return request(API_ROUTES.submissions, SubmissionListSchema);
  },

  async getStandings(): Promise<StandingsResponse> {
    return request(API_ROUTES.standings(currentContestId()), StandingsResponseSchema);
  },

  // No hint route exists, by design rather than omission. docs/TODO.md T1: the PRD prices
  // hints precisely — two warmups earn one, each costs 15% of base points — but never says
  // what a hint CONTAINS, and no field in the schema holds hint text. There is nothing for a
  // handler to return. Failing with a readable message beats calling a path that cannot
  // exist and reporting the 404 as a bug.
  getHintBalance(): Promise<HintBalance> {
    return Promise.reject(
      new ContestApiError("NOT_IMPLEMENTED", "Hints are not available yet."),
    );
  },

  takeHint(): Promise<HintBalance> {
    return Promise.reject(
      new ContestApiError("NOT_IMPLEMENTED", "Hints are not available yet."),
    );
  },

  verdictStreamUrl(): string | null {
    // One contest-level stream carries verdicts, standings and contest state, rather than
    // a socket per submission — 40 students each holding an EventSource is 40 open
    // connections for the same firehose.
    //
    // Null rather than a throw when there is no contest to stream. This is called **during
    // render** (`useVerdictStream`), where a throw is not an error state a component can draw —
    // it is a crashed tree. The contract already allows null, and the caller already reads it as
    // "fall back to polling", which is the correct behaviour for a client that cannot open a
    // stream.
    if (readParticipant() === null) return null;
    return API_ROUTES.stream(currentContestId());
  },
};
