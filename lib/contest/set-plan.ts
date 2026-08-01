import { createHash } from "node:crypto";

/**
 * Building one problem set per TEAM, to a difficulty recipe the organizer chooses.
 *
 * ## The format this implements, which is the inverse of the old one
 *
 * `lib/contest/set-assignment.ts` assigns a set per PLAYER and deliberately balances *within* a
 * team so that teammates get DIFFERENT sets. That was built for a format this contest does not
 * run. The real format, from the organizer:
 *
 *   - a set is a property of a TEAM, not of a player;
 *   - every member of a team gets the WHOLE set and each of them tries to solve all of it;
 *   - different teams get DIFFERENT questions;
 *   - a set is composed to a difficulty recipe, historically one Easy, one Medium and one Hard,
 *     but the recipe is an organizer input rather than a constant.
 *
 * The anti-collusion property the old comment argued for is not lost, it moves: sharing inside a
 * team is the team working together, which is what a team score measures; sharing BETWEEN teams is
 * what distinct sets prevent, and that is what this file guarantees by construction.
 *
 * ## Pure, seeded, and re-derivable
 *
 * No I/O, no `Date.now()`, no `Math.random()`. Same seed, same teams, same pool, same plan, byte
 * for byte. **A disputed set has to be explainable rather than argued about** (PRD §6.2): with the
 * seed stored, an organizer can re-derive the whole split in front of a room and show it was fixed
 * before anyone knew which team was which.
 *
 * ## Feasibility is answered BEFORE anything is written
 *
 * Four teams needing one Hard each is four distinct Hard problems. A bank with two cannot do it,
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

export interface PlanTeam {
  readonly teamId: string;
  readonly name: string;
}

export interface PlannedSet {
  readonly teamId: string;
  readonly teamName: string;
  /** "A", "B", "C", … in the deal order, which is `teamId` order. */
  readonly label: string;
  readonly problems: readonly AvailableProblem[];
}

/** One recipe line the pool cannot satisfy, with the arithmetic that says why. */
export interface Shortfall {
  readonly difficulty: Difficulty;
  /** `count × teams` — how many distinct problems of this difficulty the recipe needs. */
  readonly needed: number;
  /** How many the pool actually holds. */
  readonly available: number;
}

export interface SetPlanInput {
  readonly seed: string;
  readonly teams: readonly PlanTeam[];
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
  teamCount: number,
): Shortfall[] {
  const shortfalls: Shortfall[] = [];
  for (const entry of composition) {
    if (entry.count <= 0) continue;
    const needed = entry.count * teamCount;
    const available = pool.filter((problem) => problem.difficulty === entry.difficulty).length;
    if (available < needed) shortfalls.push({ difficulty: entry.difficulty, needed, available });
  }
  return shortfalls;
}

/** The sentence an organizer reads when a recipe cannot be built. Names the exact arithmetic. */
export function shortfallMessage(shortfalls: readonly Shortfall[], teamCount: number): string {
  const parts = shortfalls.map((shortfall) => {
    const label = DIFFICULTY_LABEL[shortfall.difficulty];
    const short = shortfall.needed - shortfall.available;
    return (
      `${String(shortfall.needed)} ${label} problems are needed for ${String(teamCount)} teams ` +
      `and the bank has ${String(shortfall.available)}, so ${String(short)} more ` +
      `${label} ${short === 1 ? "problem is" : "problems are"} required`
    );
  });
  return `This split cannot be built: ${parts.join("; ")}.`;
}

/**
 * Build one set per team from the pool, to the recipe.
 *
 * Every problem is used at most once across the whole contest, so no two teams ever share a
 * question. That is guaranteed structurally: each difficulty's candidates are shuffled once and
 * then DEALT without replacement, so a repeat is not merely unlikely, it is unrepresentable.
 *
 * Teams are dealt in `teamId` order so the plan is byte-identical run to run and can be diffed
 * against a previous one. Within a set, problems are ordered as the recipe lists them, which is
 * how the organizer wrote it and therefore how they will read it back.
 */
export function planSets(input: SetPlanInput): SetPlanResult {
  const { seed, teams, composition, pool } = input;

  if (teams.length === 0) {
    return {
      ok: false,
      shortfalls: [],
      message: "There are no teams yet. Put students on teams before building the sets.",
    };
  }

  const effective = composition.filter((entry) => entry.count > 0);
  if (effective.length === 0) {
    return {
      ok: false,
      shortfalls: [],
      message: "The set is empty. Say how many problems of each difficulty a team should get.",
    };
  }

  const shortfalls = checkFeasibility(effective, pool, teams.length);
  if (shortfalls.length > 0) {
    return { ok: false, shortfalls, message: shortfallMessage(shortfalls, teams.length) };
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

  const orderedTeams = [...teams].sort((a, b) => (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0));

  const sets: PlannedSet[] = orderedTeams.map((team, index) => {
    const problems: AvailableProblem[] = [];
    for (const entry of effective) {
      const queue = queues.get(entry.difficulty)!;
      for (let n = 0; n < entry.count; n += 1) {
        // Non-null by construction: feasibility already proved the queue is long enough.
        problems.push(queue.shift()!);
      }
    }
    return {
      teamId: team.teamId,
      teamName: team.name,
      label: setLabelAt(index),
      problems,
    };
  });

  return { ok: true, sets };
}
