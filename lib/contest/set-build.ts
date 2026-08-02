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
 * world lives here. **Nothing in this file decides which problem goes where.** It gathers the pool,
 * hands it to `planSets`, and writes down what came back. If you find yourself shuffling, counting
 * difficulties, or checking feasibility in this file, it belongs one module over.
 *
 * ## What a set is, and what this is not
 *
 * The columns on the organizer's sheet are SETS and the rows are teams: every member of a team
 * holds a different set, and a set is the same questions for everybody who holds it. So four sets
 * under a one-of-each recipe is twelve distinct problems. **Which player holds which set is
 * `assign-sets.ts`** and is not touched here. This module only decides what is IN a column.
 *
 * GROUP problems sit outside the plan entirely (`ContestProblem.setId = null`): the whole team
 * works them and every team gets the same ones. They are neither dealt nor deleted here, which is
 * why `applySets` clears rows by `setId != null` rather than by contest.
 *
 * ## Preview and apply are the same computation
 *
 * `previewSets` and `applySets` differ in exactly one thing: whether the result is written. They
 * share the pool gathering and the call into `planSets`. The caller echoes both the seed and the
 * pool fingerprint back: the seed fixes the shuffle, and the fingerprint refuses the write if the
 * usable bank changed after the preview. Without both, an apply could save a different, equally
 * valid split from the one on screen.
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
 * Version the exact ordered pool that the seeded deal consumes.
 *
 * Order is deliberately part of the fingerprint: the shuffle starts from this array, so the
 * same members in a different order can produce a different set plan under the same seed.
 */
export function setPoolVersion(pool: readonly AvailableProblem[]): string {
  const material = pool.map((problem) => [
    problem.problemId,
    problem.slug,
    problem.title,
    problem.difficulty,
  ]);
  return createHash("sha256").update(JSON.stringify(material)).digest("hex");
}

export function pointsForEntry(entry: SetCompositionInput[number]): number {
  return entry.points ?? DEFAULT_POINTS_BY_DIFFICULTY[entry.difficulty];
}

/**
 * The recipe as a sentence: "1 Easy, 1 Medium, 1 Hard".
 *
 * Used in the audit row, where the value has to be a flat scalar and has to be readable at 9pm by
 * somebody arguing about second place. A JSON blob is not that.
 */
