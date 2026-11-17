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
/** The refusal for a submit after the window. Matched exactly by the retry path in submissions.ts. */
export const CONTEST_OVER_MESSAGE = "This contest is over";

export function assertCanSubmit(contest: ContestGateInput, now: Date): void {
  // A published contest that has not opened says so in the words a student can act on. "Not
  // accepting submissions" read like a fault, five minutes before the start, to a student whose
  // lobby already showed the problem list.
  if (contest.state === "SCHEDULED" || contest.state === "DRAFT") {
    throw new DomainError("CONTEST_NOT_RUNNING", "This contest has not started yet");
  }
  // The same sentence whether the clock or an organizer ended it, and whichever request noticed.
  if (contest.state === "ENDED" || contest.state === "ARCHIVED") {
    throw new DomainError("CONTEST_NOT_RUNNING", CONTEST_OVER_MESSAGE);
  }
  if (!SUBMITTABLE.includes(contest.state)) {
    throw new DomainError("CONTEST_NOT_RUNNING", "This contest is not accepting submissions");
  }
  if (now.getTime() < contest.startsAt.getTime()) {
    throw new DomainError("CONTEST_NOT_RUNNING", "This contest has not started yet");
  }
  if (now.getTime() > contest.endsAt.getTime()) {
    throw new DomainError("CONTEST_NOT_RUNNING", CONTEST_OVER_MESSAGE);
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

/** The part of a `ContestProblem` row that decides when it opens. */
export interface UnlockRowInput {
  readonly round: "INDIVIDUAL" | "GROUP";
  readonly unlockAt: Date | null;
}

/** The part of a contest row that decides when its GROUP questions open. */
export interface UnlockContestInput {
  readonly startsAt: Date;
  readonly groupUnlockMinutes: number | null;
}

/**
 * When this row actually opens, given the contest it sits in.
 *
 * Two clocks can hold a row shut. The row's own `unlockAt` applies to any round. The contest's
 * `groupUnlockMinutes` applies to GROUP rows only: the night opens with an individual stretch and
 * the team questions follow, so a GROUP row opens at `startsAt + groupUnlockMinutes` or at its own
 * `unlockAt`, whichever is LATER. An INDIVIDUAL row never hears about the group clock.
 *
 * The contest column is the single source of truth. Nothing writes the derived instant back into
 * the rows, so starting the contest early or moving its window re-derives every opening from here
 * rather than leaving twenty stale timestamps behind.
 */
export function effectiveUnlockAt(row: UnlockRowInput, contest: UnlockContestInput): Date | null {
  if (row.round !== "GROUP" || contest.groupUnlockMinutes === null) return row.unlockAt;

  const groupOpensAt = new Date(contest.startsAt.getTime() + contest.groupUnlockMinutes * 60_000);
  if (row.unlockAt === null) return groupOpensAt;
  return row.unlockAt.getTime() > groupOpensAt.getTime() ? row.unlockAt : groupOpensAt;
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
 * Should the CLOCK end this contest now?
 *
 * The window says yes once `endsAt` has passed and the contest is still live. The one exception is
 * a contest whose public board is frozen: the organizer froze it (or scheduled the freeze) so the
 * finish is played without knowing who is winning, and ending it would make `isPublicBoardFrozen`
 * false and paint the final board on the projector with nobody at the front. On Coding Night the
 * freeze fires at 8:00, submissions close at 8:15 (`assertCanSubmit` checks the window on its own,
 * whatever the state), Kahoot points are entered at 8:35, and the reveal is the organizer's press
 * of "Unfreeze and reveal", which is what ends a past-end contest (`setFrozen`). So a frozen board
 * is left to the organizer, and an unfrozen one ends on the clock as it always did.
 */
export function clockShouldEnd(contest: ContestGateInput, now: Date): boolean {
  if (contest.state !== "RUNNING" && contest.state !== "FROZEN") return false;
  if (now.getTime() < contest.endsAt.getTime()) return false;
  return !isPublicBoardFrozen(contest, now);
}

/** What End contest writes to a contest row. */
export interface EndNowPlan {
  readonly state: ContestState;
  readonly endsAt: Date;
  readonly freezeAt: Date | null;
  /** True when the board stays frozen and only submissions closed. */
  readonly boardStaysFrozen: boolean;
}

/**
 * What End contest does to a contest row, by any path: the Setup tab's button, the API, or the
 * clock.
 *
 * Ending closes submissions by pulling `endsAt` back to now. On an UNFROZEN board it also sets
 * ENDED, which is what makes the final standings public. On a FROZEN board it must not: an ENDED
 * contest's board is never frozen (`isPublicBoardFrozen`), so ending a frozen contest used to put
 * the final standings, post-freeze points included, on the projector and every student screen the
 * moment the organizer pressed End, with the Kahoot points still unentered. The night runs end,
 * enter the side points, then reveal. So a frozen contest keeps its state and its cutoff, only the
 * window closes, and "Unfreeze and reveal" (`setFrozen`) is what ends it. This is the rule
 * `clockShouldEnd` already applies to the clock.
 */
export function planEndNow(contest: ContestGateInput, now: Date): EndNowPlan {
  const endsAt = contest.endsAt.getTime() > now.getTime() ? now : contest.endsAt;
  const live = contest.state === "RUNNING" || contest.state === "FROZEN";
  if (live && isPublicBoardFrozen(contest, now)) {
    return { state: contest.state, endsAt, freezeAt: contest.freezeAt, boardStaysFrozen: true };
  }
  // A freeze that never happened before the early end is erased rather than left dangling after
  // the contest's own end.
  const freezeAt =
    contest.freezeAt !== null && contest.freezeAt.getTime() > now.getTime()
      ? null
      : contest.freezeAt;
  return { state: "ENDED", endsAt, freezeAt, boardStaysFrozen: false };
}

/**
 * Why a roster or team change is refused while the public board is frozen.
 *
 * It used to say "Unfreeze it before changing teams", which on the night tells the organizer to
 * spoil the reveal to fix a seat. The change is locked, and it can wait until after the reveal.
 * Exported so the Teams page can say the same thing BEFORE the organizer opens the move form.
 */
export const FROZEN_ROSTER_MESSAGE =
  "Team moves and roster changes are locked while the public board is frozen, because they would change the frozen standings. Make them after the reveal.";

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
      FROZEN_ROSTER_MESSAGE,
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
