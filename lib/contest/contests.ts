import { randomUUID } from "node:crypto";

import { NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/db";

import type { AdminContestList } from "@/lib/schemas/api";

/**
 * Enumerating contests for an organizer.
 *
 * Nothing here decides which contest is "current" — that concept does not exist in this
 * application, on purpose. This returns the list; the organizer picks. The only opinion it holds
 * is the ORDER, newest first, because the contest an organizer wants is almost always the one
 * about to run.
 */

/**
 * Every contest, with the two counts that let an organizer tell them apart.
 *
 * Counted with `_count` rather than by loading rows: the roster of a real contest is 40–60
 * participants and this is a picker, not the roster screen.
 *
 * Both counts are derived on every read and never stored. `teamCount` in particular is one field
 * away from a stored team SIZE, which is the mistake this codebase is most careful about — team
 * size is the divisor in every team score, so a count that drifts from its rows is a wrong result
 * rather than a stale label.
 */
export async function listContestsForAdmin(): Promise<AdminContestList> {
  const rows = await prisma.contest.findMany({
    orderBy: [{ startsAt: "desc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      state: true,
      startsAt: true,
      endsAt: true,
      _count: { select: { participants: true, teams: true } },
    },
  });

  return {
    contests: rows.map((row) => ({
      contestId: row.id,
      name: row.name,
      state: row.state,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      participantCount: row._count.participants,
      teamCount: row._count.teams,
    })),
  };
}

/**
 * A contest's name, for a screen that has its id and needs to say which contest it is showing.
 *
 * Returns null rather than throwing on a missing contest: the caller is a page rendering a
 * contest id out of a URL somebody may have edited, and a 500 is the wrong answer to "that
 * contest does not exist".
 */
export async function contestNameFor(contestId: string): Promise<string | null> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: { name: true },
  });
  return contest?.name ?? null;
}

/**
 * Create a contest, with its divisions, in one transaction.
 *
 * ## Why this did not exist
 *
 * `ContestBuilder` validated a draft and then did nothing with it — its submit handler carried the
 * comment *"No route to call yet."* So the organizer's first job, the one every other screen
 * depends on, could only be done by running a seed script. A contest that can only be created by
 * `npx tsx` is a contest an organizer cannot create.
 *
 * ## It is born DRAFT, deliberately
 *
 * `Contest.state` defaults to `DRAFT` and this does not override it. A contest appears the moment
 * it is created — in the pickers, in the roster screens — and if creating it also published it,
 * then a half-configured contest with no problems in it would be visible to students between the
 * two clicks. Publishing is a separate, deliberate act.
 *
 * ## The join code is generated and never shown
 *
 * `Contest.joinCode` is `@unique` and non-null in the schema, so a row cannot be written without
 * one. Nothing can be done with it — there is no join route — so it is filled with a random value
 * here rather than asked for. Removing the column is a migration and a separate piece of work; the
 * point for now is that no organizer is ever prompted for a credential that does nothing.
 */
export async function createContest(input: {
  readonly name: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly freezeAt: Date | null;
  readonly scoringPresetId: string;
  readonly divisionNames: readonly string[];
}): Promise<{ contestId: string }> {
  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    throw new ValidationError("The contest must end after it starts");
  }
  if (
    input.freezeAt !== null &&
    (input.freezeAt.getTime() <= input.startsAt.getTime() ||
      input.freezeAt.getTime() > input.endsAt.getTime())
  ) {
    throw new ValidationError("Freeze must fall inside the contest window");
  }

  const names = input.divisionNames.map((n) => n.trim()).filter((n) => n !== "");
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
    throw new ValidationError("Two divisions have the same name");
  }

  const contest = await prisma.contest.create({
    data: {
      name: input.name.trim(),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      freezeAt: input.freezeAt,
      // The engine's ids, not the form's. `lib/contest/standings.ts` maps anything that is not
      // "icpc" onto the classic preset, and writing the form's short id here would silently score
      // an ICPC contest with classic rules.
      scoringPresetId: input.scoringPresetId === "icpc" ? "icpc" : "coding-night-classic",
      joinCode: randomJoinCode(),
      divisions: {
        create: names.map((name, index) => ({ name, sortOrder: index })),
      },
    },
    select: { id: true },
  });

  return { contestId: contest.id };
}

/**
 * A value for the non-null unique column, not a credential.
 *
 * `randomUUID` rather than a readable alphabet: a code that looks typable invites somebody to try
 * typing it, and there is nowhere to type it.
 */
function randomJoinCode(): string {
  return `unused-${randomUUID()}`;
}

/**
 * Put problems into a contest, and give it its problem sets.
 *
 * ## The gap this fills
 *
 * A contest created through the builder was a dead end: no route wrote `ContestProblem`, so the
 * only contests that could ever be competed in were the ones `scripts/seed-demo.ts` wrote. An
 * organizer could create a contest and then had no way to put a single problem in it.
 *
 * ## Sets are created here, not chosen
 *
 * A `ProblemSet` is a contest-scoped label ("A", "B"). Each individual problem names the set it
 * belongs to and the set is created on demand, because a set with no problems in it is not a
 * thing an organizer needs to manage separately — it is an artifact of the layout.
 *
 * A problem with `set: null` is a GROUP problem: every team works it regardless of assignment.
 *
 * ## Replace, not append
 *
 * Called twice with overlapping problems, this must not produce duplicate slots. `ContestProblem`
 * is unique on `(contestId, problemId, divisionId)`, so an append would throw on the second call
 * and leave the contest half-updated. It rewrites the contest's problem list instead, which is
 * also what an organizer means by "here is the line-up".
 *
 * Refused once the contest has started. Adding a problem mid-round changes what is scoreable
 * underneath submissions that already exist, and removing one orphans them.
 */
