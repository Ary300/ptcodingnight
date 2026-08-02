import { createHash } from "node:crypto";

/**
 * Problem set assignment for Round 1.
 *
 * Pure — no I/O, no `Date.now()`, no `Math.random()`. Same seed and same roster always produce the
 * same assignment, which is the entire point: **a disputed assignment has to be explainable rather
 * than argued about** (PRD §6.2).
 *
 * ## Why not Math.random()
 *
 * Because then nobody could ever check it. A student who believes they got the hard set has no
 * recourse against a number that no longer exists. With a stored seed an organizer can re-derive
 * the assignment in front of them and show that it was fixed before anyone knew who was on which
 * team.
 *
 * ## Why not naive random
 *
 * Naive per-player random would sometimes hand three members of a four-person team the same set.
 * That is bad for the contest — teammates working identical problems can trivially share answers,
 * and the point of parallel sets is that they cannot. Assignment is therefore **balanced within a
 * team first**: a team of four gets four different sets where the set count allows.
 */

/** Deterministic 32-bit hash of a string. Not cryptographic — it needs to be stable, not secret. */
function hash32(input: string): number {
  const digest = createHash("sha256").update(input, "utf8").digest();
  // Read four bytes as an unsigned int. `>>> 0` keeps it unsigned after the bit ops.
  return (
    ((digest[0]! << 24) | (digest[1]! << 16) | (digest[2]! << 8) | digest[3]!) >>> 0
  );
}

/**
 * Deterministic shuffle of `items`, driven entirely by `seedKey`.
 *
 * A sort comparator cannot be used for this: comparators must be consistent, and one built from a
 * hash of the pair is not, so the result would depend on the engine's sort implementation. This
 * assigns each item one stable sort key instead.
 */
function seededShuffle<T>(items: readonly T[], seedKey: string, keyOf: (item: T) => string): T[] {
  return [...items]
    .map((item) => ({ item, key: hash32(`${seedKey}:${keyOf(item)}`) }))
    .sort((a, b) => {
      if (a.key !== b.key) return a.key - b.key;
      // Hash collision: fall back to the id so the order is still deterministic.
      return keyOf(a.item) < keyOf(b.item) ? -1 : 1;
    })
    .map((entry) => entry.item);
}

export interface AssignableParticipant {
  readonly participantId: string;
  /** Null means the participant is on no team; they are still assigned a set. */
  readonly teamId: string | null;
}

export interface SetAssignment {
  readonly participantId: string;
  readonly setId: string;
}

export interface AssignSetsInput {
  /** `Contest.setAssignmentSeed`. Stored so the result can be re-derived. */
  readonly seed: string;
  readonly setIds: readonly string[];
  readonly participants: readonly AssignableParticipant[];
}

/**
 * Assign one problem set per participant.
 *
 * Balanced within each team: every teammate receives a distinct set. A team larger than the set
 * count is invalid and is refused instead of quietly repeating somebody else's questions.
 *
 * Returns assignments sorted by `participantId`, so the output is byte-identical run to run and can
 * be diffed against a previous assignment.
 */
export function assignSets(input: AssignSetsInput): SetAssignment[] {
  const { seed, setIds, participants } = input;

  if (setIds.length === 0) return [];

  const assignments: SetAssignment[] = [];

  // Group by team. Each participant with no team gets a private bucket: unassigned people are not
  // teammates and do not need distinct sets from one another.
  // An ordinary string, deliberately not a NUL sentinel.
  //
  // This was "\0no-team" with a literal NUL byte, which made git classify the whole file as BINARY:
  // `git diff` reported only "Bin 0 -> 7714 bytes". A diff-based review would not have seen a single
  // line of the file that decides which problems a competitor may read. Cuids are lowercase
  // alphanumerics, so they cannot collide with this.
  const byTeam = new Map<string, AssignableParticipant[]>();
  for (const participant of participants) {
    const key = participant.teamId ?? `__no_team__:${participant.participantId}`;
    const list = byTeam.get(key) ?? [];
    list.push(participant);
    byTeam.set(key, list);
  }

  // Teams are processed in a seeded order, and each team's rotation starts at a seeded offset, so
  // set "A" is not systematically given to whoever happens to sort first.
  const teamKeys = seededShuffle([...byTeam.keys()], `${seed}:teams`, (k) => k);

  for (const teamKey of teamKeys) {
    const members = byTeam.get(teamKey) ?? [];

    if (!teamKey.startsWith("__no_team__:") && members.length > setIds.length) {
      throw new RangeError(
        `Team ${teamKey} has ${String(members.length)} members but only ${String(setIds.length)} sets`,
      );
    }

    // Members in a seeded order, and the sets in a per-team seeded order. Both are needed: without
    // shuffling members, the same person always gets the team's first set; without shuffling sets,
    // every team's first member gets the same set.
    const orderedMembers = seededShuffle(members, `${seed}:${teamKey}:members`, (m) => m.participantId);
    const orderedSets = seededShuffle(setIds, `${seed}:${teamKey}:sets`, (s) => s);

    orderedMembers.forEach((member, index) => {
      // Capacity was checked above, so this direct index is both deterministic and unique within
      // the team. A non-null assertion is safe because members cannot outnumber sets here.
      const setId = orderedSets[index]!;
      assignments.push({ participantId: member.participantId, setId });
    });
  }

  return assignments.sort((a, b) =>
    a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0,
  );
}

/**
 * Assign ONE participant a set without disturbing anybody else.
 *
 * For a student who joins after assignment has already run. Re-deriving the whole assignment is not
 * an option: adding a participant changes the roster, `assignSets` would then produce a different
 * result for everyone, and students twenty minutes into a problem would find themselves holding a
 * different set. That is a worse outcome than a slightly less even distribution.
 *
 * So this preserves the format locally instead: it picks only from sets not used by the joiner's
 * teammates, and breaks ties from the seed so the choice is reproducible rather than arbitrary.
 *
 * `takenInTeam` is the sets that teammates already hold.
 */
export function assignSetForOne(options: {
  readonly seed: string;
  readonly setIds: readonly string[];
  readonly participantId: string;
  readonly takenInTeam: readonly string[];
}): string | null {
  const { seed, setIds, participantId, takenInTeam } = options;
  if (setIds.length === 0) return null;

  const taken = new Set(takenInTeam);
  // Only unused sets are candidates. If none remain the caller must refuse the roster change;
  // returning a repeated set here would violate the format without anything on screen saying so.
  const ordered = setIds
    .filter((setId) => !taken.has(setId))
    .sort(
      (a, b) =>
        hash32(`${seed}:${participantId}:${a}`) - hash32(`${seed}:${participantId}:${b}`),
    );

  return ordered[0] ?? null;
}

/**
 * Whether a participant may read a given contest problem's set.
 *
 * **Enforced in the API, not only in the UI** (PRD §6.2). A set a competitor can read is a set they
 * can practise on before their own round, and the route is callable directly regardless of what the
 * UI chooses to render.
 *
 * A GROUP problem has no set and is readable by everyone; that is what makes it a group problem.
 */
export function canReadSet(options: {
  readonly problemSetId: string | null;
  readonly participantSetId: string | null;
  readonly allowReadingUnassignedSets: boolean;
}): boolean {
  if (options.problemSetId === null) return true;
  if (options.allowReadingUnassignedSets) return true;
  return options.problemSetId === options.participantSetId;
}
