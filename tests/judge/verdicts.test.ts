import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import type { JudgeJob, Verdict } from "@/lib/schemas/judge";
import {
  LANGUAGE_IDS,
  RUNTIMES,
  VARIANTS,
  type LanguageId,
  type RuntimeId,
} from "@/lib/judge/runtimes";
import { isDockerAvailable, sweepJudgeContainers } from "@/worker/docker";
import { judge } from "@/worker/runner";

/**
 * G4 — judge verdict fixtures.
 *
 * Pass condition (docs/PRD.md §12): fixture submissions covering AC, WA, TLE, MLE, RE and CE
 * for every runtime, with every verdict matching exactly.
 *
 * Coverage is per RUNTIME rather than per variant. A runtime is the unit that gets an image, a
 * measured budget, and its own failure modes; the four Java levels share one JVM and the three
 * GCC standards share one compiler, so six verdicts × ten variants would re-run identical code
 * paths. What each VARIANT gets instead is a pair of fixtures proving its flag actually
 * applies — see the `variant-*` cases and the "language level actually applies" block below.
 *
 * There is no `passWithNoTests` and no skip-if-docker-missing. If the daemon is down this
 * suite fails loudly, because a judge suite that quietly passes by not running is worse
 * than one that fails.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const FIXTURES = path.join(ROOT, "fixtures", "judge");

/**
 * Per-runtime image overrides, for a judge host with differently-tagged pre-pulled images.
 * Absent means the registry's own image, which is the normal case.
 */
const IMAGES: Partial<Record<RuntimeId, string>> = Object.fromEntries(
  (Object.keys(RUNTIMES) as RuntimeId[])
    .map((id) => [id, process.env[`JUDGE_IMAGE_${id.toUpperCase()}`]])
    .filter((pair): pair is [RuntimeId, string] => pair[1] !== undefined),
);

/** The six verdicts a well-formed submission can produce. IE is not one of them. */
const STUDENT_VERDICTS: readonly Verdict[] = ["AC", "WA", "TLE", "MLE", "RE", "CE"];

interface Manifest {
  problem: { timeLimitMs: number; testCount: number; pointsPerTest: number };
  cases: {
    id: string;
    language: LanguageId;
    sourceFile: string;
    expectedVerdict: Verdict;
    /** Optional per-case override; MLE cases need room to actually allocate. */
    timeLimitMs?: number;
    memoryLimitMb?: number;
    /**
     * Test-data directory, defaulting to `problem/`. The large-output regression fixture
     * needs its own, because the shared problem's answer is a single line and could never
     * have exercised the stdout cap.
     */
    problemDir?: string;
    testCount?: number;
  }[];
}

const manifest = JSON.parse(
  readFileSync(path.join(FIXTURES, "manifest.json"), "utf8"),
) as Manifest;

function testCasesFor(entry: Manifest["cases"][number]) {
  const dir = entry.problemDir ?? "problem";
  const count = entry.testCount ?? manifest.problem.testCount;

  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      testCaseId: `t${n}`,
      ordinal: n,
      inputPath: path.join(FIXTURES, dir, `${n}.in`),
      expectedOutputPath: path.join(FIXTURES, dir, `${n}.out`),
      isSample: n === 1,
      points: manifest.problem.pointsPerTest,
      group: null,
    };
  });
}

function jobFor(entry: Manifest["cases"][number]): JudgeJob {
  const sourceCode = readFileSync(
    path.join(FIXTURES, "cases", entry.id, entry.sourceFile),
    "utf8",
  );

  const timeLimitMs = entry.timeLimitMs ?? manifest.problem.timeLimitMs;

  return {
    submissionId: entry.id,
    language: entry.language,
    sourceCode,
    limits: {
      timeLimitMs,
      // The JVM needs headroom before it even reaches main, so a 256 MB cap would OOM a
      // correct Java program. Keyed on the RUNTIME, not the variant: all four Java levels are
      // the same JVM and would otherwise each need remembering here.
      memoryLimitMb:
        entry.memoryLimitMb ?? (VARIANTS[entry.language].runtime === "jdk21" ? 512 : 256),
      wallClockKillMs: timeLimitMs * 3,
      pidsLimit: 64,
      tmpfsBytes: 16 * 1024 * 1024,
      cpus: 1,
    },
    comparator: { kind: "whitespace" },
    testCases: testCasesFor(entry),
    attempt: 1,
    captureOutput: false,
  };
}

