import type { ContestApi } from "./contest-api";
import { httpContestApi } from "./http-backend";
import { stubContestApi } from "./stub-backend";

/**
 * ==================== THE SWAP ====================
 *
 * One line decides whether the competitor UI talks to the real API or to the in-memory
 * stub. `app/api/**` is owned by another agent and does not exist in this worktree, so the
 * default is the stub and every screen renders `contestApi.label` so that is never
 * invisible.
 *
 * To go live: set `NEXT_PUBLIC_CONTEST_BACKEND=http`, or delete the branch below.
 * `httpContestApi` is already written against the frozen contract in `lib/schemas/api.ts`.
 * =================================================
 */

const BACKEND = process.env.NEXT_PUBLIC_CONTEST_BACKEND;

export const contestApi: ContestApi = BACKEND === "http" ? httpContestApi : stubContestApi;

/** True when the screen is showing invented data. Rendered, not just logged. */
export const isStubBackend = contestApi === stubContestApi;

export { ContestApiError, errorMessageOf, type ContestApi } from "./contest-api";
