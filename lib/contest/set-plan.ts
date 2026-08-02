import { createHash } from "node:crypto";

/**
 * Building the contest's problem SETS, to a difficulty recipe the organizer chooses.
 *
 * ## The format this implements
 *
 * From the organizer's own sheet: the columns are sets and the rows are teams.
 *
 *     Questions │  A    │  B       │  C     │  D
 *     Group 1   │ John  │ Peter    │ Paul   │ Simon
 *     Group 2   │ Mark  │ Anthony  │ David  │ Bryan
 *
 * So:
 *   - a SET is a column: a fixed bundle of problems, here four of them, A to D;
 *   - **every member of a team gets a DIFFERENT set**, which is what
 *     `lib/contest/set-assignment.ts` already arranges by balancing within a team;
 *   - **a set is the same questions for everybody who holds it**, across teams: John and Mark
 *     both work set A;
 *   - sets differ FROM EACH OTHER, so A, B, C and D are twelve distinct problems under a
 *     one-of-each recipe;
 *   - GROUP problems sit outside the columns: the whole team works them together and every team
 *     gets the same ones (`ContestProblem.setId = null`, `ProblemRound.GROUP`). The recipe's
 *     `groupCount` says how many of those to draw, AFTER every division's sets are dealt, from
 *     problems no set anywhere took.
 *
 * ## Divisions
 *
 * When the contest has divisions, each division is dealt INDEPENDENTLY, to the same recipe, from
 * the FULL pool: the same problem may appear in two divisions (the seed history has exactly that
 * case: Bill Division was Intermediate/M and Advanced/E), but never twice within one division,
 * because within a division the deal is still without replacement. A contest with no divisions is
 * a single deal whose sets carry no division, and its shuffle keys are unchanged from before
 * divisions existed, so a stored seed still reproduces the same historical split byte for byte.
 *
 * ## Pure, seeded, and re-derivable
 *
 * No I/O, no `Date.now()`, no `Math.random()`. Same seed, same divisions, same pool, same plan,
 * byte for byte. **A disputed set has to be explainable rather than argued about** (PRD §6.2):
 * with the seed stored, an organizer can re-derive the whole split in front of a room and show it
 * was fixed before anyone knew who would be holding which column.
 *
 * ## Feasibility is answered BEFORE anything is written
 *
 * Four sets needing one Hard each is four distinct Hard problems, per division. A bank with two
 * cannot do it, and the useful moment to say so is while the organizer is still choosing the
 * recipe, not after half the sets exist. `planSets` therefore returns a refusal carrying the
 * exact arithmetic rather than throwing something vague — and it reports EVERY shortfall at
 * once, group questions included.
 *
 * The group-question check is deliberately worst-case: it assumes the divisions' deals do not
 * overlap at all, so `poolSize - divisions × setSize × setCount` problems remain. The actual
 * deal can only leave MORE than that, which makes the guarantee structural: a recipe that passes
 * the check can always draw its group questions, whatever the seed happens to deal.
 */

export type Difficulty = "E" | "M" | "H";

export const DIFFICULTY_LABEL: Readonly<Record<Difficulty, string>> = {
  E: "Easy",
  M: "Medium",
  H: "Hard",
};

/** One line of the recipe: "one Hard", "two Medium". */
export interface SetCompositionEntry {
  readonly difficulty: Difficulty;
  readonly count: number;
}

/**
 * The whole recipe for a single set. Historically `[E:1, M:1, H:1]`, but the organizer sets it:
 * the format has changed between years and hardcoding it is how a platform outlives its usefulness.
 */
export type SetComposition = readonly SetCompositionEntry[];

/** A problem the contest may draw on. `difficulty: null` cannot satisfy any recipe line. */
export interface AvailableProblem {
  readonly problemId: string;
  readonly slug: string;
  readonly title: string;
  readonly difficulty: Difficulty | null;
}

/** A division the plan must deal for. The id salts the shuffle; the name is for sentences. */
export interface PlanDivision {
  readonly id: string;
  readonly name: string;
}

export interface PlannedSet {
  /** "A", "B", "C", … in deal order. The column heading on the organizer's sheet. */
  readonly label: string;
  /** Null for a contest with no divisions. Labels restart at "A" within each division. */
  readonly divisionId: string | null;
  readonly divisionName: string | null;
  readonly problems: readonly AvailableProblem[];
}

/**
 * One demand the pool cannot satisfy, with the arithmetic that says why.
 *
 * `difficulty: null` is the team-question line: group questions have no difficulty constraint,
 * they only need problems no set took. `divisionName` names whose demand went short; null for a
 * contest with no divisions, and always null on the team-question line, which is contest-wide.
 */
export interface Shortfall {
  readonly difficulty: Difficulty | null;
  readonly divisionName: string | null;
  /** How many distinct problems this demand needs. */
  readonly needed: number;
  /** How many the pool can offer it. */
  readonly available: number;
}