export async function setContestProblems(
  contestId: string,
  entries: readonly {
    readonly problemId: string;
    readonly slotLabel: string;
    readonly basePoints: number;
    readonly setLabel: string | null;
    readonly divisionId: string | null;
  }[],
): Promise<{ count: number }> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: { state: true },
  });
  if (contest === null) throw new NotFoundError("Contest");
  if (contest.state !== "DRAFT" && contest.state !== "SCHEDULED") {
    throw new ValidationError(
      "This contest has already started. Changing its problems now would move the ground under " +
        "submissions that already exist.",
    );
  }

  if (new Set(entries.map((e) => e.problemId)).size !== entries.length) {
    throw new ValidationError("The same problem appears twice in this line-up");
  }

  return prisma.$transaction(async (tx) => {
    await tx.contestProblem.deleteMany({ where: { contestId } });

    // Sets first, because every problem row needs its id. `upsert` rather than `create`: a
    // previous call may have made them, and the unique key is (contestId, label).
    const setIds = new Map<string, string>();
    for (const label of new Set(entries.map((e) => e.setLabel).filter((l): l is string => l !== null))) {
      const set = await tx.problemSet.upsert({
        where: { contestId_label: { contestId, label } },
        create: { contestId, label },
        update: {},
        select: { id: true },
      });
      setIds.set(label, set.id);
    }

    await tx.contestProblem.createMany({
      data: entries.map((entry) => ({
        contestId,
        problemId: entry.problemId,
        divisionId: entry.divisionId,
        setId: entry.setLabel === null ? null : (setIds.get(entry.setLabel) ?? null),
        slotLabel: entry.slotLabel,
        basePoints: entry.basePoints,
      })),
    });

    return { count: entries.length };
  });
}

/**
 * Move a contest through its lifecycle.
 *
 * The transitions an organizer actually makes, and nothing else:
 *   DRAFT -> SCHEDULED   publish it; students can see it exists, and enter once it starts
 *   SCHEDULED -> RUNNING open it now, regardless of the clock (the rehearsal case)
 *   RUNNING -> ENDED     stop it early
 *
 * FROZEN is deliberately absent: freezing is `setFrozen`, it is reversible, and it belongs to the
 * live console rather than to a lifecycle dropdown. Two ways to reach one state is how a board
 * ends up frozen with nothing able to unfreeze it.
 *
 * **Publishing refuses a contest with no problems.** A published contest with an empty line-up is
 * the failure that looks exactly like a working one: students sign in, see nothing, and conclude
 * the platform is broken. It is far better to refuse here, where an organizer can read why.
 */
export async function setContestState(
  contestId: string,
  next: "SCHEDULED" | "RUNNING" | "ENDED",
  now: Date = new Date(),
): Promise<{ state: string }> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: {
      state: true,
      startsAt: true,
      endsAt: true,
      freezeAt: true,
      _count: { select: { contestProblems: true } },
    },
  });
  if (contest === null) throw new NotFoundError("Contest");

  if (next !== "ENDED" && contest._count.contestProblems === 0) {
    throw new ValidationError(
      "This contest has no problems in it yet. Add the line-up before publishing, or students " +
        "will sign in to an empty screen.",
    );
  }

  const allowed: Record<string, readonly string[]> = {
    DRAFT: ["SCHEDULED", "RUNNING"],
    SCHEDULED: ["RUNNING", "ENDED"],
    RUNNING: ["ENDED"],
    FROZEN: ["ENDED"],
    ENDED: [],
    ARCHIVED: [],
  };
  if (!(allowed[contest.state] ?? []).includes(next)) {
    throw new ValidationError(`A ${contest.state} contest cannot become ${next}`);
  }

  /*
    STARTING A CONTEST MOVES ITS CLOCK, or the button is a lie.

    This function's own doc comment always promised "open it now, regardless of the clock", but it
    wrote only the state column. So an organizer who pressed Start at 6:50 on a contest scheduled
    for 7:00 produced state=RUNNING with startsAt still in the future, and the two halves of the
    product read different columns: the problem list keys on state and showed everything, while
    `assertCanSubmit` keys on the window and answered every submission "This contest has not
    started yet" — the organizer's report, verbatim, reproduced against a RUNNING contest.

    So: starting early slides the WHOLE window by the same delta. The duration is what the
    organizer planned ("start the contest to give everyone all the time"); the start time is when
    they pressed the button. freezeAt is part of the window and slides with it — a freeze offset
    is a decision about the last N minutes, not about a wall-clock time of day.

    Ending early pulls endsAt back to now for the same invariant, stated once: THE STORED WINDOW
    DESCRIBES WHAT ACTUALLY HAPPENED. Scoring cutoffs and the review lobby both read it.
    A freeze that never happened before the early end is erased rather than left dangling after
    the contest's own end.
  */
  const window: { startsAt?: Date; endsAt?: Date; freezeAt?: Date | null } = {};
  if (next === "RUNNING" && contest.startsAt.getTime() > now.getTime()) {
    const slide = contest.startsAt.getTime() - now.getTime();
    window.startsAt = now;
    window.endsAt = new Date(contest.endsAt.getTime() - slide);
    if (contest.freezeAt !== null) window.freezeAt = new Date(contest.freezeAt.getTime() - slide);
  }
  if (next === "ENDED" && contest.endsAt.getTime() > now.getTime()) {
    window.endsAt = now;
    if (contest.freezeAt !== null && contest.freezeAt.getTime() > now.getTime()) {
      window.freezeAt = null;
    }
  }

  const updated = await prisma.contest.update({
    where: { id: contestId },
    data: { state: next, ...window },
    select: { state: true },
  });
  return { state: updated.state };
}
