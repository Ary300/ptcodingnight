import { randomInt } from "node:crypto";

import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { RateLimiter, clientKey, hasTrustedProxy, type RateLimitRule } from "@/lib/contest/rate-limit";
import { invalidateScoringInput } from "@/lib/contest/standings";
import type { Viewer } from "@/lib/contest/viewer";

/**
 * Guest entry to the practice arena: try the editor and the judge before the night, with no code.
 *
 * ## Why this exists
 *
 * Students have no accounts (the organizer's instruction, 2026-11-15), so the slip's join code is
 * the only way in, and a slip names a seat in a real contest. The arena (`scripts/seed-practice.ts`)
 * was reachable only through an account sign-in that no longer exists. The teacher wants students
 * familiar with the interface before the night, so a guest door mints a throwaway participant
 * IN THE ARENA and nowhere else.
 *
 * ## Why a guest can never reach a real roster or board
 *
 * The participant row is created with the arena's `contestId`, and a `Participant` belongs to
 * exactly one contest. Every roster, standings and team query is scoped by `contestId`, so there is
 * no path by which "Guest 4821" is counted in, or even visible from, a scored contest. No team, no
 * division, no join code: the arena deals no sets and has nothing to assign.
 */

/** What a guest is called. Four digits, so the arena's board can tell two guests apart. */
export const GUEST_NAME_PREFIX = "Guest";

/** Attempts at a four-digit name before widening to six. */
const FOUR_DIGIT_ATTEMPTS = 8;
/** Attempts at a six-digit name, after which the start is refused rather than looped. */
const SIX_DIGIT_ATTEMPTS = 4;

/** `Guest 0042`: zero-padded so every guest name has the same width on a board. */
export function guestDisplayName(digits: number, draw: (max: number) => number = randomInt): string {
  const max = 10 ** digits;
  return `${GUEST_NAME_PREFIX} ${String(draw(max)).padStart(digits, "0")}`;
}

/**
 * What a start request does, given who is already signed in on this browser.
 *
 * Pure, so the policy is a unit test rather than a database fixture.
 *
 *  - **anonymous**: create a guest.
 *  - **already in the arena**: reuse that session. A second press of the button, or a student who
 *    comes back the next day, must not mint a new participant every time; that would also be the
 *    cheapest way to fill the arena with rows.
 *  - **signed in to a real contest**: refuse, and say what to do. Replacing the cookie would sign
 *    the student out of the night's contest without a word, and sending them to that contest
 *    instead would show a student who pressed "Try practice problems" a scored contest, which is
 *    the one confusion the PRACTICE chip exists to prevent.
 *  - **organizer**: refuse for the same reason; the console would vanish on the next page load.
 */
export type PracticeStartPlan =
  | { readonly kind: "create" }
  | { readonly kind: "reuse"; readonly displayName: string }
  | { readonly kind: "refuse-contest" }
  | { readonly kind: "refuse-organizer" };

export function planPracticeStart(
  viewer: Viewer,
  viewerContestIsPractice: boolean | null,
): PracticeStartPlan {
  if (viewer.kind === "anonymous") return { kind: "create" };
  if (viewer.kind === "admin") return { kind: "refuse-organizer" };
  if (viewerContestIsPractice === true) return { kind: "reuse", displayName: viewer.displayName };
  return { kind: "refuse-contest" };
}

export function refusalMessage(plan: PracticeStartPlan, contestName: string | null): string {
  if (plan.kind === "refuse-organizer") {
    return "You are signed in as an organizer. Sign out first, then try practice problems.";
  }
  const where = contestName === null ? "a contest" : contestName;
  return (
    `You are signed in to ${where}. Sign out from the menu on the contest page first, then try ` +
    "practice problems. The code on your slip signs you back in."
  );
}

/* ------------------------------------------------------------------------ */
/* Throttling                                                                */
/* ------------------------------------------------------------------------ */

/**
 * Starts per client address, enforced only behind a trusted proxy.
 *
 * A school NATs a whole building to one public address, so every student in a classroom shares
 * this bucket. Fifty students pressing the button once each, some twice, must all get in; 150 in
 * ten minutes holds a full room three times over while still cutting a script from unlimited rows
 * to fifteen a minute.
 *
 * Without a trusted proxy `clientKey` returns the constant "direct" (Next does not expose the
 * socket address), and a per-client limit on a constant key is a limit on the whole site. So this
 * one is only applied when it can actually tell clients apart, the same rule `hasTrustedProxy`
 * documents for the join limiter.
 */