export interface SetPlanInput {
  readonly seed: string;
  /**
   * How many sets to build PER DIVISION: the number of columns on the organizer's sheet.
   *
   * In practice this is the size of the largest team, because every member of a team holds a
   * different set. Four members means four sets, and a fifth member would have to repeat a
   * column, which is why the UI derives the default from the roster and says so.
   */
  readonly setCount: number;
  readonly composition: SetComposition;
  readonly pool: readonly AvailableProblem[];
  /** The contest's divisions, in board order. Empty (or absent) means the contest has none. */
  readonly divisions?: readonly PlanDivision[];
  /** How many whole-team questions to draw after all divisions are dealt. Absent means none. */
  readonly groupCount?: number;
}

export type SetPlanResult =
  | {
      readonly ok: true;
      /** Every division's columns, flat, in division order then label order. */
      readonly sets: readonly PlannedSet[];
      /** The whole-team questions, drawn from problems no set in any division took. */
      readonly groupProblems: readonly AvailableProblem[];
    }
  | { readonly ok: false; readonly shortfalls: readonly Shortfall[]; readonly message: string };

/** Deterministic 32-bit hash. Stable, not secret. */
function hash32(input: string): number {
  const digest = createHash("sha256").update(input, "utf8").digest();
  return ((digest[0]! << 24) | (digest[1]! << 16) | (digest[2]! << 8) | digest[3]!) >>> 0;
}

/**
 * Deterministic shuffle driven entirely by `seedKey`.
 *
 * One stable sort key per item, never a comparator built from a hash of the pair: comparators must
 * be consistent, and that kind is not, so the result would depend on the engine's sort.
 */
function seededShuffle<T>(items: readonly T[], seedKey: string, keyOf: (item: T) => string): T[] {
  return [...items]
    .map((item) => ({ item, key: hash32(`${seedKey}:${keyOf(item)}`) }))
    .sort((a, b) => {
      if (a.key !== b.key) return a.key - b.key;
      // Hash collision: fall back to the id, so the order is still total and still deterministic.
      return keyOf(a.item) < keyOf(b.item) ? -1 : 1;
    })
    .map((entry) => entry.item);
}

