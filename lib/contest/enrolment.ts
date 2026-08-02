import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { lockContestMutations } from "@/lib/contest/locks";
import { invalidateScoringInput } from "@/lib/contest/standings";

/**
 * Put a signed-in account into the contest the organizer is running, with no team.
 *
 * ## Why signing in enrols you
 *
 * Team membership is decided in exactly one place — the organizer's roster — so a student who has
 * signed up has to be VISIBLE there before anyone can put them anywhere. Without this, a student
 * signs in successfully, sees an empty contest, and the organizer's roster shows nobody: two
 * screens both quietly wrong, and no error anywhere to explain it.
 *
 * The `Participant` row is the thing the roster lists, so signing in creates it. `teamId` stays
 * null, which is precisely what "unassigned" means to `adminRoster`.
 *
 * ## Why a participant with no team is a safe thing to create
 *
 * A participant on no team contributes to no team score — team size is the divisor and they are
 * in nobody's divisor. So enrolling early cannot move a number. The admin roster shows them at
 * the top of the screen exactly because they are not being counted yet.
 */
export interface Enrolment {
  readonly contestId: string;
  readonly participantId: string;
  /** False when the participant row already existed — a returning student, not a new one. */
  readonly created: boolean;
}

/**
 * How an enrollable contest is chosen when there is more than one.
 *
 * A contest whose real window contains `now` beats one that has not started, always. The clock is
 * checked as well as the state: a future contest accidentally marked RUNNING is not running for a
 * student yet and must not steal their sign-in.
 *
 * FROZEN sits between RUNNING and SCHEDULED because a frozen contest is a running one with the
 * public board held still: `assertCanJoin` in gate.ts treats it as joinable, and a student
 * arriving late during a freeze belongs in the contest the room is in.
 */
const STATE_PRIORITY: Readonly<
  Record<"RUNNING" | "FROZEN" | "SCHEDULED", number>
> = {
  RUNNING: 0,
  FROZEN: 1,
  SCHEDULED: 2,
};

/**
 * The states a student may be signed into. ENDED and ARCHIVED are absent: a finished contest is
 * read-only history, and landing a sign-in there is what "I could not add anybody to the new
 * contest" looked like from the student's side.
 */
const SIGN_IN_STATES = ["SCHEDULED", "RUNNING", "FROZEN"] as const;

/** One contest a given user could be signed into, with the facts the ranking is built from. */
export interface ContestChoice {
  readonly contestId: string;
  readonly name: string;
  readonly state: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** True when a `Participant` row for this user already exists in this contest. */
  readonly alreadyParticipant: boolean;
  /** True when `startsAt <= now < endsAt`. */
  readonly containsNow: boolean;
  /** True when `endsAt` is already behind us, whatever the state column says. */
  readonly windowClosed: boolean;
}

/**
 * Every contest this user could sign into, best first.
 *
 * ## The rule, and why it is in this order
 *
 * A `Participant` row belongs to exactly one contest, and a session carries exactly one
 * `contestId`. Something has to decide which. Before this, that decision ignored the user
 * completely — it looked only at contest state — so a student an organizer had just put on a team
 * in a new contest signed in and landed somewhere else entirely, saw "This contest has not started
 * yet", and had a second `Participant` minted for them in the wrong contest. That is the student
 * half of the same defect as "I could not add anybody from the demo to Test2".
 *
 * Ranked ascending on:
 *
 *  1. **The real window contains now.** State alone is not sufficient. This prevents a future
 *     RUNNING/FROZEN row, usually left behind by a rehearsal or manual edit, from winning over the
 *     event happening in the room.
 *  2. **The user is already a participant.** Within the same clock phase, the organizer's roster
 *     decision beats an unrelated contest.
 *  3. **State priority.** RUNNING, then FROZEN, then SCHEDULED.
 *  4. **Start time.** The closest upcoming SCHEDULED contest wins, rather than the event furthest
 *     in the future.
 *
 * The list is returned whole rather than reduced to a winner because a student can legitimately be
 * a participant of two open contests at once, and in that case the choice is theirs to make rather
 * than ours to guess. `ensureEnrolled` takes the head; a chooser reads the rest.
 */
export async function contestsForUser(
  userId: string | null,
  now: Date = new Date(),
): Promise<ContestChoice[]> {
  const contests = await prisma.contest.findMany({
    where: {
      state: { in: [...SIGN_IN_STATES] },
      endsAt: { gt: now },
      OR: [
        // Published contests remain available before their start so an organizer can build the
        // roster and a returning student can reach the pre-start lobby.
        { state: "SCHEDULED" },
        // A live-looking state cannot overrule the clock. Excluding these malformed/future rows
        // here is stronger than merely sorting them later: `ensureEnrolled` cannot choose one.
        { state: { in: ["RUNNING", "FROZEN"] }, startsAt: { lte: now } },
      ],
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, state: true, startsAt: true, endsAt: true },
  });

  const mine =
    userId === null
      ? new Set<string>()
      : new Set(
          (
            await prisma.participant.findMany({
              where: { userId, contestId: { in: contests.map((c) => c.id) } },
              select: { contestId: true },
            })
          ).map((row) => row.contestId),
        );

  const choices: ContestChoice[] = contests.map((contest) => ({
    contestId: contest.id,
    name: contest.name,
    state: contest.state,
    startsAt: contest.startsAt,
    endsAt: contest.endsAt,
    alreadyParticipant: mine.has(contest.id),
    containsNow:
      contest.startsAt.getTime() <= now.getTime() &&
      now.getTime() < contest.endsAt.getTime(),
    windowClosed: contest.endsAt.getTime() <= now.getTime(),
  }));

  // Sorted on a copy: `Array.prototype.sort` mutates, and these rows are the query's, not ours.
  return [...choices].sort((a, b) => {
    const byWindow = Number(b.containsNow) - Number(a.containsNow);
    if (byWindow !== 0) return byWindow;

    const byMine = Number(b.alreadyParticipant) - Number(a.alreadyParticipant);
    if (byMine !== 0) return byMine;

    const byState =
      STATE_PRIORITY[a.state as keyof typeof STATE_PRIORITY] -
      STATE_PRIORITY[b.state as keyof typeof STATE_PRIORITY];
    if (byState !== 0) return byState;

    // For live ties, prefer the event that started most recently. For future SCHEDULED ties,
    // prefer the one that starts next rather than the furthest-away draft calendar entry.
    return a.containsNow
      ? b.startsAt.getTime() - a.startsAt.getTime()
      : a.startsAt.getTime() - b.startsAt.getTime();
  });
}

