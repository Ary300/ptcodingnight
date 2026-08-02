import { createHash, randomBytes } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { AUDIT_ACTIONS, writeAudit } from "@/lib/contest/audit";
import { lockContestMutations, lockProblemMutations } from "@/lib/contest/locks";
import { problemBank } from "@/lib/contest/problem-bank";
import {
  DIFFICULTY_LABEL,
  planSets,
  setLabelAt,
  setSize,
  type AvailableProblem,
  type Difficulty,
  type PlanDivision,
} from "@/lib/contest/set-plan";
import { invalidateScoringInput } from "@/lib/contest/standings";
import { actorLabel, type AdminViewer } from "@/lib/contest/viewer";
import { prisma } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import {
  SetCompositionSchema,
  type SetCompositionInput,
  type SetPlanResponse,
  type StoredSetPlanResponse,
} from "@/lib/schemas/api";

/**
 * Building a contest's problem sets: the I/O half of `lib/contest/set-plan.ts`.
 *
 * The split mirrors `assign-sets.ts` against `set-assignment.ts`, and for the same reason. The deal
 * itself is pure, seeded and unit-tested with no database in sight; everything that touches the
 * world lives here. **Nothing in this file decides which problem goes where.** It gathers the pool
 * and the divisions, hands them to `planSets`, and writes down what came back. If you find yourself
 * shuffling, counting difficulties, or checking feasibility in this file, it belongs one module
 * over.
 *
 * ## What a set is, and what this is not
 *
 * The columns on the organizer's sheet are SETS and the rows are teams: every member of a team
 * holds a different set, and a set is the same questions for everybody who holds it. So four sets
 * under a one-of-each recipe is twelve distinct problems. When the contest has divisions, each
 * division gets its own columns dealt to the same recipe, and a member is only ever handed a set
 * of their own division. **Which player holds which set is `assign-sets.ts`** and is not touched
 * here. This module only decides what is IN a column.
 *
 * GROUP problems have two authors, and the difference is a column, not a convention. The recipe's
 * `groupCount` deals whole-team questions (`dealtByPlan: true`), which a re-plan replaces; the
 * Problems tab places them by hand (`dealtByPlan: false`), and a re-plan leaves those alone
 * exactly as it always has. Hand-picked group questions are also withheld from the pool, so the
 * plan can never deal one of them into a set.
 *
 * ## Preview and apply are the same computation
 *
 * `previewSets` and `applySets` differ in exactly one thing: whether the result is written. They
 * share the pool gathering and the call into `planSets`. The caller echoes both the seed and the
 * pool fingerprint back: the seed fixes the shuffle, and the fingerprint refuses the write if the
 * usable bank OR the division list changed after the preview — the deal is a function of both, so
 * both are in the hash. Without that, an apply could save a different, equally valid split from
 * the one on screen.
 */

/**
 * What one problem is worth when the recipe does not say.
 *
 * A set whose Hard scores what its Easy scores is a set with no reason to reach the end of. These
 * are a starting point rather than a rule: `SetCompositionEntry.points` overrides per line, and
 * the override is stored inside the recipe so a contest planned last year reads back with the
 * points it was actually built with.
 */
export const DEFAULT_POINTS_BY_DIFFICULTY: Readonly<Record<Difficulty, number>> = {
  E: 100,
  M: 200,
  H: 300,
};

/** One dealt problem, with the two facts the database row needs that the pure engine has no view of. */
export interface PlannedSlot extends AvailableProblem {
  readonly slotLabel: string;
  readonly basePoints: number;
}

export interface PlannedSetWithSlots {
  readonly label: string;
  readonly problems: readonly PlannedSlot[];
}