export function describeComposition(composition: SetCompositionInput): string {
  return composition
    .filter((entry) => entry.count > 0)
    .map((entry) => `${String(entry.count)} ${DIFFICULTY_LABEL[entry.difficulty]}`)
    .join(", ");
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
 *  - a problem this contest already uses as a GROUP problem is out, because `ContestProblem` is
 *    unique on `(contestId, problemId, divisionId)` and the group rows are deliberately not
 *    cleared by a re-plan. The constraint error would arrive as an unreadable 500 at the end of a
 *    transaction; this is the same refusal, phrased as arithmetic in a shortfall instead.
 *
 * Problems with no difficulty are dropped: they cannot satisfy any recipe line, so counting them
 * in `poolSize` would tell an organizer staring at a shortfall that the bank holds problems the
 * plan could have used.
 */
async function gatherPool(contestId: string): Promise<AvailableProblem[]> {
  const [bank, groupRows] = await Promise.all([
    problemBank(),
    prisma.contestProblem.findMany({
      where: { contestId, round: "GROUP" },
      select: { problemId: true },
    }),
  ]);

  const spokenFor = new Set(groupRows.map((row) => row.problemId));

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

/** The shape both modes answer with, so a preview and an apply are read the same way. */
function toResponse(
  contestId: string,
  mode: "preview" | "apply",
  applied: boolean,
  composition: SetCompositionInput,
  setCount: number,
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
    composition,
    seed,
    poolSize,
    poolVersion,
    plan: plan.ok
      ? {
          ok: true,
          sets: plan.sets.map((set) => ({
            label: set.label,
            problems: assignSlots(set.label, set.problems, composition),
          })),
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
  options: { readonly seed?: string } = {},
): Promise<SetPlanResponse> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: { id: true },
  });
  if (contest === null) throw new NotFoundError("Contest");

  const pool = await gatherPool(contestId);
  const poolVersion = setPoolVersion(pool);
  const seed = options.seed ?? newSeed();
  const plan = planSets({ seed, setCount, composition, pool });

  return toResponse(
    contestId,
    "preview",
    false,
    composition,
    setCount,
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
 * something an organizer can read or act on. The previous individual-set rows go first.
 *
 * The `ProblemSet` rows are UPSERTED by label rather than deleted and recreated, and that is not
 * tidiness. `Participant.chosenSetId` points at a set with `onDelete: SetNull`, so recreating set A
 * with a new id would silently unassign every player who held it. A re-plan that keeps the same
 * number of columns therefore leaves every assignment intact and only changes what is inside them.
 * Shrinking the plan does drop the surplus columns, and the players on them lose their assignment —
 * unavoidable, since the column is gone. `reDeriveAssignment` reports that honestly as
 * `matchesStored: false`, which is exactly the signal it exists to give.
 */
export async function applySets(
  contestId: string,
  composition: SetCompositionInput,
  setCount: number,
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
      setPlanSeed: true,
      setSelection: true,
      teams: {
        select: { name: true, _count: { select: { members: true } } },
      },
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

  const crowdedTeams =
    contest.setSelection === "RANDOM_ASSIGNED"
      ? contest.teams.filter((team) => team._count.members > setCount)
      : [];
  if (crowdedTeams.length > 0) {
    const named = crowdedTeams
      .map((team) => `${team.name} (${String(team._count.members)})`)
      .join(", ");
    throw new DomainError(
      "VALIDATION",
      `Build at least one set per member of the largest team. ${named} would otherwise repeat a set.`,
    );
  }

  const pool = await gatherPool(contestId);
  const poolVersion = setPoolVersion(pool);
  if (options.poolVersion !== poolVersion) {
    throw new DomainError(
      "CONFLICT",
      "The problem bank changed after this preview. Preview the sets again before building them.",
    );
  }
  const seed = options.seed;
  const plan = planSets({ seed, setCount, composition, pool });

  // A recipe the bank cannot fill is a normal answer, not an exception: the organizer is still
  // choosing. Nothing is written and the shortfalls carry the arithmetic that says why.
  if (!plan.ok) {
    return toResponse(
      contestId,
      "apply",
      false,
      composition,
      setCount,
      null,
      pool.length,
      poolVersion,
      plan,
    );
  }

  const labels = plan.sets.map((set) => set.label);
  const plannedProblemIds = [
    ...new Set(plan.sets.flatMap((set) => set.problems.map((problem) => problem.problemId))),
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
        setPlanSeed: true,
        problemSets: { select: { label: true } },
        teams: { select: { name: true, _count: { select: { members: true } } } },
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
        ? latest.teams.filter((team) => team._count.members > setCount)
        : [];
    if (latestCrowded.length > 0) {
      throw new DomainError(
        "VALIDATION",
        `Build at least one set per member of the largest team. ${latestCrowded
          .map((team) => `${team.name} (${String(team._count.members)})`)
          .join(", ")} would otherwise repeat a set.`,
      );
    }

    // The first comparison closes the ordinary preview/apply gap. This second one closes the
    // smaller check/write gap: a problem edit or GROUP line-up change that won the advisory lock
    // immediately before us must make this request preview again, not save a stale split.
    const lockedPoolVersion = setPoolVersion(await gatherPool(contestId));
    if (lockedPoolVersion !== poolVersion) {
      throw new DomainError(
        "CONFLICT",
        "The problem bank changed after this preview. Preview the sets again before building them.",
      );
    }

    const previousComposition = parseStoredComposition(latest.setComposition);

    const previousLabels = new Set(latest.problemSets.map((set) => set.label));
    const nextLabels = new Set(labels);
    const labelsChanged =
      previousLabels.size !== nextLabels.size ||
      [...nextLabels].some((label) => !previousLabels.has(label));

    // The old line-up goes first, and only the INDIVIDUAL round this plan owns. Group questions
    // are contest-scoped and remain untouched even if older data carries a contradictory set id.
    await tx.contestProblem.deleteMany({ where: { contestId, round: "INDIVIDUAL" } });

    const setIdByLabel = new Map<string, string>();
    for (const label of labels) {
      const set = await tx.problemSet.upsert({
        where: { contestId_label: { contestId, label } },
        create: { contestId, label },
        update: {},
        select: { id: true },
      });
      setIdByLabel.set(label, set.id);
    }

    // Columns the new plan does not have. Deleted after the upserts so a set that survives keeps
    // its id, and with it every `Participant.chosenSetId` pointing at it.
    await tx.problemSet.deleteMany({ where: { contestId, label: { notIn: labels } } });

    await tx.contestProblem.createMany({
      data: plan.sets.flatMap((set) =>
        assignSlots(set.label, set.problems, composition).map((slot) => ({
          contestId,
          problemId: slot.problemId,
          divisionId: null,
          round: "INDIVIDUAL" as const,
          setId: setIdByLabel.get(set.label) ?? null,
          slotLabel: slot.slotLabel,
          basePoints: slot.basePoints,
          unlockAt: null,
        })),
      ),
    });

    await tx.contest.update({
      where: { id: contestId },
      data: {
        // Prisma types a Json column as `unknown` in, which is the same reason the schema comment
        // calls it a trust boundary in both directions: nothing but `SetCompositionSchema` decides
        // what is a valid recipe, on the way in here and on the way out in parseStoredComposition.
        setComposition: composition as unknown as Prisma.InputJsonValue,
        setCount,
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
                recipe: previousComposition === null ? null : describeComposition(previousComposition),
              },
        after: {
          seed,
          setCount,
          recipe: describeComposition(composition),
          sets: labels.join(", "),
          problems: labels.length * setSize(composition),
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
      setPlanSeed: true,
      problemSets: {
        select: {
          id: true,
          label: true,
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

  const [pool, groupProblemCount] = await Promise.all([
    gatherPool(contestId),
    prisma.contestProblem.count({ where: { contestId, round: "GROUP" } }),
  ]);

  return {
    contestId,
    contestState: contest.state,
    composition: parseStoredComposition(contest.setComposition),
    setCount: contest.setCount,
    seed: contest.setPlanSeed,
    poolSize: pool.length,
    // Sorted here, on both axes. Postgres returns rows in whatever order it likes, and a screen
    // whose columns reorder between two reads of unchanged data is one an organizer cannot check
    // against the sheet in front of them.
    sets: [...contest.problemSets]
      .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
      .map((set) => ({
        setId: set.id,
        label: set.label,
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
    groupProblemCount,
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
