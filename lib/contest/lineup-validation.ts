/**
 * The line-up's duplicate rules, shared verbatim by the editor screen and the write path.
 *
 * ## Why "duplicate" is about SCOPE, not identity
 *
 * `ContestProblem` is unique on `(contestId, problemId, divisionId)`, and the seed history holds
 * exactly the case that constraint exists for: Bill Division ran as Intermediate/M and Advanced/E
 * in the same contest. So a problem appearing twice is not, by itself, an error. The error is a
 * problem appearing twice FOR THE SAME PLAYERS: twice in one division, or once division-null and
 * once anywhere, because `lib/contest/problems.ts` (`inScope`) shows a division-null row to every
 * player. The database would happily store that pair; a student in the scoped division would then
 * see the same question in two slots, both submittable, both worth points.
 *
 * Slot labels follow the identical overlap rule, and deliberately NOT global uniqueness. The
 * boards never key anything on a slot label: the team board's columns are SET labels, per-player
 * breakdowns key rows by `contestProblemId`, and the standings mapper sorts by the PAIR
 * `(slotLabel, contestProblemId)` precisely because the schema puts no uniqueness on `slotLabel`
 * (`lib/contest/standings.ts`). A player sees only their own division's problems, so "E1" in
 * Intermediate and "E1" in Advanced never share a screen. Requiring global uniqueness would force
 * the organizer's sheet, which numbers each division from E1, to be renumbered for no reader's
 * benefit.
 *
 * ## Why this is not two inline loops in `setContestProblems`
 *
 * The editor must refuse the same line-ups the server refuses, or Save becomes a button that
 * sometimes explains itself and sometimes round-trips to be told no. One module, imported by
 * both, is the only arrangement where the two cannot drift. Everything here is pure so the
 * client bundle can carry it.
 */

/** The three fields the duplicate rules read. Both callers hand in their own richer rows. */
export interface LineupScopeRow {
  readonly problemId: string;
  readonly divisionId: string | null;
  readonly slotLabel: string;
}

/**
 * Whether two division scopes reach any common player.
 *
 * Null is "all divisions", so it overlaps everything, including another null. Two distinct
 * division ids are the only disjoint pair.
 */
export function divisionScopesOverlap(a: string | null, b: string | null): boolean {
  return a === null || b === null || a === b;
}

/**
 * Rows whose problem would reach the same player twice.
 *
 * Returns row INDEXES, sorted, each at most once: the editor marks the offending rows and the
 * server only needs "is this empty". O(n²) over a line-up of a few dozen rows is nothing.
 */
export function problemDivisionConflicts(
  rows: readonly LineupScopeRow[],
): readonly number[] {
  const flagged = new Set<number>();
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i];
      const b = rows[j];
      if (a === undefined || b === undefined) continue;
      if (a.problemId !== b.problemId) continue;
      if (divisionScopesOverlap(a.divisionId, b.divisionId)) {
        flagged.add(i);
        flagged.add(j);
      }
    }
  }
  return [...flagged].sort((x, y) => x - y);
}

export interface SlotLabelConflicts {
  /** Each conflicted label once, in first-appearance order, as the organizer typed it (trimmed). */
  readonly labels: readonly string[];
  /** Every row bearing a conflicted label pair, sorted, each at most once. */
  readonly rowIndexes: readonly number[];
}

/**
 * Labels shared by two rows the same player could see.
 *
 * Case-insensitive and trimmed, which is the comparison the server has always made. Blank labels
 * are skipped: an empty label is a different fault with its own message, and reporting it twice
 * would send the organizer hunting for a duplicate that does not exist.
 */
export function slotLabelDivisionConflicts(
  rows: readonly LineupScopeRow[],
): SlotLabelConflicts {
  const labels = new Map<string, string>();
  const flagged = new Set<number>();
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i];
      const b = rows[j];
      if (a === undefined || b === undefined) continue;
      const labelA = a.slotLabel.trim();
      const labelB = b.slotLabel.trim();
      if (labelA === "" || labelB === "") continue;
      if (labelA.toLowerCase() !== labelB.toLowerCase()) continue;
      if (divisionScopesOverlap(a.divisionId, b.divisionId)) {
        if (!labels.has(labelA.toLowerCase())) labels.set(labelA.toLowerCase(), labelA);
        flagged.add(i);
        flagged.add(j);
      }
    }
  }
  return {
    labels: [...labels.values()],
    rowIndexes: [...flagged].sort((x, y) => x - y),
  };
}
