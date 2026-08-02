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

/**
 * The problem LIST is visible from the moment a contest is published, not from the moment it
 * starts.
 *
 * SCHEDULED used to be missing here, and one predicate served both the list and the statement. So a
 * student an organizer had just put on a team opened the lobby before the start and got a bare red
 * line, "This contest has not started yet", with a Try again link and nothing else, while the
 * standings panel beside it rendered their name perfectly well. An empty screen is
 * indistinguishable from a broken one, and that is what they reported.
 *
 * What is visible before the start is deliberately thin: how many problems there are, their slots
 * and their points. See `redactUnstartedProblem` in lib/contest/problems.ts for what is withheld
 * and why.
 */
const LISTABLE: readonly ContestState[] = ["SCHEDULED", "RUNNING", "FROZEN", "ENDED"];

/**
 * A STATEMENT is readable only once the contest is under way, and afterwards for review.
 *
 * This is the half that must NOT relax. The statement, the constraints and the samples are the
 * problem; handing them out early hands out a head start.
 */
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

/** May this viewer see that the problems EXIST: their count, slots and points. */
export function assertCanListProblems(state: ContestState): void {
  if (!LISTABLE.includes(state)) {
    throw new DomainError(
      "CONTEST_NOT_RUNNING",
      state === "DRAFT"
        ? "This contest has not been published yet. An organizer still has to open it."
        : "This contest is not available.",
    );
  }
}

/** The part of a contest row needed to decide whether statements are available. */
export type ProblemReadGateInput = Pick<ContestGateInput, "state" | "startsAt">;

/** May this viewer read a problem's STATEMENT. Strictly narrower than listing. */
export function assertCanReadProblems(contest: ProblemReadGateInput, now: Date): void {
  if (!READABLE.includes(contest.state)) {
    throw new DomainError("CONTEST_NOT_RUNNING", "This contest has not started yet");
  }
  // State can become inconsistent with the scheduled window after a manual database edit or a
  // partial deployment. The problem statement is valuable contest material, so the clock must
  // independently agree that the start has happened.
  if (now.getTime() < contest.startsAt.getTime()) {
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
 * Refuse a mutation whose result is part of the public standings payload while its cutoff is
 * frozen or after its final reveal. Score events may continue during a freeze and are replayed
 * temporally; roster/team identity has no temporal history, so changing it would rewrite the
 * frozen board itself. Final results are immutable for the same reason.
 */
export function assertCanMutateStandingsInputs(contest: ContestGateInput, now: Date): void {
  if (contest.state === "ENDED" || contest.state === "ARCHIVED") {
    throw new DomainError(
      "CONFLICT",
      "This contest is over. Teams and roster membership cannot rewrite its final standings.",
    );
  }
  if (isPublicBoardFrozen(contest, now)) {
    throw new DomainError(
      "CONFLICT",
      "The public board is frozen. Unfreeze it before changing teams or roster membership.",
    );
  }
}

/**
 * The instant the public board reflects: the freeze point while frozen, otherwise now.
 * This is the value handed to `computeStandings` as `upTo`, and `null` means "everything".
 */
export function standingsCutoff(contest: ContestGateInput, now: Date, admin: boolean): Date | null {
  if (admin) return null;
  return isPublicBoardFrozen(contest, now) ? contest.freezeAt : null;
}
