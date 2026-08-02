/**
 * Convert the judge's per-test score into the point value configured for this contest slot.
 *
 * Test-case points describe how partial credit is divided. `ContestProblem.basePoints` describes
 * how much the problem is worth in this contest. Keeping that conversion at the persistence
 * boundary means every downstream reader (submission history, problem list and both standings
 * boards) sees one consistent score.
 */
export interface JudgeScoreNormalization {
  /** Sum of points awarded by the judge for passing test cases. */
  readonly rawScore: number;
  /** Sum of every test case's points for the authored problem. */
  readonly achievablePoints: number;
  /** Point value configured on the ContestProblem row. */
  readonly basePoints: number;
  /** True only when every test passed. */
  readonly accepted: boolean;
}

function requireNonnegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a nonnegative safe integer`);
  }
}

/**
 * Scale partial credit proportionally, rounding half up to the nearest whole contest point.
 *
 * Accepted submissions are pinned to `basePoints`. Besides making the advertised maximum exact,
 * that keeps a valid all-zero test suite from turning an accepted solution into a zero-point
 * solve. A malformed raw score is capped at the available test points so the judge cannot persist
 * more than the configured maximum.
 */
export function normalizeJudgeScore(input: JudgeScoreNormalization): number {
  requireNonnegativeSafeInteger(input.rawScore, "rawScore");
  requireNonnegativeSafeInteger(input.achievablePoints, "achievablePoints");
  requireNonnegativeSafeInteger(input.basePoints, "basePoints");

  if (input.accepted) return input.basePoints;
  if (input.rawScore === 0 || input.achievablePoints === 0 || input.basePoints === 0) return 0;

  const earned = Math.min(input.rawScore, input.achievablePoints);
  const numerator = BigInt(earned) * BigInt(input.basePoints);
  const denominator = BigInt(input.achievablePoints);

  // floor((2n + d) / 2d) is exact round-half-up for nonnegative rational n/d.
  return Number((2n * numerator + denominator) / (2n * denominator));
}