export const PRACTICE_START_PER_CLIENT_RULE: RateLimitRule = { limit: 150, windowMs: 600_000 };

/**
 * A ceiling across every client, applied always.
 *
 * The backstop for a host with no proxy in front, and for an attacker spread across addresses.
 * Hitting it can only stop new GUESTS for a few minutes: the join-code door, every existing
 * session and the night's contest share none of this state. Sized far above a school's
 * worth of first visits in ten minutes.
 */
export const PRACTICE_START_GLOBAL_RULE: RateLimitRule = { limit: 1000, windowMs: 600_000 };

const perClientLimiter = new RateLimiter(PRACTICE_START_PER_CLIENT_RULE);
const globalLimiter = new RateLimiter(PRACTICE_START_GLOBAL_RULE);

const THROTTLED_MESSAGE =
  "Too many practice sessions were started from this network just now. Wait a few minutes and " +
  "try again, or ask an organizer.";

/** Throws `RATE_LIMITED` when this start would exceed either budget. Only CREATES are counted. */
export function throttlePracticeStart(request: Request, now: Date): void {
  if (hasTrustedProxy()) {
    perClientLimiter.consumeOrThrow(clientKey(request), now, THROTTLED_MESSAGE);
  }
  globalLimiter.consumeOrThrow("all", now, THROTTLED_MESSAGE);
}

/* ------------------------------------------------------------------------ */
/* Database                                                                  */
/* ------------------------------------------------------------------------ */

export interface PracticeArena {
  readonly id: string;
  readonly name: string;
}

const NO_ARENA_MESSAGE =
  "Practice problems are not set up on this site yet. Ask an organizer to open the practice arena.";

/**
 * The arena a guest is put in.
 *
 * `isPractice` should be true on exactly one row, but nothing in the schema enforces "exactly",
 * and a stale rehearsal copy is the likely second one. So the choice is deterministic rather than
 * whatever order Postgres returns: an arena whose window is open now, the oldest first, which is
 * the permanent one `scripts/seed-practice.ts` made.
 */
export async function findPracticeArena(now: Date): Promise<PracticeArena> {
  const arena = await prisma.contest.findFirst({
    where: {
      isPractice: true,
      state: "RUNNING",
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
  if (arena === null) throw new DomainError("NOT_FOUND", NO_ARENA_MESSAGE);
  return arena;
}

/** Whether a contest is the arena, and its name, for the refusal message. */
export async function contestFacts(
  contestId: string,
): Promise<{ readonly isPractice: boolean; readonly name: string } | null> {
  return prisma.contest.findUnique({
    where: { id: contestId },
    select: { isPractice: true, name: true },
  });
}

function isUniqueClash(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export interface GuestParticipant {
  readonly participantId: string;
  readonly displayName: string;
  readonly contestId: string;
}

/**
 * Create a guest participant in the arena.
 *
 * `(contestId, displayName)` is unique, and the index is the arbiter: a pre-flight SELECT would
 * read "free" for two guests who drew the same digits at the same instant. Four digits first,
 * because "Guest 4821" is the name the teacher asked for; six once four keeps colliding, which
 * only happens once the arena holds thousands of guests.
 */
export async function createGuestParticipant(arenaId: string): Promise<GuestParticipant> {
  const plan = [
    ...Array.from({ length: FOUR_DIGIT_ATTEMPTS }, () => 4),
    ...Array.from({ length: SIX_DIGIT_ATTEMPTS }, () => 6),
  ];
  for (const digits of plan) {
    const displayName = guestDisplayName(digits);
    try {
      const row = await prisma.participant.create({
        data: { contestId: arenaId, displayName, teamId: null, userId: null },
        select: { id: true },
      });
      // The arena's board is cached per contest; a new row must not wait out the cache to appear.
      invalidateScoringInput(arenaId);
      return { participantId: row.id, displayName, contestId: arenaId };
    } catch (error: unknown) {
      if (!isUniqueClash(error)) throw error;
    }
  }
  throw new DomainError(
    "CONFLICT",
    "Could not pick a free guest name after several tries. Press the button again.",
  );
}
