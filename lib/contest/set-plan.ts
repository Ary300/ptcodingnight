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
 *   - GROUP problems sit outside this entirely: the whole team works them together and every team
 *     gets the same ones (`ContestProblem.setId = null`, `ProblemRound.GROUP`).
 *
 * This file's job is only the first and fourth points: build N sets whose problems do not overlap,
 * to a recipe. Who holds which set is `set-assignment.ts`, unchanged and still correct.
 *
 * The recipe is historically one Easy, one Medium and one Hard, but it is an input rather than a
 * constant because the format has changed between years.
 *
 * ## Pure, seeded, and re-derivable
 *
 * No I/O, no `Date.now()`, no `Math.random()`. Same seed, same pool, same plan, byte for byte.
 * **A disputed set has to be explainable rather than argued about** (PRD §6.2): with the seed
 * stored, an organizer can re-derive the whole split in front of a room and show it was fixed
 * before anyone knew who would be holding which column.
 *
 * ## Feasibility is answered BEFORE anything is written
 *
 * Four sets needing one Hard each is four distinct Hard problems. A bank with two cannot do it,
 * and the useful moment to say so is while the organizer is still choosing the recipe, not after
 * half the sets exist. `planSets` therefore returns a refusal carrying the exact arithmetic rather
 * than throwing something vague.
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

export interface PlannedSet {
  /** "A", "B", "C", … in deal order. The column heading on the organizer's sheet. */
  readonly label: string;
  readonly problems: readonly AvailableProblem[];
}

/** One recipe line the pool cannot satisfy, with the arithmetic that says why. */
export interface Shortfall {
  readonly difficulty: Difficulty;
  /** `count × setCount` — how many distinct problems of this difficulty the recipe needs. */
  readonly needed: number;
  /** How many the pool actually holds. */
  readonly available: number;
}

export interface SetPlanInput {
  readonly seed: string;
  /**
   * How many sets to build: the number of columns on the sheet.
   *
   * In practice this is the size of the largest team, because every member of a team holds a
   * different set. Four members means four sets, and a fifth member would have to repeat a
   * column, which is why the UI derives the default from the roster and says so.
   */
  readonly setCount: number;
  readonly composition: SetComposition;
  readonly pool: readonly AvailableProblem[];
}

export type SetPlanResult =
  | { readonly ok: true; readonly sets: readonly PlannedSet[] }
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
 * Check a recipe against a pool WITHOUT building anything.
 *
 * Returns every shortfall rather than the first, because an organizer fixing one line at a time
 * against a form that only ever reports one problem is the slow way to discover they need six more
 * problems in total.
 */
export function checkFeasibility(
  composition: SetComposition,
  pool: readonly AvailableProblem[],
  setCount: number,
): Shortfall[] {
  const shortfalls: Shortfall[] = [];
  for (const entry of composition) {
    if (entry.count <= 0) continue;
    const needed = entry.count * setCount;
    const available = pool.filter((problem) => problem.difficulty === entry.difficulty).length;
    if (available < needed) shortfalls.push({ difficulty: entry.difficulty, needed, available });
  }
  return shortfalls;
}

/** The sentence an organizer reads when a recipe cannot be built. Names the exact arithmetic. */
export function shortfallMessage(shortfalls: readonly Shortfall[], setCount: number): string {
  const parts = shortfalls.map((shortfall) => {
    const label = DIFFICULTY_LABEL[shortfall.difficulty];
    const short = shortfall.needed - shortfall.available;
    return (
      `${String(shortfall.needed)} ${label} problems are needed for ${String(setCount)} sets ` +
      `and the bank has ${String(shortfall.available)}, so ${String(short)} more ` +
      `${label} ${short === 1 ? "problem is" : "problems are"} required`
    );
  });
  return `This split cannot be built: ${parts.join("; ")}.`;
}

/**
 * Build the contest's sets from the pool, to the recipe.
 *
 * Every problem is used at most once across all sets, so no two SETS ever share a question, and
 * therefore no two members of a team are ever handed the same problem. That is guaranteed
 * structurally: each difficulty's candidates are shuffled once and then DEALT without replacement,
 * so a repeat is not merely unlikely, it is unrepresentable.
 *
 * Within a set, problems are ordered as the recipe lists them, which is how the organizer wrote it
 * and therefore how they will read it back.
 */
export function planSets(input: SetPlanInput): SetPlanResult {
  const { seed, setCount, composition, pool } = input;

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

  const shortfalls = checkFeasibility(effective, pool, setCount);
  if (shortfalls.length > 0) {
    return { ok: false, shortfalls, message: shortfallMessage(shortfalls, setCount) };
  }

  // Shuffle each difficulty's candidates ONCE, then deal. Dealing from a per-difficulty queue is
  // what makes the no-repeat property structural rather than checked afterwards.
  const queues = new Map<Difficulty, AvailableProblem[]>();
  for (const entry of effective) {
    if (queues.has(entry.difficulty)) continue;
    const candidates = pool.filter((problem) => problem.difficulty === entry.difficulty);
    queues.set(
      entry.difficulty,
      seededShuffle(candidates, `${seed}:${entry.difficulty}`, (problem) => problem.problemId),
    );
  }

  const sets: PlannedSet[] = Array.from({ length: setCount }, (_unused, index) => {
    const problems: AvailableProblem[] = [];
    for (const entry of effective) {
      const queue = queues.get(entry.difficulty)!;
      for (let n = 0; n < entry.count; n += 1) {
        // Non-null by construction: feasibility already proved the queue is long enough.
        problems.push(queue.shift()!);
      }
    }
    return { label: setLabelAt(index), problems };
  });

  return { ok: true, sets };
}
