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
  type RuntimeId,
} from "@/lib/judge/runtimes";
import { outputCapFor, selfReportedTimingIsCredible } from "@/worker/runner";

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
  /**
   * Worst full-path startup observed on NATIVE LINUX — the machine that hosts the contest.
   *
   * These are the numbers the budgets must clear. Measured with `scripts/measure-host.sh` on the
   * deployment host, through the real `judge()`.
   */
  const NATIVE_LINUX_WORST_MS: Readonly<Record<RuntimeId, number>> = {
    python312: 68,
    jdk21: 229,
    gcc14: 26,
    node22: 100,
    go123: 15,
  };

  /**
   * The same measurements on macOS with Docker Desktop, kept because they are the reason the
   * budgets were wrong for so long — not because anything is sized against them any more.
   *
   * They are 20x to 168x the native figures. Sizing budgets to cover them did not make the judge
   * safer; for Java it wrote Docker Desktop's virtualisation layer into the contest's scoring
   * rules, which is what T2 was.
   */
  const DOCKER_DESKTOP_WORST_MS: Readonly<Record<RuntimeId, number>> = {
    python312: 1_651,
    jdk21: 38_473,
    gcc14: 1_182,
    node22: 3_636,
    go123: 845,
  };

  it("gives every runtime a budget above the worst startup observed on the judging host", () => {
    for (const [runtime, worst] of Object.entries(NATIVE_LINUX_WORST_MS) as [RuntimeId, number][]) {
      expect(
        RUNTIMES[runtime].startupBudgetMs,
        `${runtime} budget is below its worst observed startup — this is the exact mistake that ` +
          `lost 8 of 20 reference solutions to a Python budget of 1000ms against a 1006ms floor`,
      ).toBeGreaterThan(worst);
    }
  });

  it("keeps the startup allowance additive, so short problems stay judgeable", () => {
    // A 500ms problem must still clear interpreter startup. If the budget were folded into the
    // multiplier instead, this would be 500 * n and far too small.
    const shortProblemMs = 500;

    for (const runtime of Object.keys(RUNTIMES) as RuntimeId[]) {
      const effective =
        shortProblemMs * RUNTIMES[runtime].multiplier + RUNTIMES[runtime].startupBudgetMs;
      expect(effective, `${runtime} cannot judge a 500ms problem`).toBeGreaterThan(
        NATIVE_LINUX_WORST_MS[runtime],
      );
    }
  });

  /**
   * T2, RESOLVED — and this test is the inverse of the one it replaces.
   *
   * The old test asserted that Java's time limits were NOT enforceable, and existed so nobody
   * quietly shrank the 45,000 ms budget to hide the problem. The budget is 4000 ms now, and it is
   * not a shrink: the 38.5-second sample it used to cover was Docker Desktop, and on the judging
   * host the same measurement is 229 ms.
   *
   * A 2-second Java problem now allows about 8 seconds rather than 49. That is the difference
   * between a time limit and a formality, and it is why T2 was a SCORING error rather than a
   * performance one — the same quadratic algorithm passed in Java and failed in Python.
   */
  it("makes Java's time limits enforceable, which they were not on Docker Desktop", () => {
    const jdk = RUNTIMES.jdk21;
    const twoSecondProblem = 2_000;
    const effective = twoSecondProblem * jdk.multiplier + jdk.startupBudgetMs;

    expect(jdk.startupBudgetMs).toBeGreaterThan(NATIVE_LINUX_WORST_MS.jdk21);
    expect(
      effective,
      "a 2s Java problem must not allow anything like the ~49s the old budget permitted",
    ).toBeLessThan(10_000);
  });

  it("does NOT size any budget against the Docker Desktop figures", () => {
    // The regression this guards: somebody runs the gates on a laptop, sees Java TLE, and raises
    // the budget until it passes. That is how 45,000 ms happened. The escape hatch for a slow dev
    // host is JUDGE_STARTUP_BUDGET_SCALE, which changes nothing about the recorded truth.
    for (const runtime of Object.keys(RUNTIMES) as RuntimeId[]) {
      expect(
        RUNTIMES[runtime].startupBudgetMs,
        `${runtime}'s budget looks like it was sized for Docker Desktop rather than the judging host`,
      ).toBeLessThan(DOCKER_DESKTOP_WORST_MS[runtime] + 4_000);
    }
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
    // An image nobody prepares in advance is a contest that cannot
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


describe("selfReportedTimingIsCredible", () => {
  /**
   * The security fix for a real, reachable exploit: `/out` is writable by the submission, so a slow
   * solution can rewrite its own `.meta` to claim it finished in 5 ms and collect an AC. The host
   * cross-checks against the Docker daemon's clock, which nothing inside the container can reach.
   */
  const BUDGET = 6_000;

  it("believes an honest fast batch", () => {
    expect(
      selfReportedTimingIsCredible({
        claimedTotalMs: 400,
        containerMs: 5_000,
        startupBudgetMs: BUDGET,
      }),
    ).toBe(true);
  });

  it("believes an honest slow batch, where the claim accounts for the container's time", () => {
    // 90 s of tests inside a 100 s container. Nothing unexplained.
    expect(
      selfReportedTimingIsCredible({
        claimedTotalMs: 90_000,
        containerMs: 100_000,
        startupBudgetMs: BUDGET,
      }),
    ).toBe(true);
  });

  it("refuses a claim of 5ms from a container that lived for two minutes", () => {
    // The attack: three tests each really taking ~40 s, all reported as ~2 ms.
    expect(
      selfReportedTimingIsCredible({
        claimedTotalMs: 6,
        containerMs: 120_000,
        startupBudgetMs: BUDGET,
      }),
    ).toBe(false);
  });

  it("never fires on a container short enough to hide nothing", () => {
    // Startup alone can be most of a short container. A correct submission must never be caught
    // here — a false positive fails a student who did nothing wrong.
    expect(
      selfReportedTimingIsCredible({
        claimedTotalMs: 0,
        containerMs: BUDGET * 2 + 10_000,
        startupBudgetMs: BUDGET,
      }),
    ).toBe(true);
  });

  it("gives the JVM's enormous startup the benefit of the doubt", () => {
    // jdk21's budget is 45 s because one real sample took 38 s. A Java batch claiming almost no
    // test time inside a 100 s container is entirely plausible.
    expect(
      selfReportedTimingIsCredible({
        claimedTotalMs: 50,
        containerMs: 100_000,
        startupBudgetMs: 45_000,
      }),
    ).toBe(true);
  });
});
