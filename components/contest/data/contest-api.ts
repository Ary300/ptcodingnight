import type {
  ProblemDetail,
  ProblemSummary,
  StandingsResponse,
  SubmissionView,
  SubmitRequest,
} from "@/lib/schemas/api";

import type { HintBalance, RunSamplesResponse } from "./contract";

/**
 * The one seam between the competitor UI and the server.
 *
 * The API is being written in parallel and does not exist in this worktree, so the UI is
 * built against the frozen contract in `lib/schemas/api.ts` and wired to a stub. Swapping
 * to the real backend is the single `export const contestApi = ...` line at the bottom of
 * this file — every component imports `contestApi` and nothing else.
 *
 * NOTHING IN THIS UI HAS BEEN RUN END TO END AGAINST A REAL SERVER.
 */

export interface ContestApi {
  /** A human label for the active backend, rendered in the UI so a stub is never mistaken
   *  for the real thing. */
  readonly label: string;

  listProblems(): Promise<ProblemSummary[]>;
  getProblem(slug: string): Promise<ProblemDetail>;

  /** Free and unjudged — never creates a Submission (PRD §9.1). */
  runSamples(request: SubmitRequest): Promise<RunSamplesResponse>;
  /** Judged, counts against the score. */
  submit(request: SubmitRequest): Promise<SubmissionView>;

  getSubmission(submissionId: string): Promise<SubmissionView>;
  listSubmissions(): Promise<SubmissionView[]>;

  getStandings(): Promise<StandingsResponse>;

  getHintBalance(contestProblemId: string): Promise<HintBalance>;
  takeHint(contestProblemId: string): Promise<HintBalance>;

  /**
   * SSE endpoint for live verdicts, or `null` when this backend cannot stream. Returning
   * `null` is what drives the documented polling fallback (PRD §10) — the fallback is not
   * an error path, it is a supported mode, so it must be reachable without breaking
   * anything.
   */
  verdictStreamUrl(submissionId: string): string | null;
}

/** Thrown by any backend when a call fails. Carries the contract's error code. */
export class ContestApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ContestApiError";
    this.code = code;
  }
}

export function errorMessageOf(error: unknown): string {
  if (error instanceof ContestApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Try again, and tell an organizer if it keeps happening.";
}
