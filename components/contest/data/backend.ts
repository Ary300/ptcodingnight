import type { ContestApi } from "./contest-api";
import { httpContestApi } from "./http-backend";
import { stubContestApi } from "./stub-backend";

/**
 * ==================== THE SWAP ====================
 *
 * One line decides whether the competitor UI talks to the real API or to the in-memory stub.
 *
 * **This used to default to the stub, and that default outlived its reason.** It was written when
 * `app/api/**` was owned by another agent and did not exist in this worktree. It exists now, it is
 * covered by G7, and the deployment is a public domain — so an unset variable meant a *deployed*
 * contest would have served invented data to a room full of students. The banner would have said
 * so, which is the only reason this was survivable, but "the failure is legible" is not the same
 * as "the failure does not happen".
 *
 * The default is therefore the real API, and the stub is opt-in with
 * `NEXT_PUBLIC_CONTEST_BACKEND=stub`. Getting it wrong now costs a design review its fake data,
 * rather than costing a contest its scores.
 * =================================================
 */

const BACKEND = process.env.NEXT_PUBLIC_CONTEST_BACKEND;

export const contestApi: ContestApi = BACKEND === "stub" ? stubContestApi : httpContestApi;

/** True when the screen is showing invented data. Rendered, not just logged. */
export const isStubBackend = contestApi === stubContestApi;

export { ContestApiError, errorMessageOf, type ContestApi } from "./contest-api";
