import type { ContestState, ProblemState } from "@prisma/client";

import { DomainError, DraftProblemError, ForbiddenError } from "@/lib/errors";

/**
 * Contest and problem gating.
 *
 * Pure predicates over state and a clock that is always passed in, so every rule below is a
 * unit test rather than a thing you have to run a contest to find out about.
 *
 * The rule this file exists for: **a DRAFT problem cannot enter a live contest, and that is
 * enforced here in the API rather than in the admin UI** (docs/PRD.md §8). The UI check is
 * the one that gets bypassed.
 */

/** Joining is open while a contest is scheduled or under way — never once it has ended. */
const JOINABLE: readonly ContestState[] = ["SCHEDULED", "RUNNING", "FROZEN"];

/** Problems are readable while the contest runs, and afterwards for review. */
const READABLE: readonly ContestState[] = ["RUNNING", "FROZEN", "ENDED"];

/** Judged submissions are accepted only while the clock is running. A freeze does not stop it. */
const SUBMITTABLE: readonly ContestState[] = ["RUNNING", "FROZEN"];

export interface ContestGateInput {
  readonly state: ContestState;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly freezeAt: Date | null;
}

export function assertCanJoin(state: ContestState): void {
  if (!JOINABLE.includes(state)) {
    throw new DomainError("CONTEST_NOT_RUNNING", "This contest is not open for joining");
  }
}

export function assertCanReadProblems(state: ContestState): void {
  if (!READABLE.includes(state)) {
    throw new DomainError("CONTEST_NOT_RUNNING", "This contest has not started yet");
  }
}

/**
 * Submissions are accepted between `startsAt` and `endsAt` inclusive. Both bounds are checked
 * against the clock the caller supplies — a contest left in `RUNNING` past its end time still
 * refuses work, so a forgotten state transition cannot extend the night.
 */
export function assertCanSubmit(contest: ContestGateInput, now: Date): void {
  if (!SUBMITTABLE.includes(contest.state)) {
    throw new DomainError("CONTEST_NOT_RUNNING", "This contest is not accepting submissions");
  }
  if (now.getTime() < contest.startsAt.getTime()) {
    throw new DomainError("CONTEST_NOT_RUNNING", "This contest has not started yet");
  }
  if (now.getTime() > contest.endsAt.getTime()) {
    throw new DomainError("CONTEST_NOT_RUNNING", "This contest is over");
  }
}

/**
 * The DRAFT gate. `PUBLISHED` is the only state a competitor may reach: `DRAFT` has no
 * original statement or own test data yet (PRD §8), and `RETIRED` was deliberately withdrawn.
 */
export function assertProblemIsLive(state: ProblemState, slug: string): void {
  if (state === "DRAFT") throw new DraftProblemError(slug);
  if (state !== "PUBLISHED") {
    throw new DomainError("PROBLEM_IS_DRAFT", `Problem "${slug}" is not available`);
  }
}

export function isProblemLive(state: ProblemState): boolean {
  return state === "PUBLISHED";
}

export function isUnlocked(unlockAt: Date | null, now: Date): boolean {
  return unlockAt === null || now.getTime() >= unlockAt.getTime();
}

export function assertUnlocked(unlockAt: Date | null, now: Date, slug: string): void {
  if (!isUnlocked(unlockAt, now)) {
    throw new ForbiddenError(`Problem "${slug}" has not unlocked yet`);
  }
}

/**
 * Is the **public** board frozen?
 *
 * Two ways in: an organizer pressed freeze (`state = FROZEN`), or the configured `freezeAt`
 * has passed while the contest is still live. One way out, and it is not a clock: once a
 * contest is `ENDED` the board is the final board, which is what makes the unfreeze reveal
 * land (PRD §6.3).
 *
 * The admin view never consults this — `computeStandings` is called with `upTo: null` for an
 * organizer regardless.
 */
export function isPublicBoardFrozen(contest: ContestGateInput, now: Date): boolean {
  if (contest.state === "ENDED" || contest.state === "ARCHIVED") return false;
  if (contest.state === "FROZEN") return true;
  if (contest.freezeAt === null) return false;
  if (contest.state !== "RUNNING" && contest.state !== "SCHEDULED") return false;
  return now.getTime() >= contest.freezeAt.getTime();
}

/**
 * The instant the public board reflects: the freeze point while frozen, otherwise now.
 * This is the value handed to `computeStandings` as `upTo`, and `null` means "everything".
 */
export function standingsCutoff(contest: ContestGateInput, now: Date, admin: boolean): Date | null {
  if (admin) return null;
  return isPublicBoardFrozen(contest, now) ? contest.freezeAt : null;
}