/** The set labels, in deal order: A, B, … Z, AA, AB, … A contest will never need the second row. */
export function setLabelAt(index: number): string {
  let label = "";
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/** How many problems one set holds under this recipe. */
export function setSize(composition: SetComposition): number {
  return composition.reduce((total, entry) => total + entry.count, 0);
}

/**
 * Check a recipe against a pool WITHOUT building anything, for one division (or for the whole
 * contest when it has none: pass null).
 *
 * Each division is checked against the FULL pool, because divisions deal independently and may
 * reuse each other's problems; depletion only enters the arithmetic for group questions, which
 * `checkGroupFeasibility` covers.
 *
 * Returns every shortfall rather than the first, because an organizer fixing one line at a time
 * against a form that only ever reports one problem is the slow way to discover they need six more
 * problems in total.
 */
export function checkFeasibility(
  composition: SetComposition,
  pool: readonly AvailableProblem[],
  setCount: number,
  divisionName: string | null = null,
): Shortfall[] {
  const shortfalls: Shortfall[] = [];
  for (const entry of composition) {
    if (entry.count <= 0) continue;
    const needed = entry.count * setCount;
    const available = pool.filter((problem) => problem.difficulty === entry.difficulty).length;
    if (available < needed) {
      shortfalls.push({ difficulty: entry.difficulty, divisionName, needed, available });
    }
  }
  return shortfalls;
}

/**
 * Whether the pool can still yield `groupCount` team questions after every division is dealt.
 *
 * Worst case on purpose: assumes the divisions' deals never overlap, so the remainder is the
 * smallest it can be. Seed-independent — a recipe must not be feasible under one seed and short
 * under another, or the refusal stops being explainable arithmetic and becomes luck.
 */
export function checkGroupFeasibility(
  composition: SetComposition,
  pool: readonly AvailableProblem[],
  setCount: number,
  divisionCount: number,
  groupCount: number,
): Shortfall[] {
  if (groupCount <= 0) return [];
  const rated = pool.filter((problem) => problem.difficulty !== null).length;
  const dealtWorstCase = Math.max(1, divisionCount) * setSize(composition) * setCount;
  const available = Math.max(0, rated - dealtWorstCase);
  if (available >= groupCount) return [];
  return [{ difficulty: null, divisionName: null, needed: groupCount, available }];
}

/** The sentence an organizer reads when a recipe cannot be built. Names the exact arithmetic. */
export function shortfallMessage(shortfalls: readonly Shortfall[], setCount: number): string {
  const parts = shortfalls.map((shortfall) => {
    const short = shortfall.needed - shortfall.available;
    if (shortfall.difficulty === null) {
      // The team-question line: its arithmetic is depletion, because group questions draw from
      // what remains after every division's sets are dealt.
      return (
        `${String(shortfall.needed)} team ${shortfall.needed === 1 ? "question is" : "questions are"} ` +
        `needed and at most ${String(shortfall.available)} ${shortfall.available === 1 ? "problem remains" : "problems remain"} ` +
        `after the sets are dealt, so ${String(short)} more ` +
        `${short === 1 ? "problem is" : "problems are"} required`
      );
    }
    const label = DIFFICULTY_LABEL[shortfall.difficulty];
    const sentence =
      `${String(shortfall.needed)} ${label} problems are needed for ${String(setCount)} sets ` +
      `and the bank has ${String(shortfall.available)}, so ${String(short)} more ` +
      `${label} ${short === 1 ? "problem is" : "problems are"} required`;
    return shortfall.divisionName === null ? sentence : `${shortfall.divisionName}: ${sentence}`;
  });
  return `This split cannot be built: ${parts.join("; ")}.`;
}

/**
 * Build the contest's sets from the pool, to the recipe, one deal per division.
 *
 * Within a division every problem is used at most once across its sets, so no two SETS of one
 * division ever share a question, and therefore no two members of a team are ever handed the same
 * problem. That is guaranteed structurally: each difficulty's candidates are shuffled once per
 * division and then DEALT without replacement, so a repeat is not merely unlikely, it is
 * unrepresentable. Different divisions MAY receive the same problem; their players never see each
 * other's sets, and the seed history did exactly this.
 *
 * Group questions are drawn last, from problems no division's sets took, so a whole-team question
 * can never also be somebody's individual question.
 *
 * Within a set, problems are ordered as the recipe lists them, which is how the organizer wrote it
 * and therefore how they will read it back.
 */
export function planSets(input: SetPlanInput): SetPlanResult {
  const { seed, setCount, composition, pool } = input;
  const divisions = input.divisions ?? [];
  const groupCount = input.groupCount ?? 0;

  if (setCount <= 0) {
    return {
      ok: false,
      shortfalls: [],
      message: "Say how many sets to build. One per member of the largest team is the usual answer.",
    };
  }

  const effective = composition.filter((entry) => entry.count > 0);
  if (effective.length === 0) {
    return {
      ok: false,
      shortfalls: [],
      message: "The set is empty. Say how many problems of each difficulty a set should hold.",
    };
  }

  // One deal per division; a contest with no divisions is one deal that carries none. The null
  // scope keeps the pre-division shuffle keys, so an already-stored seed replays byte-identically.
  const scopes: readonly (PlanDivision | null)[] = divisions.length > 0 ? divisions : [null];

  const shortfalls = [
    ...scopes.flatMap((scope) =>
      checkFeasibility(effective, pool, setCount, scope?.name ?? null),
    ),
    ...checkGroupFeasibility(effective, pool, setCount, scopes.length, groupCount),
  ];
  if (shortfalls.length > 0) {
    return { ok: false, shortfalls, message: shortfallMessage(shortfalls, setCount) };
  }

  const sets: PlannedSet[] = [];
  const dealt = new Set<string>();

  for (const scope of scopes) {
    // Shuffle each difficulty's candidates ONCE per division, then deal. Dealing from a
    // per-difficulty queue is what makes the no-repeat property structural rather than checked
    // afterwards. The division id salts the shuffle so two divisions do not receive mirror decks.
    const saltFor = (difficulty: Difficulty): string =>
      scope === null ? `${seed}:${difficulty}` : `${seed}:${scope.id}:${difficulty}`;

    const queues = new Map<Difficulty, AvailableProblem[]>();
    for (const entry of effective) {
      if (queues.has(entry.difficulty)) continue;
      const candidates = pool.filter((problem) => problem.difficulty === entry.difficulty);
      queues.set(
        entry.difficulty,
        seededShuffle(candidates, saltFor(entry.difficulty), (problem) => problem.problemId),
      );
    }

    for (let index = 0; index < setCount; index += 1) {
      const problems: AvailableProblem[] = [];
      for (const entry of effective) {
        const queue = queues.get(entry.difficulty)!;
        for (let n = 0; n < entry.count; n += 1) {
          // Non-null by construction: feasibility already proved the queue is long enough.
          const problem = queue.shift()!;
          problems.push(problem);
          dealt.add(problem.problemId);
        }
      }
      sets.push({
        label: setLabelAt(index),
        divisionId: scope?.id ?? null,
        divisionName: scope?.name ?? null,
        problems,
      });
    }
  }

  // Team questions last, from what no set anywhere took. Only rated problems: a group question
  // still needs a difficulty to be priced. Feasibility already proved the remainder is large
  // enough, worst case, so the slice below can never come up short.
  const groupProblems =
    groupCount <= 0
      ? []
      : seededShuffle(
          pool.filter(
            (problem) => problem.difficulty !== null && !dealt.has(problem.problemId),
          ),
          `${seed}:group`,
          (problem) => problem.problemId,
        ).slice(0, groupCount);

  return { ok: true, sets, groupProblems };
}
