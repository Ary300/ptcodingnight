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
 */
const STATE_PRIORITY: Readonly<Record<"RUNNING" | "SCHEDULED" | "DRAFT", number>> = {
  RUNNING: 0,
  SCHEDULED: 1,
  DRAFT: 2,
};

/**
 * The contest an organizer is currently running, or null.
 *
 * DRAFT and SCHEDULED are included, unlike the projector's version of this query. The roster is
 * built BEFORE the contest starts — that is the whole point of it — so enrolling only into a
 * RUNNING contest would mean nobody appears until the moment it is too late to organise them.
 *
 * Null means "there is nothing to enrol anyone in", and its callers must SAY so rather than sign
 * the student in anyway: a session with no participantId authorizes as nobody.
 */
async function enrollableContestId(now: Date = new Date()): Promise<string | null> {
  const contests = await prisma.contest.findMany({
    where: { state: { in: ["DRAFT", "SCHEDULED", "RUNNING"] } },
    orderBy: { startsAt: "desc" },
    select: { id: true, state: true, startsAt: true, endsAt: true },
  });

  /*
    A CONTEST WHOSE WINDOW CONTAINS NOW WINS, before anything else.

    State priority alone was not enough. Two contests can be RUNNING at the same time — a rehearsal
    left open, last year's board never ended, a seeded demo beside the real thing — and the tie was
    broken by `startsAt desc`, which picks the one created most recently rather than the one
    happening. Observed: a student signed in and was enrolled into a contest that had already
    ended, while the contest in the room went on without them; and the same ordering elsewhere put
    a contest starting in nineteen days on the projector, showing "LIVE" and a 472-hour clock.

    "Is it on right now" is a fact about the clock, not about a column, and it is the question a
    student signing in is actually asking. State priority still decides among contests that are all
    equally in or out of their window — which is the DRAFT/SCHEDULED case the roster is built in,
    before any window has opened.
  */
  const containsNow = (c: { startsAt: Date; endsAt: Date }): boolean =>
    c.startsAt.getTime() <= now.getTime() && now.getTime() < c.endsAt.getTime();

  // Sorted on a copy: `Array.prototype.sort` mutates, and the rows are the query's, not ours.
  // The sort is stable, so `startsAt desc` still decides ties inside a rank.
  const ranked = [...contests].sort((a, b) => {
    const byWindow = Number(containsNow(b)) - Number(containsNow(a));
    if (byWindow !== 0) return byWindow;
    return (
      STATE_PRIORITY[a.state as keyof typeof STATE_PRIORITY] -
      STATE_PRIORITY[b.state as keyof typeof STATE_PRIORITY]
    );
  });

  return ranked[0]?.id ?? null;
}

/**
 * Idempotent. A student who signs in twice is one participant, not two.
 *
 * Keyed on `(contestId, userId)` rather than on the display name: names are editable by an
 * organizer, and re-running this after a rename must not mint a second participant that competes
 * against the first for the same person's submissions.
 */
export async function ensureEnrolled(
  userId: string,
  displayName: string,
): Promise<Enrolment | null> {
  const contestId = await enrollableContestId();
  if (contestId === null) return null;

  const existing = await prisma.participant.findFirst({
    where: { contestId, userId },
    select: { id: true },
  });
  if (existing !== null) {
    return { contestId, participantId: existing.id, created: false };
  }

  const created = await prisma.participant.create({
    data: {
      contestId,
      userId,
      displayName: await uniqueDisplayName(contestId, displayName),
      // No team. The organizer assigns it from the roster, and that is the only place it happens.
      teamId: null,
    },
    select: { id: true },
  });

  return { contestId, participantId: created.id, created: true };
}

/**
 * `Participant` is unique on `(contestId, displayName)`, and two students really can share a name.
 *
 * The constraint exists so a leaderboard never shows two indistinguishable rows, which is worth
 * keeping — but it must not turn "a second Alex Chen signed up" into a failed sign-in. Suffixing
 * is ugly and visible, which is the point: an organizer renames them from the roster, and until
 * they do, the room can still tell the two apart.
 */
async function uniqueDisplayName(contestId: string, wanted: string): Promise<string> {
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
