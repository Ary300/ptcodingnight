import { randomUUID } from "node:crypto";

import { NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { lockContestMutations, lockProblemMutations } from "@/lib/contest/locks";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/contest/audit";

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
 * The caller names the round explicitly. A GROUP problem has no set and every team works it;
 * an INDIVIDUAL problem names the shared set assigned to one teammate.
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
    readonly round: "INDIVIDUAL" | "GROUP";
    readonly setLabel: string | null;
    readonly divisionId: string | null;
  }[],
  audit: { readonly actor: string; readonly reason: string },
): Promise<{ count: number }> {
  const normalized = entries.map((entry) => ({
    ...entry,
    slotLabel: entry.slotLabel.trim(),
    setLabel: entry.setLabel?.trim() ?? null,
  }));

  const entryKeys = normalized.map(
    (entry) => `${entry.problemId}\u0000${entry.divisionId ?? ""}`,
  );
  if (new Set(entryKeys).size !== entryKeys.length) {
    throw new ValidationError(
      "The same problem appears twice for the same division in this line-up",
    );
  }

  const slotKeys = normalized.map((entry) => entry.slotLabel.toLowerCase());
  if (slotKeys.some((label) => label === "") || new Set(slotKeys).size !== slotKeys.length) {
    throw new ValidationError("Every problem needs its own unique slot label");
  }

  for (const entry of normalized) {
    if (entry.round === "GROUP" && entry.setLabel !== null) {
      throw new ValidationError("A group question cannot belong to an individual set");
    }
    if (entry.round === "INDIVIDUAL" && entry.setLabel === null) {
      throw new ValidationError("An individual question needs a set");
    }
  }

  const problemIds = [...new Set(normalized.map((entry) => entry.problemId))].sort();

  return prisma.$transaction(async (tx) => {
    // Problem locks come first everywhere. This makes a line-up replacement and a concurrent
    // edit/delete one ordered decision rather than a preflight check followed by a race.
    for (const problemId of problemIds) await lockProblemMutations(tx, problemId);
    await lockContestMutations(tx, contestId);

    const contest = await tx.contest.findUnique({
      where: { id: contestId },
      select: {
        state: true,
        problemSets: { select: { label: true } },
      },
    });
    if (contest === null) throw new NotFoundError("Contest");
    if (contest.state !== "DRAFT" && contest.state !== "SCHEDULED") {
      throw new ValidationError(
        "This contest has already started. Changing its problems now would move the ground under " +
          "submissions that already exist.",
      );
    }

    const foundProblems = await tx.problem.findMany({
      where: { id: { in: problemIds } },
      select: { id: true },
    });
    if (foundProblems.length !== problemIds.length) {
      throw new ValidationError("One of those problems no longer exists in the problem bank");
    }

    const divisionIds = [
      ...new Set(
        normalized.flatMap((entry) =>
          entry.divisionId === null ? [] : [entry.divisionId],
        ),
      ),
    ];
    if (divisionIds.length > 0) {
      const ownedDivisions = await tx.division.count({
        where: { contestId, id: { in: divisionIds } },
      });
      if (ownedDivisions !== divisionIds.length) {
        throw new ValidationError("One of those divisions belongs to a different contest");
      }
    }

    await tx.contestProblem.deleteMany({ where: { contestId } });

    // Sets first, because every problem row needs its id. `upsert` rather than `create`: a
    // previous call may have made them, and the unique key is (contestId, label).
    const labels = new Set(
      normalized
        .map((entry) => entry.setLabel)
        .filter((label): label is string => label !== null),
    );
    const setIds = new Map<string, string>();
    for (const label of labels) {
      const set = await tx.problemSet.upsert({
        where: { contestId_label: { contestId, label } },
        create: { contestId, label },
        update: {},
        select: { id: true },
      });
      setIds.set(label, set.id);
    }

    // A PUT replaces the line-up, including its set columns. Keeping an old ProblemSet row would
    // let assignment hand somebody a set with no questions in it. Deleting it is safe and honest:
    // `Participant.chosenSetId` uses SetNull, so the organizer sees that assignment must be run
    // again instead of carrying a ghost column into the contest.
    await tx.problemSet.deleteMany({
      where:
        labels.size === 0
          ? { contestId }
          : { contestId, label: { notIn: [...labels] } },
    });

    const previousLabels = new Set(contest.problemSets.map((set) => set.label));
    const labelsChanged =
      previousLabels.size !== labels.size ||
      [...labels].some((label) => !previousLabels.has(label));
    if (labelsChanged) {
      // Assignment is a seeded function of the available set ids. Once that input changes, the
      // old seed no longer explains the stored result. Clearing it also makes the setup screen's
      // first-run assignment button a real repair path instead of a guaranteed conflict.
      await tx.contest.update({
        where: { id: contestId },
        data: { setAssignmentSeed: null },
      });
    }

    await tx.contestProblem.createMany({
      data: normalized.map((entry) => ({
        contestId,
        problemId: entry.problemId,
        divisionId: entry.divisionId,
        round: entry.round,
        setId: entry.setLabel === null ? null : (setIds.get(entry.setLabel) ?? null),
        slotLabel: entry.slotLabel,
        basePoints: entry.basePoints,
      })),
    });

    await writeAudit(
      {
        actor: audit.actor,
        action: AUDIT_ACTIONS.contestProblemsSet,
        entity: `Contest:${contestId}`,
        after: {
          count: normalized.length,
          slots: normalized.map((entry) => entry.slotLabel).join(", "),
        },
        reason: audit.reason,
      },
      tx,
    );

    return { count: normalized.length };
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
  audit: { readonly actor: string; readonly reason: string },
  now: Date = new Date(),
): Promise<{ state: string }> {
  return prisma.$transaction(async (tx) => {
  await lockContestMutations(tx, contestId);

  const contest = await tx.contest.findUnique({
    where: { id: contestId },
    select: {
      state: true,
      startsAt: true,
      endsAt: true,
      freezeAt: true,
      _count: { select: { contestProblems: true } },
      contestProblems: {
        select: { problem: { select: { title: true, state: true } } },
      },
    },
  });
  if (contest === null) throw new NotFoundError("Contest");

  if (next !== "ENDED" && contest._count.contestProblems === 0) {
    throw new ValidationError(
      "This contest has no problems in it yet. Add the line-up before publishing, or students " +
        "will sign in to an empty screen.",
    );
  }

  if (next !== "ENDED") {
    const blocked = contest.contestProblems.filter(
      (entry) => entry.problem.state !== "PUBLISHED",
    );
    if (blocked.length > 0) {
      const names = [
        ...new Set(blocked.map((entry) => `“${entry.problem.title}”`)),
      ];
      const shown = names.slice(0, 3).join(", ");
      const rest = names.length > 3 ? ` and ${String(names.length - 3)} more` : "";
      throw new ValidationError(
        `${shown}${rest} ${names.length === 1 ? "is" : "are"} not published. ` +
          "Finish those questions before publishing this contest, or students will see an empty slot.",
      );
    }
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
    A team may use each individual set at most once. Checking only when assignments run is not
    enough: organizers can move people and manually change sets afterward, and older data may
    predate the invariant. Starting is the last safe point to refuse a broken roster before it
    changes which questions competitors may read.

    Only sets represented by an INDIVIDUAL line-up row count. A stale ProblemSet row left behind by
    an edited line-up is not a usable assignment, even though its foreign key is still valid.
  */
  if (next === "RUNNING") {
    const setup = await tx.contest.findUnique({
      where: { id: contestId },
      select: {
        setSelection: true,
        contestProblems: {
          where: { round: "INDIVIDUAL" },
          select: { setId: true },
        },
        teams: {
          select: {
            name: true,
            members: {
              orderBy: { id: "asc" },
              select: { displayName: true, chosenSetId: true },
            },
          },
        },
      },
    });
    if (setup === null) throw new NotFoundError("Contest");

    const individualSetIds = new Set(
      setup.contestProblems.flatMap((problem) =>
        problem.setId === null ? [] : [problem.setId],
      ),
    );
    if (setup.contestProblems.some((problem) => problem.setId === null)) {
      throw new ValidationError(
        "An individual question in this line-up has no set. Fix the line-up before starting.",
      );
    }

    if (individualSetIds.size > 0) {
      for (const team of setup.teams) {
        if (
          setup.setSelection === "RANDOM_ASSIGNED" &&
          team.members.length > individualSetIds.size
        ) {
          throw new ValidationError(
            `${team.name} has ${String(team.members.length)} teammates but the line-up has only ` +
              `${String(individualSetIds.size)} individual sets. Add a set or change the roster.`,
          );
        }

        const seen = new Set<string>();
        for (const member of team.members) {
          if (member.chosenSetId === null || !individualSetIds.has(member.chosenSetId)) {
            throw new ValidationError(
              `${member.displayName} on ${team.name} does not have a set from this line-up. ` +
                "Assign sets before starting.",
            );
          }
          if (
            setup.setSelection === "RANDOM_ASSIGNED" &&
            seen.has(member.chosenSetId)
          ) {
            throw new ValidationError(
              `${team.name} has two teammates on the same set. Reassign sets before starting.`,
            );
          }
          seen.add(member.chosenSetId);
        }

        if (setup.setSelection === "ONE_SET_PER_TEAM" && seen.size > 1) {
          throw new ValidationError(
            `${team.name} has teammates on different sets. This format gives the whole team one set.`,
          );
        }
      }
    }
  }

  /*
    STARTING A CONTEST MOVES ITS CLOCK, or the button is a lie.

    This function's own doc comment always promised "open it now, regardless of the clock", but it
    wrote only the state column. So an organizer who pressed Start at 6:50 on a contest scheduled
    for 7:00 produced state=RUNNING with startsAt still in the future, and the two halves of the
    product read different columns: the problem list keys on state and showed everything, while
    `assertCanSubmit` keys on the window and answered every submission "This contest has not
    started yet" — the organizer's report, verbatim, reproduced against a RUNNING contest.

    So: every Start anchors the WHOLE window at the instant the organizer pressed the button,
    whether that is early, late-but-still-inside the planned window, or after a rehearsal expired.
    The duration is what the organizer planned ("start the contest to give everyone all the
    time"). freezeAt is part of the window and slides with it — a freeze offset is a decision about
    the last N minutes, not about a wall-clock time of day.

    Ending early pulls endsAt back to now for the same invariant, stated once: THE STORED WINDOW
    DESCRIBES WHAT ACTUALLY HAPPENED. Scoring cutoffs and the review lobby both read it.
    A freeze that never happened before the early end is erased rather than left dangling after
    the contest's own end.
  */
  const window: { startsAt?: Date; endsAt?: Date; freezeAt?: Date | null } = {};
  if (next === "RUNNING") {
    const duration = contest.endsAt.getTime() - contest.startsAt.getTime();
    const freezeOffset =
      contest.freezeAt === null
        ? null
        : contest.freezeAt.getTime() - contest.startsAt.getTime();
    window.startsAt = now;
    window.endsAt = new Date(now.getTime() + duration);
    if (freezeOffset !== null) window.freezeAt = new Date(now.getTime() + freezeOffset);
  }
  if (next === "ENDED" && contest.endsAt.getTime() > now.getTime()) {
    window.endsAt = now;
    if (contest.freezeAt !== null && contest.freezeAt.getTime() > now.getTime()) {
      window.freezeAt = null;
    }
  }

  const updated = await tx.contest.update({
    where: { id: contestId },
    data: { state: next, ...window },
    select: { state: true },
  });
  await writeAudit(
    {
      actor: audit.actor,
      action: AUDIT_ACTIONS.contestStateSet,
      entity: `Contest:${contestId}`,
      before: { state: contest.state },
      after: { state: updated.state },
      reason: audit.reason,
    },
    tx,
  );
  return { state: updated.state };
  });
}