function newSeed(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Version the exact inputs the seeded deal consumes: the ordered pool AND the division list.
 *
 * Order is deliberately part of the fingerprint on both: the shuffle starts from the pool array,
 * and the divisions decide how many deals happen and what salts them, so the same members in a
 * different order can produce a different set plan under the same seed. Adding or renaming a
 * division between preview and apply must therefore refuse the write too.
 */
export function setPoolVersion(
  pool: readonly AvailableProblem[],
  divisions: readonly PlanDivision[] = [],
): string {
  const material = {
    pool: pool.map((problem) => [
      problem.problemId,
      problem.slug,
      problem.title,
      problem.difficulty,
    ]),
    divisions: divisions.map((division) => [division.id, division.name]),
  };
  return createHash("sha256").update(JSON.stringify(material)).digest("hex");
}

export function pointsForEntry(entry: SetCompositionInput[number]): number {
  return entry.points ?? DEFAULT_POINTS_BY_DIFFICULTY[entry.difficulty];
}

/**
 * The recipe as a sentence: "1 Easy, 1 Medium, 1 Hard". `groupCount` appends ", 2 team questions"
 * when the recipe asks for any.
 *
 * Used in the audit row, where the value has to be a flat scalar and has to be readable at 9pm by
 * somebody arguing about second place. A JSON blob is not that.
 */
export function describeComposition(
  composition: SetCompositionInput,
  groupCount = 0,
): string {
  const lines = composition
    .filter((entry) => entry.count > 0)
    .map((entry) => `${String(entry.count)} ${DIFFICULTY_LABEL[entry.difficulty]}`);
  if (groupCount > 0) {
    lines.push(`${String(groupCount)} team ${groupCount === 1 ? "question" : "questions"}`);
  }
  return lines.join(", ");
}

/**
 * Label each dealt problem with its slot and its points.
 *
 * `planSets` orders a set's problems as the recipe lists them, repeated by `count`, so walking the
 * recipe in the same order re-identifies which line each problem came from. That coupling is why
 * the length check below exists: it is an INVARIANT rather than a validation, so it throws a plain
 * error. If it ever fires, the engine's ordering changed and the slot labels this file writes have
 * silently stopped describing the problems they are attached to.
 */
export function assignSlots(
  setLabel: string,
  problems: readonly AvailableProblem[],
  composition: SetCompositionInput,
): PlannedSlot[] {
  const slots: PlannedSlot[] = [];
  let index = 0;

  for (const entry of composition) {
    if (entry.count <= 0) continue;
    const basePoints = pointsForEntry(entry);
    for (let n = 1; n <= entry.count; n += 1) {
      const problem = problems[index];
      index += 1;
      if (problem === undefined) {
        throw new Error(
          `set-build: set ${setLabel} holds ${String(problems.length)} problems but the recipe describes more`,
        );
      }
      slots.push({ ...problem, slotLabel: `${setLabel}-${entry.difficulty}${String(n)}`, basePoints });
    }
  }

  if (index !== problems.length) {
    throw new Error(
      `set-build: set ${setLabel} holds ${String(problems.length)} problems and the recipe describes ${String(index)}`,
    );
  }
  return slots;
}

/**
 * Label and price the plan's whole-team questions: "Team 1", "Team 2", …
 *
 * Priced by each problem's own difficulty, because the recipe's group line has none: a Hard team
 * question is still a Hard question. The engine only draws rated problems for the group line, so
 * a missing difficulty here is the same kind of invariant break as a set that disagrees with its
 * recipe, and it is equally loud.
 */
export function groupSlots(problems: readonly AvailableProblem[]): PlannedSlot[] {
  return problems.map((problem, index) => {
    if (problem.difficulty === null) {
      throw new Error(
        `set-build: group question ${problem.problemId} has no difficulty, so it cannot be priced`,
      );
    }
    return {
      ...problem,
      slotLabel: `Team ${String(index + 1)}`,
      basePoints: DEFAULT_POINTS_BY_DIFFICULTY[problem.difficulty],
    };
  });
}

/**
 * Read a recipe back out of `Contest.setComposition`.
 *
 * `Json` is `unknown` as far as Prisma is concerned, so this is a trust boundary in the OUTGOING
 * direction too: a row written by an older build is external data to the build reading it.
 *
 * An unreadable recipe returns null rather than throwing. The screen that calls this is the one an
 * organizer would use to FIX it, and a GET that 500s on bad stored data leaves them with `psql` as
 * the only route back. The sets that exist are still returned, so nothing is hidden: the reply says
 * "there is no readable recipe" and still shows the columns as they stand.
 */
export function parseStoredComposition(value: unknown): SetCompositionInput | null {
  if (value === null || value === undefined) return null;
  const parsed = SetCompositionSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  console.error(
    JSON.stringify({
      level: "error",
      event: "contest.set_composition_unreadable",
      message: parsed.error.issues[0]?.message ?? "invalid stored composition",
    }),
  );
  return null;
}

/**
 * Every problem in the bank that may go into a set of a live contest.
 *
 * The usable test is `problem-bank.ts`'s, not a second copy of it: `readyBlockers` is already the
 * one place that answers "may this problem be used", and computing it again here would be a second
 * answer free to disagree with the organizer's own screen. An empty blocker list is exactly
 * PUBLISHED plus an original statement plus test cases plus samples.
 *
 * Two further exclusions belong to the SET question rather than to the problem:
 *
 *  - a problem an organizer HAND-PICKED as a GROUP question (`dealtByPlan: false`) is out: those
 *    rows survive a re-plan on purpose, so dealing one into a set would collide with a row this
 *    module never deletes. The plan's own previous group draws are NOT excluded, because a re-plan
 *    replaces them, which returns them to the pool.
 *
 * Problems with no difficulty are dropped: they cannot satisfy any recipe line, so counting them
 * in `poolSize` would tell an organizer staring at a shortfall that the bank holds problems the
 * plan could have used.
 */
async function gatherPool(contestId: string): Promise<AvailableProblem[]> {
  const [bank, handPickedGroupRows] = await Promise.all([
    problemBank(),
    prisma.contestProblem.findMany({
      where: { contestId, round: "GROUP", dealtByPlan: false },
      select: { problemId: true },
    }),
  ]);

  const spokenFor = new Set(handPickedGroupRows.map((row) => row.problemId));

  return bank.problems
    .filter(
      (problem) =>
        problem.readyBlockers.length === 0 &&
        problem.difficulty !== null &&
        !spokenFor.has(problem.problemId),
    )
    .map((problem) => ({
      problemId: problem.problemId,
      slug: problem.slug,
      title: problem.title,
      difficulty: problem.difficulty,
    }));
}

/**
 * Which teams would break the "every teammate holds a different set" rule under `setCount`.
 *
 * Judged per (team, division): a member only draws from their own division's columns, and each
 * division gets `setCount` of them, so five teammates split 3 and 2 across two divisions fit in
 * three sets ("column A" is a different column in each division). A contest with no divisions is
 * one scope holding everybody, which is the old whole-team comparison unchanged.
 *
 * Members with no division in a contest that HAS divisions are not counted: they have no columns
 * to draw from, assignment skips them visibly, and refusing to build sets because of a student
 * whose division is not picked yet would block the whole room on a roster detail.
 */
export function crowdedTeamMessages(
  teams: readonly { readonly id: string; readonly name: string }[],
  participants: readonly { readonly teamId: string | null; readonly divisionId: string | null }[],
  divisionNames: ReadonlyMap<string, string>,
  setCount: number,
): string[] {
  const contestHasDivisions = divisionNames.size > 0;
  const counts = new Map<string, number>();
  for (const participant of participants) {
    if (participant.teamId === null) continue;
    if (contestHasDivisions && participant.divisionId === null) continue;
    const key = `${participant.teamId} ${participant.divisionId ?? ""}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const nameOfTeam = new Map(teams.map((team) => [team.id, team.name]));
  const messages: string[] = [];
  for (const [key, members] of counts) {
    if (members <= setCount) continue;
    const [teamId = "", divisionId = ""] = key.split(" ");
    const division = divisionId === "" ? null : (divisionNames.get(divisionId) ?? null);
    messages.push(
      `${nameOfTeam.get(teamId) ?? "a team"} (${String(members)}${division === null ? "" : ` in ${division}`})`,
    );
  }
  return messages.sort();
}

/**
 * The contest's divisions, in the order every board shows them. This order is a plan input: it
 * decides which deal happens first, so it is part of the fingerprint too.
 */
async function gatherDivisions(contestId: string): Promise<PlanDivision[]> {
  const rows = await prisma.division.findMany({
    where: { contestId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

/** The shape both modes answer with, so a preview and an apply are read the same way. */
function toResponse(
  contestId: string,
  mode: "preview" | "apply",
  applied: boolean,
  composition: SetCompositionInput,
  setCount: number,
  groupCount: number,
  seed: string | null,
  poolSize: number,
  poolVersion: string,
  plan: ReturnType<typeof planSets>,
): SetPlanResponse {
  return {
    contestId,
    mode,
    applied,
    setCount,
    setSize: setSize(composition),
    groupCount,
    composition,
    seed,
    poolSize,
    poolVersion,
    plan: plan.ok
      ? {
          ok: true,
          sets: plan.sets.map((set) => ({
            label: set.label,
            divisionId: set.divisionId,
            divisionName: set.divisionName,
            problems: assignSlots(set.label, set.problems, composition),
          })),
          groupProblems: groupSlots(plan.groupProblems),
        }
      : { ok: false, shortfalls: [...plan.shortfalls], message: plan.message },
  };
}

/**
 * Deal the sets and return them WITHOUT writing anything.
 *
 * The seed and pool fingerprint come back in the response and must be handed to `applySets` to get
 * the split that was on screen. A preview that could not be reproduced would be a mock-up rather
 * than a preview.
 */
export async function previewSets(
  contestId: string,
  composition: SetCompositionInput,
  setCount: number,
  groupCount: number,
  options: { readonly seed?: string } = {},
): Promise<SetPlanResponse> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: { id: true },
  });
  if (contest === null) throw new NotFoundError("Contest");

  const [pool, divisions] = await Promise.all([
    gatherPool(contestId),
    gatherDivisions(contestId),
  ]);
  const poolVersion = setPoolVersion(pool, divisions);
  const seed = options.seed ?? newSeed();
  const plan = planSets({ seed, setCount, composition, pool, divisions, groupCount });

  return toResponse(
    contestId,
    "preview",
    false,
    composition,
    setCount,
    groupCount,
    plan.ok ? seed : null,
    pool.length,
    poolVersion,
    plan,
  );
}

/**
 * Deal the sets and write them: `ProblemSet` rows, `ContestProblem` rows, and the recipe, count and
 * seed on the contest.
 *
 * ## Why it refuses a contest that has started
 *
 * Rebuilding the sets under a running contest moves students off problems they have already
 * started, and the submissions they made against the old line-up would point at rows that no longer
 * exist. DRAFT and SCHEDULED only, which is the same rule `setContestProblems` enforces for the
 * same reason.
 *
 * ## Why a second apply REPLACES rather than appends
 *
 * `ContestProblem` is unique on `(contestId, problemId, divisionId)`, so an append would throw a
 * constraint error the second time an organizer pressed the button — and a constraint error is not
 * something an organizer can read or act on. The previous individual-set rows go first, and so do
 * the plan's own previous group draws; hand-picked group questions are never touched.
 *
 * The `ProblemSet` rows are UPSERTED by (division, label) rather than deleted and recreated, and
 * that is not tidiness. `Participant.chosenSetId` points at a set with `onDelete: SetNull`, so
 * recreating set A with a new id would silently unassign every player who held it. A re-plan that
 * keeps the same columns therefore leaves every assignment intact and only changes what is inside
 * them. Shrinking the plan does drop the surplus columns, and the players on them lose their
 * assignment — unavoidable, since the column is gone. `reDeriveAssignment` reports that honestly
 * as `matchesStored: false`, which is exactly the signal it exists to give.
 */
export async function applySets(
  contestId: string,
  composition: SetCompositionInput,
  setCount: number,
  groupCount: number,
  admin: AdminViewer,
  now: Date,
  options: { readonly seed: string; readonly poolVersion: string },
): Promise<SetPlanResponse> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: {
      id: true,
      state: true,
      setComposition: true,
      setCount: true,
      setGroupCount: true,
      setPlanSeed: true,
      setSelection: true,
      teams: { select: { id: true, name: true } },
      participants: { select: { teamId: true, divisionId: true } },
    },
  });
  if (contest === null) throw new NotFoundError("Contest");

  if (contest.state !== "DRAFT" && contest.state !== "SCHEDULED") {
    throw new DomainError(
      "CONFLICT",
      "This contest has already started, so its sets cannot be rebuilt. Doing so would move " +
        "students off problems they have already started working on.",
    );
  }

  const [pool, divisions] = await Promise.all([
    gatherPool(contestId),
    gatherDivisions(contestId),
  ]);
  const divisionNames = new Map(divisions.map((division) => [division.id, division.name]));

  const crowdedTeams =
    contest.setSelection === "RANDOM_ASSIGNED"
      ? crowdedTeamMessages(contest.teams, contest.participants, divisionNames, setCount)
      : [];
  if (crowdedTeams.length > 0) {
    throw new DomainError(
      "VALIDATION",
      `Build at least one set per member of the largest team. ${crowdedTeams.join(", ")} ` +
        "would otherwise repeat a set.",
    );
  }
  const poolVersion = setPoolVersion(pool, divisions);
  if (options.poolVersion !== poolVersion) {
    throw new DomainError(
      "CONFLICT",
      "The problem bank changed after this preview. Preview the sets again before building them.",
    );
  }
  const seed = options.seed;
  const plan = planSets({ seed, setCount, composition, pool, divisions, groupCount });

  // A recipe the bank cannot fill is a normal answer, not an exception: the organizer is still
  // choosing. Nothing is written and the shortfalls carry the arithmetic that says why.
  if (!plan.ok) {
    return toResponse(
      contestId,
      "apply",
      false,
      composition,
      setCount,
      groupCount,
      null,
      pool.length,
      poolVersion,
      plan,
    );
  }

  // A set's identity is (division, label): labels restart at "A" in every division.
  const keyOf = (divisionId: string | null, label: string): string =>
    `${divisionId ?? ""}\u0000${label}`;
  const plannedKeys = plan.sets.map((set) => keyOf(set.divisionId, set.label));
  const plannedProblemIds = [
    ...new Set([
      ...plan.sets.flatMap((set) => set.problems.map((problem) => problem.problemId)),
      ...plan.groupProblems.map((problem) => problem.problemId),
    ]),
  ].sort();

  await prisma.$transaction(async (tx) => {
    // Match the lock order used by line-up replacement and problem editing. Once these locks are
    // held, every problem the preview selected stays put until the write commits.
    for (const problemId of plannedProblemIds) await lockProblemMutations(tx, problemId);
    await lockContestMutations(tx, contestId);

    const latest = await tx.contest.findUnique({
      where: { id: contestId },
      select: {
        state: true,
        setSelection: true,
        setComposition: true,
        setCount: true,
        setGroupCount: true,
        setPlanSeed: true,
        problemSets: { select: { id: true, label: true, divisionId: true } },
        teams: { select: { id: true, name: true } },
        participants: { select: { teamId: true, divisionId: true } },
      },
    });
    if (latest === null) throw new NotFoundError("Contest");
    if (latest.state !== "DRAFT" && latest.state !== "SCHEDULED") {
      throw new DomainError(
        "CONFLICT",
        "This contest has already started, so its sets cannot be rebuilt.",
      );
    }
    const latestCrowded =
      latest.setSelection === "RANDOM_ASSIGNED"
        ? crowdedTeamMessages(latest.teams, latest.participants, divisionNames, setCount)
        : [];
    if (latestCrowded.length > 0) {
      throw new DomainError(
        "VALIDATION",
        `Build at least one set per member of the largest team. ${latestCrowded.join(", ")} ` +
          "would otherwise repeat a set.",
      );
    }

    // The first comparison closes the ordinary preview/apply gap. This second one closes the
    // smaller check/write gap: a problem edit, GROUP line-up change or division rename that won
    // the advisory lock immediately before us must make this request preview again, not save a
    // stale split.
    const [lockedPool, lockedDivisions] = await Promise.all([
      gatherPool(contestId),
      gatherDivisions(contestId),
    ]);
    const lockedPoolVersion = setPoolVersion(lockedPool, lockedDivisions);
    if (lockedPoolVersion !== poolVersion) {
      throw new DomainError(
        "CONFLICT",
        "The problem bank changed after this preview. Preview the sets again before building them.",
      );
    }

    const previousComposition = parseStoredComposition(latest.setComposition);

    const previousKeys = new Set(
      latest.problemSets.map((set) => keyOf(set.divisionId, set.label)),
    );
    const nextKeys = new Set(plannedKeys);
    const labelsChanged =
      previousKeys.size !== nextKeys.size ||
      [...nextKeys].some((key) => !previousKeys.has(key));

    // The old line-up goes first: the INDIVIDUAL round this plan owns, and the plan's own previous
    // group draws. Hand-picked group questions (`dealtByPlan: false`) remain untouched even if
    // older data carries a contradictory set id.
    await tx.contestProblem.deleteMany({ where: { contestId, round: "INDIVIDUAL" } });
    await tx.contestProblem.deleteMany({
      where: { contestId, round: "GROUP", dealtByPlan: true },
    });

    // Upsert-by-(division, label) so a surviving column keeps its id, and with it every
    // `Participant.chosenSetId` pointing at it. Done by hand rather than through Prisma's
    // `upsert`, because a compound unique input cannot carry the null the no-division case needs.
    // The advisory contest lock above makes the read-then-write race-free.
    const existingByKey = new Map(
      latest.problemSets.map((set) => [keyOf(set.divisionId, set.label), set.id]),
    );
    const setIdByKey = new Map<string, string>();
    for (const set of plan.sets) {
      const key = keyOf(set.divisionId, set.label);
      const existingId = existingByKey.get(key);
      if (existingId !== undefined) {
        setIdByKey.set(key, existingId);
        continue;
      }
      const created = await tx.problemSet.create({
        data: { contestId, label: set.label, divisionId: set.divisionId },
        select: { id: true },
      });
      setIdByKey.set(key, created.id);
    }

    // Columns the new plan does not have. Deleted after the creates so a set that survives keeps
    // its id. Identified by id rather than by a label filter, because labels repeat across
    // divisions and a notIn over labels would spare another division's dropped column.
    const surplusIds = latest.problemSets
      .filter((set) => !nextKeys.has(keyOf(set.divisionId, set.label)))
      .map((set) => set.id);
    if (surplusIds.length > 0) {
      await tx.problemSet.deleteMany({ where: { id: { in: surplusIds } } });
    }

    await tx.contestProblem.createMany({
      data: [
        ...plan.sets.flatMap((set) =>
          assignSlots(set.label, set.problems, composition).map((slot) => ({
            contestId,
            problemId: slot.problemId,
            divisionId: set.divisionId,
            round: "INDIVIDUAL" as const,
            setId: setIdByKey.get(keyOf(set.divisionId, set.label)) ?? null,
            slotLabel: slot.slotLabel,
            basePoints: slot.basePoints,
            unlockAt: null,
            dealtByPlan: true,
          })),
        ),
        // Whole-team questions: every team, every division, the same ones (divisionId null is
        // the deliberate default the organizer described; a division-scoped group question can
        // still be placed by hand on the Problems tab).
        ...groupSlots(plan.groupProblems).map((slot) => ({
          contestId,
          problemId: slot.problemId,
          divisionId: null,
          round: "GROUP" as const,
          setId: null,
          slotLabel: slot.slotLabel,
          basePoints: slot.basePoints,
          unlockAt: null,
          dealtByPlan: true,
        })),
      ],
    });

    await tx.contest.update({
      where: { id: contestId },
      data: {
        // Prisma types a Json column as `unknown` in, which is the same reason the schema comment
        // calls it a trust boundary in both directions: nothing but `SetCompositionSchema` decides
        // what is a valid recipe, on the way in here and on the way out in parseStoredComposition.
        setComposition: composition as unknown as Prisma.InputJsonValue,
        setCount,
        setGroupCount: groupCount,
        setPlanSeed: seed,
        ...(labelsChanged ? { setAssignmentSeed: null } : {}),
      },
    });

    await writeAudit(
      {
        actor: actorLabel(admin),
        action: AUDIT_ACTIONS.setPlanApplied,
        entity: `contest:${contestId}`,
        before:
          latest.setPlanSeed === null
            ? null
            : {
                seed: latest.setPlanSeed,
                setCount: latest.setCount,
                recipe:
                  previousComposition === null
                    ? null
                    : describeComposition(previousComposition, latest.setGroupCount),
              },
        after: {
          seed,
          setCount,
          recipe: describeComposition(composition, groupCount),
          sets: plan.sets
            .map((set) =>
              set.divisionName === null ? set.label : `${set.divisionName} ${set.label}`,
            )
            .join(", "),
          problems: plan.sets.length * setSize(composition) + plan.groupProblems.length,
          at: now.toISOString(),
        },
        reason:
          latest.setPlanSeed === null ? null : "the sets were rebuilt from the bank",
      },
      tx,
    );
  });

  // The line-up is a scoring input: `basePoints` and the set a problem sits in both feed the
  // standings. Same precedent as assign-sets.ts, and for the same one-second memo.
  invalidateScoringInput(contestId);

  return toResponse(
    contestId,
    "apply",
    true,
    composition,
    setCount,
    groupCount,
    seed,
    pool.length,
    poolVersion,
    plan,
  );
}

/**
 * What is already there: the stored recipe, and the sets as they stand in the database.
 *
 * Deliberately a READ of the ROWS rather than a re-derivation from the seed. The question this
 * answers is "what will the students see", and only the rows know that — a re-derivation would
 * agree with them right up until somebody edited a slot by hand, which is the one case worth
 * finding out about.
 */
export async function readSetPlan(contestId: string): Promise<StoredSetPlanResponse> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: {
      id: true,
      state: true,
      setComposition: true,
      setCount: true,
      setGroupCount: true,
      setPlanSeed: true,
      problemSets: {
        select: {
          id: true,
          label: true,
          divisionId: true,
          division: { select: { name: true, sortOrder: true } },
          contestProblems: {
            select: {
              id: true,
              slotLabel: true,
              basePoints: true,
              problem: { select: { id: true, slug: true, title: true, difficulty: true } },
            },
          },
        },
      },
    },
  });
  if (contest === null) throw new NotFoundError("Contest");

  const [pool, groupRows] = await Promise.all([
    gatherPool(contestId),
    prisma.contestProblem.findMany({
      where: { contestId, round: "GROUP" },
      select: {
        id: true,
        slotLabel: true,
        basePoints: true,
        dealtByPlan: true,
        problem: { select: { id: true, slug: true, title: true, difficulty: true } },
      },
    }),
  ]);

  // Divisions in board order, null-division columns first, then labels. A one-string sort key
  // keeps the comparison total; `\u0000` cannot appear in a division name or a label.
  const divisionKeyOf = (set: {
    divisionId: string | null;
    division: { name: string; sortOrder: number } | null;
  }): string =>
    set.division === null
      ? "0"
      : `1\u0000${String(set.division.sortOrder).padStart(9, "0")}\u0000${set.division.name}`;

  return {
    contestId,
    contestState: contest.state,
    composition: parseStoredComposition(contest.setComposition),
    setCount: contest.setCount,
    groupCount: contest.setGroupCount,
    seed: contest.setPlanSeed,
    poolSize: pool.length,
    // Sorted here, on every axis. Postgres returns rows in whatever order it likes, and a screen
    // whose columns reorder between two reads of unchanged data is one an organizer cannot check
    // against the sheet in front of them.
    sets: [...contest.problemSets]
      .sort((a, b) => {
        const aKey = `${divisionKeyOf(a)}\u0000${a.label}`;
        const bKey = `${divisionKeyOf(b)}\u0000${b.label}`;
        return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
      })
      .map((set) => ({
        setId: set.id,
        label: set.label,
        divisionId: set.divisionId,
        divisionName: set.division?.name ?? null,
        problems: [...set.contestProblems]
          .sort((a, b) => (a.slotLabel < b.slotLabel ? -1 : a.slotLabel > b.slotLabel ? 1 : 0))
          .map((row) => ({
            problemId: row.problem.id,
            slug: row.problem.slug,
            title: row.problem.title,
            difficulty: row.problem.difficulty,
            slotLabel: row.slotLabel,
            basePoints: row.basePoints,
            contestProblemId: row.id,
          })),
      })),
    groupProblems: [...groupRows]
      .sort((a, b) => {
        const aKey = `${a.slotLabel}\u0000${a.id}`;
        const bKey = `${b.slotLabel}\u0000${b.id}`;
        return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
      })
      .map((row) => ({
        problemId: row.problem.id,
        slug: row.problem.slug,
        title: row.problem.title,
        difficulty: row.problem.difficulty,
        slotLabel: row.slotLabel,
        basePoints: row.basePoints,
        contestProblemId: row.id,
        dealtByPlan: row.dealtByPlan,
      })),
    groupProblemCount: groupRows.length,
  };
}

/**
 * The labels a plan of this size will use: "A", "B", "C", …
 *
 * Exported so a caller can name the columns before anything is dealt. Thin, and deliberately still
 * `setLabelAt`'s answer rather than a second one.
 */
export function labelsFor(setCount: number): string[] {
  return Array.from({ length: Math.max(0, setCount) }, (_unused, index) => setLabelAt(index));
}
