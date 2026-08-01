import { prisma } from "@/lib/db";

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
 * A RUNNING contest beats one that has not started, always. Ordering by `startsAt` alone — which
 * is what this did — picks the contest that starts FURTHEST IN THE FUTURE, so the moment an
 * organizer drafts next month's Coding Night, every student signing in tonight is enrolled in next
 * month's instead. Nothing errors. They land on a contest with no problems published, the roster
 * for tonight shows nobody, and the only visible symptom is two screens that are quietly empty —
 * the same signature as the "site looked dead" failure, from a different cause.
 *
 * FROZEN sits between RUNNING and SCHEDULED because a frozen contest is a running one with the
 * public board held still: `assertCanJoin` in gate.ts treats it as joinable, and a student
 * arriving late during a freeze belongs in the contest the room is in.
 */
const STATE_PRIORITY: Readonly<Record<"RUNNING" | "FROZEN" | "SCHEDULED" | "DRAFT", number>> = {
  RUNNING: 0,
  FROZEN: 1,
  SCHEDULED: 2,
  DRAFT: 3,
};

/**
 * The states a student may be signed into. ENDED and ARCHIVED are absent: a finished contest is
 * read-only history, and landing a sign-in there is what "I could not add anybody to the new
 * contest" looked like from the student's side.
 */
const SIGN_IN_STATES = ["DRAFT", "SCHEDULED", "RUNNING", "FROZEN"] as const;

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
 *  1. **A contest whose window has already closed is a last resort.** `endsAt` in the past is a
 *     fact about the clock that no state column can contradict: a contest left in DRAFT or
 *     SCHEDULED with last month's window is abandoned, not upcoming. Without this key, being on
 *     an abandoned contest's roster would outrank tonight's contest forever.
 *  2. **A contest this user is ALREADY a participant of.** Being on a roster is an organizer's
 *     explicit decision about this person; state and clock are ambient facts about the room. The
 *     explicit decision wins. This is the key that fixes the reported bug.
 *  3. **A contest whose window contains now.** The old first key, and it still decides every case
 *     it was introduced for — a student signing in for the first time is a participant of nothing,
 *     so key 2 is a tie for them and this one takes over. Two contests can be RUNNING at once (a
 *     rehearsal left open, last year's board never ended, the seeded demo beside the real thing)
 *     and "is it on right now" is the question a student signing in is actually asking.
 *  4. **State priority**, which orders contests that are equally in or out of their window — the
 *     DRAFT/SCHEDULED case the roster is built in, before any window has opened.
 *  5. `startsAt desc`, inherited from the query and preserved by a stable sort.
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
    where: { state: { in: [...SIGN_IN_STATES] } },
    orderBy: { startsAt: "desc" },
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
      contest.startsAt.getTime() <= now.getTime() && now.getTime() < contest.endsAt.getTime(),
    windowClosed: contest.endsAt.getTime() <= now.getTime(),
  }));

  // Sorted on a copy: `Array.prototype.sort` mutates, and these rows are the query's, not ours.
  // The sort is stable, so `startsAt desc` still decides ties inside a rank.
  return [...choices].sort((a, b) => {
    const byClosed = Number(a.windowClosed) - Number(b.windowClosed);
    if (byClosed !== 0) return byClosed;

    const byMine = Number(b.alreadyParticipant) - Number(a.alreadyParticipant);
    if (byMine !== 0) return byMine;

    const byWindow = Number(b.containsNow) - Number(a.containsNow);
    if (byWindow !== 0) return byWindow;

    return (
      STATE_PRIORITY[a.state as keyof typeof STATE_PRIORITY] -
      STATE_PRIORITY[b.state as keyof typeof STATE_PRIORITY]
    );
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
  now: Date = new Date(),
): Promise<Enrolment | null> {
  const choices = await contestsForUser(userId, now);
  const best = choices[0];
  if (best === undefined) return null;

  const existing = await prisma.participant.findFirst({
    where: { contestId: best.contestId, userId },
    select: { id: true },
  });
  if (existing !== null) {
    return { contestId: best.contestId, participantId: existing.id, created: false };
  }

  const created = await prisma.participant.create({
    data: {
      contestId: best.contestId,
      userId,
      displayName: await uniqueDisplayName(best.contestId, displayName),
      // No team. The organizer assigns it from the roster, and that is the only place it happens.
      teamId: null,
    },
    select: { id: true },
  });

  return { contestId: best.contestId, participantId: created.id, created: true };
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
export async function uniqueDisplayName(contestId: string, wanted: string): Promise<string> {
  const base = wanted.trim().slice(0, 40) || "Competitor";

  const taken = await prisma.participant.findMany({
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