describe("G4 judge fixtures", () => {
  beforeAll(async () => {
    const available = await isDockerAvailable();
    if (!available) {
      throw new Error(
        "Docker daemon is not reachable. G4 cannot run — this is a FAIL, not a skip.",
      );
    }
    await sweepJudgeContainers();
  }, 120_000);

  it("covers every student-reachable verdict", () => {
    expect(manifest.cases.length).toBeGreaterThanOrEqual(25);

    const covered = new Set(manifest.cases.map((c) => c.expectedVerdict));
    expect([...covered].sort()).toEqual([...STUDENT_VERDICTS].sort());
  });

  it("covers all six verdicts for every runtime in the registry", () => {
    // Derived from the registry, not from a hand-written list. Adding a runtime without
    // fixtures for it should fail here rather than ship unmeasured.
    for (const runtimeId of Object.keys(RUNTIMES) as RuntimeId[]) {
      const verdicts = new Set(
        manifest.cases
          .filter((c) => VARIANTS[c.language].runtime === runtimeId)
          .map((c) => c.expectedVerdict),
      );

      for (const verdict of STUDENT_VERDICTS) {
        expect(verdicts.has(verdict), `runtime ${runtimeId} has no ${verdict} fixture`).toBe(true);
      }
    }
  });

  it("exercises every variant the dropdown offers", () => {
    // A variant a student can pick but no fixture ever judges is an untested code path with a
    // student's score attached to it.
    const used = new Set(manifest.cases.map((c) => c.language));
    const unused = LANGUAGE_IDS.filter((id) => !used.has(id));

    expect(unused, `dropdown variants with no fixture: ${unused.join(", ")}`).toEqual([]);
  });

  for (const entry of manifest.cases) {
    it(`${entry.id} → ${entry.expectedVerdict}`, async () => {
      const result = await judge(jobFor(entry), IMAGES);

      expect(result.verdict).toBe(entry.expectedVerdict);

      // An AC must actually bank the points, or "AC" is just a label.
      const fullMarks = testCasesFor(entry).length * manifest.problem.pointsPerTest;
      if (entry.expectedVerdict === "AC") {
        expect(result.score).toBe(fullMarks);
      } else {
        expect(result.score).toBeLessThan(fullMarks);
      }

      // IE means the judge broke. It must never be the answer for a well-formed submission.
      expect(result.verdict).not.toBe("IE");

      // A CE must hand back what the compiler actually said. "Compilation failed" is the
      // runner's fallback for a build that produced no stderr at all, and a student cannot fix
      // anything from it — it is the string that hid the Go warm-cache timeout for three
      // rounds of debugging.
      if (entry.expectedVerdict === "CE") {
        expect(result.compileError, `${entry.id} produced no compiler output`).not.toBeNull();
        expect(result.compileError).not.toBe("Compilation failed");
      }
    });
  }

  /**
   * The variant level's only reason to exist.
   *
   * Each pair is byte-identical source judged at two language levels. Asserting the two
   * verdicts separately is not enough — what makes this a real test is that the SAME bytes
   * produce different answers, which is only possible if the flag is genuinely reaching the
   * compiler. A silently-dropped `-std=` or `--release` would let both AC, and every other
   * fixture in this suite would still pass.
   */
  describe("the language level actually applies", () => {
    const PAIRS = [
      {
        feature: "C++17 structured bindings and constexpr if",
        ok: "variant-cpp17-ok",
        rejected: "variant-cpp17-under-cpp11",
        flag: "-std=c++11",
      },
      {
        feature: "Java 21 records and switch patterns",
        ok: "variant-java21-ok",
        rejected: "variant-java21-under-java8",
        flag: "--release 8",
      },
    ] as const;

    for (const pair of PAIRS) {
      it(`${pair.feature} is rejected by ${pair.flag}`, async () => {
        const ok = manifest.cases.find((c) => c.id === pair.ok);
        const rejected = manifest.cases.find((c) => c.id === pair.rejected);
        expect(ok, `${pair.ok} missing from the manifest`).toBeDefined();
        expect(rejected, `${pair.rejected} missing from the manifest`).toBeDefined();
        if (ok === undefined || rejected === undefined) return;

        // The premise: identical bytes, different variant. If these ever diverge the pair
        // proves nothing, so check it rather than trusting the fixture directory.
        const sourceOf = (c: typeof ok) =>
          readFileSync(path.join(FIXTURES, "cases", c.id, c.sourceFile), "utf8");
        expect(sourceOf(ok)).toBe(sourceOf(rejected));
        expect(ok.language).not.toBe(rejected.language);

        const [passed, failed] = await Promise.all([judge(jobFor(ok), IMAGES), judge(jobFor(rejected), IMAGES)]);

        expect(passed.verdict, `${pair.ok} should compile at its own level`).toBe("AC");
        expect(failed.verdict, `${pair.rejected} should not compile under ${pair.flag}`).toBe("CE");

        // And the student must be told why, in the compiler's own words (PRD §7.2). "CE" with
        // no message on a feature-level mismatch is indistinguishable from a judge bug.
        expect(failed.compileError).not.toBeNull();
        expect(failed.compileError ?? "").not.toBe("Compilation failed");
        expect((failed.compileError ?? "").length).toBeGreaterThan(20);
      });
    }
  });

  it("never leaks a hidden test's expected output into a diff snippet", async () => {
    // The rule students would exploit first. A wrong answer may describe sample case 1 in
    // detail and must say nothing whatsoever about hidden cases 2 and 3.
    const wrong = manifest.cases.find((c) => c.expectedVerdict === "WA");
    expect(wrong).toBeDefined();
    if (wrong === undefined) return;

    const result = await judge(jobFor(wrong), IMAGES);
    const hidden = result.testResults.filter((r) => r.testCaseId !== "t1");

    expect(hidden.length).toBeGreaterThan(0);
    for (const r of hidden) {
      expect(r.diffSnippet).toBeNull();
    }

    const hiddenExpected = ["30", "0"];
    const serialized = JSON.stringify(result.testResults.filter((r) => r.testCaseId !== "t1"));
    for (const secret of hiddenExpected) {
      expect(serialized).not.toContain(`expected: ${secret}`);
    }
  });
});
