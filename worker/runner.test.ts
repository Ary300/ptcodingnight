import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { OUTPUT_CAP_FLOOR_BYTES } from "@/worker/docker";
import {
  LANGUAGE_IDS,
  RUNTIMES,
  VARIANTS,
  runtimeFor,
  variantsOfRuntime,
} from "@/lib/judge/runtimes";
import { outputCapFor } from "@/worker/runner";

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

describe("runtime startup budgets", () => {
  // Python's first budget was 1000ms — below the 1006ms MINIMUM startup measured on an idle
  // host — and it failed 8 of 20 correct reference solutions as TLE. These assert the
  // budgets stay above measured reality, so the same mistake cannot be made a third time.
  const MEASURED_PYTHON_STARTUP_MAX_QUIET = 1_651;
  const MEASURED_PYTHON_UNDER_CHURN = 4_327;
  const MEASURED_JAVA_STARTUP_MAX_QUIET = 5_342;

  it("gives Python more than its measured startup under load", () => {
    expect(RUNTIMES.python312.startupBudgetMs).toBeGreaterThan(
      MEASURED_PYTHON_STARTUP_MAX_QUIET,
    );
    expect(RUNTIMES.python312.startupBudgetMs).toBeGreaterThan(MEASURED_PYTHON_UNDER_CHURN);
  });

  it("gives Java more than its measured startup", () => {
    expect(RUNTIMES.jdk21.startupBudgetMs).toBeGreaterThan(MEASURED_JAVA_STARTUP_MAX_QUIET);
  });

  it("keeps the startup allowance additive, so short problems stay judgeable", () => {
    // A 500ms problem must still clear interpreter startup. If the budget were folded into
    // the multiplier instead, this would be 500 * n and far too small.
    const shortProblemMs = 500;
    const effective =
      shortProblemMs * RUNTIMES.python312.multiplier +
      RUNTIMES.python312.startupBudgetMs;

    expect(effective).toBeGreaterThan(MEASURED_PYTHON_UNDER_CHURN);
  });
});

describe("registry integrity", () => {
  it("every variant points at a runtime that exists", () => {
    for (const id of LANGUAGE_IDS) {
      expect(RUNTIMES[VARIANTS[id].runtime], `${id} names an unknown runtime`).toBeDefined();
    }
  });

  it("offers ten dropdown picks across five runtimes", () => {
    expect(LANGUAGE_IDS).toHaveLength(10);
    expect(new Set(LANGUAGE_IDS.map((id) => VARIANTS[id].runtime)).size).toBe(5);
  });

  it("shares one budget across the variants of a runtime", () => {
    // The point of the two-level split: Java's four levels are the same JVM, so measuring or
    // tuning them separately would be measuring the same thing four times and inviting drift.
    for (const runtime of ["jdk21", "gcc14"] as const) {
      const ids = variantsOfRuntime(runtime);
      expect(ids.length).toBeGreaterThan(1);
      const budgets = new Set(ids.map((id) => runtimeFor(id).startupBudgetMs));
      expect(budgets.size, `${runtime} variants disagree about their budget`).toBe(1);
    }
  });

  it("gives every variant a source file, a run command, and a starter", () => {
    for (const id of LANGUAGE_IDS) {
      const v = VARIANTS[id];
      expect(v.sourceFile, id).toBeTruthy();
      expect(v.runCommand, id).toBeTruthy();
      expect(v.starter.trim().length, id).toBeGreaterThan(0);
    }
  });

  it("writes artifacts to /build exactly when it says it produces them", () => {
    for (const id of LANGUAGE_IDS) {
      const v = VARIANTS[id];
      if (v.producesArtifacts) {
        expect(v.compileCommand, `${id} produces artifacts but has no compile command`).toContain(
          "/build",
        );
        expect(v.runCommand, `${id} produces artifacts but does not run from /build`).toContain(
          "/build",
        );
      } else {
        expect(v.runCommand, `${id} claims no artifacts but runs from /build`).not.toContain(
          "/build",
        );
      }
    }
  });

  it("gives a compiled runtime more build CPU than the run container", () => {
    // The run container is pinned to one CPU so every student is timed against the same
    // machine. A build is not timed, so starving it only inflates latency — 94-127s against
    // 44s for the same `go build`.
    expect(RUNTIMES.go123.compileCpus).toBeGreaterThan(1);
    for (const id of LANGUAGE_IDS) {
      expect(runtimeFor(id).compileCpus, `${id} has a nonsensical compile CPU count`)
        .toBeGreaterThanOrEqual(1);
    }
  });

  it("prepares every image the registry names in scripts/build-judge-images.sh", () => {
    // The night has no internet, so an image nobody pulls in advance is a contest that cannot
    // start. This is the check that makes adding a runtime fail loudly here rather than at
    // 6pm on the night.
    const script = readFileSync(
      path.join(__dirname, "..", "scripts", "build-judge-images.sh"),
      "utf8",
    );

    for (const runtime of Object.values(RUNTIMES)) {
      expect(
        script.includes(runtime.image),
        `${runtime.id}'s image ${runtime.image} is never pulled or built by scripts/build-judge-images.sh`,
      ).toBe(true);
    }
  });

  it("gives a compiled runtime more build memory than a problem's run limit", () => {
    // A cgroup has one cap, which is why compiled languages build in their own container.
    // If these were equal there would be no reason for the split and MLE would be unreliable.
    for (const runtime of ["jdk21", "gcc14", "go123"] as const) {
      expect(RUNTIMES[runtime].compileMemoryLimitMb).toBeGreaterThan(256);
    }
  });
});
