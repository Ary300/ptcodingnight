import { describe, expect, it } from "vitest";

import { OUTPUT_CAP_FLOOR_BYTES } from "@/worker/docker";
import { RUNTIME_BUDGETS, outputCapFor } from "@/worker/runner";

/**
 * Unit-level pin for the two judge bugs that made correct solutions fail.
 *
 * G4 and G13 catch these end-to-end, but both need containers and take minutes. These run
 * in milliseconds inside G3, so the regression is caught by the fastest gate as well as the
 * slowest.
 */

/** The real expected-output size of cut-the-sticks test 15, which reported WA. */
const CUT_THE_STICKS_EXPECTED_BYTES = 1_288_818;

/** The fixed cap that truncated it. */
const OLD_FIXED_CAP = 1024 * 1024;

describe("outputCapFor", () => {
  it("would have truncated the answer that reported WA under the old fixed cap", () => {
    // The premise of the regression. If this ever stops being true, the fixture below is
    // no longer testing anything.
    expect(CUT_THE_STICKS_EXPECTED_BYTES).toBeGreaterThan(OLD_FIXED_CAP);
  });

  it("leaves room for that answer now", () => {
    const cap = outputCapFor(CUT_THE_STICKS_EXPECTED_BYTES);

    expect(cap).toBeGreaterThan(CUT_THE_STICKS_EXPECTED_BYTES);
    // Generous, not merely sufficient: a correct solution may print slightly more than the
    // expected bytes (trailing newline, different but valid spacing).
    expect(cap).toBeGreaterThanOrEqual(CUT_THE_STICKS_EXPECTED_BYTES * 2);
  });

  it("never drops below the floor for a tiny expected output", () => {
    expect(outputCapFor(3)).toBe(OUTPUT_CAP_FLOOR_BYTES);
    expect(outputCapFor(0)).toBe(OUTPUT_CAP_FLOOR_BYTES);
  });

  it("still catches a flood by a wide margin", () => {
    // The hostile fixture writes 1 GB against a problem expecting a few bytes.
    const flood = 1024 * 1024 * 1024;
    expect(outputCapFor(64)).toBeLessThan(flood / 100);
  });

  it("scales with the problem rather than being a constant", () => {
    expect(outputCapFor(50_000_000)).toBeGreaterThan(outputCapFor(1_000_000));
  });
});

describe("RUNTIME_BUDGETS", () => {
  // Python's first budget was 1000ms — below the 1006ms MINIMUM startup measured on an idle
  // host — and it failed 8 of 20 correct reference solutions as TLE. These assert the
  // budgets stay above measured reality, so the same mistake cannot be made a third time.
  const MEASURED_PYTHON_STARTUP_MAX_QUIET = 1_651;
  const MEASURED_PYTHON_UNDER_CHURN = 4_327;
  const MEASURED_JAVA_STARTUP_MAX_QUIET = 5_342;

  it("gives Python more than its measured startup under load", () => {
    expect(RUNTIME_BUDGETS.PYTHON.startupBudgetMs).toBeGreaterThan(
      MEASURED_PYTHON_STARTUP_MAX_QUIET,
    );
    expect(RUNTIME_BUDGETS.PYTHON.startupBudgetMs).toBeGreaterThan(MEASURED_PYTHON_UNDER_CHURN);
  });

  it("gives Java more than its measured startup", () => {
    expect(RUNTIME_BUDGETS.JAVA.startupBudgetMs).toBeGreaterThan(MEASURED_JAVA_STARTUP_MAX_QUIET);
  });

  it("keeps the startup allowance additive, so short problems stay judgeable", () => {
    // A 500ms problem must still clear interpreter startup. If the budget were folded into
    // the multiplier instead, this would be 500 * n and far too small.
    const shortProblemMs = 500;
    const effective =
      shortProblemMs * RUNTIME_BUDGETS.PYTHON.multiplier +
      RUNTIME_BUDGETS.PYTHON.startupBudgetMs;

    expect(effective).toBeGreaterThan(MEASURED_PYTHON_UNDER_CHURN);
  });
});