/**
 * Idempotent. A student who signs in twice is one participant, not two.
 *
 * Keyed on `(contestId, userId)` rather than on the display name: names are editable by an
 * organizer, and re-running this after a rename must not mint a second participant that competes
 * against the first for the same person's submissions.
 *
 * Returns null when there is nothing to enrol anyone in, and its callers must SAY so rather than
 * sign the student in anyway: a session with no participantId authorizes as nobody.
 */
export async function ensureEnrolled(
  userId: string,
  displayName: string,
  now?: Date,
): Promise<Enrolment | null> {
  const choiceNow = now ?? new Date();
  const choices = await contestsForUser(userId, choiceNow);
  const best = choices[0];
  if (best === undefined) return null;

  const enrolment = await prisma.$transaction(async (tx) => {
    // Freeze, lifecycle, roster and sign-in writes share one ordering point. In particular, a
    // participant created after a freeze receives a joinedAt after its cutoff and remains hidden
    // from the frozen public board until the reveal.
    await lockContestMutations(tx, best.contestId);
    const effectiveNow = now ?? new Date();

    const [contest, existing] = await Promise.all([
      tx.contest.findUnique({
        where: { id: best.contestId },
        select: { state: true, startsAt: true, endsAt: true },
      }),
      tx.participant.findUnique({
        where: { contestId_userId: { contestId: best.contestId, userId } },
        select: { id: true },
      }),
    ]);
    if (existing !== null) {
      return {
        contestId: best.contestId,
        participantId: existing.id,
        created: false,
      };
    }

    // The contest may have ended while this callback waited for the lock. Do not mint a new row
    // into history after the choice query has gone stale.
    const stillOpen =
      contest !== null &&
      contest.endsAt.getTime() > effectiveNow.getTime() &&
      (contest.state === "SCHEDULED" ||
        ((contest.state === "RUNNING" || contest.state === "FROZEN") &&
          contest.startsAt.getTime() <= effectiveNow.getTime()));
    if (!stillOpen) return null;

    // Both the provider callback and a browser retry can reach this branch at once. The advisory
    // lock serializes them; the database keys remain the final authority for retries from older
    // processes during a rolling deploy.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const displayNameForAttempt = await uniqueDisplayNameWith(
        tx,
        best.contestId,
        displayName,
      );
      const inserted = await tx.participant.createMany({
        data: [
          {
            contestId: best.contestId,
            userId,
            displayName: displayNameForAttempt,
            // No team. The organizer assigns it from the roster, and that is the only place it happens.
            teamId: null,
          },
        ],
        skipDuplicates: true,
      });
      const enrolled = await tx.participant.findUnique({
        where: { contestId_userId: { contestId: best.contestId, userId } },
        select: { id: true },
      });
      if (enrolled !== null) {
        return {
          contestId: best.contestId,
          participantId: enrolled.id,
          created: inserted.count === 1,
        };
      }
    }
    throw new Error(
      "Could not choose a unique participant name after repeated concurrent sign-ins",
    );
  });

  if (enrolment?.created === true) invalidateScoringInput(enrolment.contestId);
  return enrolment;
}

/**
 * `Participant` is unique on `(contestId, displayName)`, and two students really can share a name.
 *
 * The constraint exists so a leaderboard never shows two indistinguishable rows, which is worth
 * keeping — but it must not turn "a second Alex Chen signed up" into a failed sign-in.
 *
 * Exported because the organizer creates participants too now (`adminAddParticipant` in
 * `lib/contest/teams.ts`). A second copy of this rule would be a second answer to the question
 * "what happens when two Alex Chens are in one contest", and the two copies would diverge.
 *
 * Suffixing
 * is ugly and visible, which is the point: an organizer renames them from the roster, and until
 * they do, the room can still tell the two apart.
 */
export async function uniqueDisplayName(
  contestId: string,
  wanted: string,
): Promise<string> {
  return uniqueDisplayNameWith(prisma, contestId, wanted);
}

type ParticipantNameReader = Pick<Prisma.TransactionClient, "participant">;

async function uniqueDisplayNameWith(
  db: ParticipantNameReader,
  contestId: string,
  wanted: string,
): Promise<string> {
  const base = wanted.trim().slice(0, 40) || "Competitor";

  const taken = await db.participant.findMany({
    where: { contestId, displayName: { startsWith: base } },
    select: { displayName: true },
  });
  const names = new Set(taken.map((row) => row.displayName));
  if (!names.has(base)) return base;

  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base} (${String(n)})`;
    if (!names.has(candidate)) return candidate;
  }
  // Ninety-nine people share a name. Fall back to something that cannot collide rather than
  // failing the sign-in of the hundredth.
  return `${base} (${String(Date.now())})`;
}
