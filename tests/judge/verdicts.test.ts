import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import type { JudgeJob, Verdict } from "@/lib/schemas/judge";
import { isDockerAvailable, sweepJudgeContainers } from "@/worker/docker";
import { judge } from "@/worker/runner";

/**
 * G4 — judge verdict fixtures.
 *
 * Pass condition (docs/PRD.md §12): at least 24 fixture submissions covering AC, WA, TLE,
 * MLE, RE and CE across Python and Java, with every verdict matching exactly.
 *
 * There is no `passWithNoTests` and no skip-if-docker-missing. If the daemon is down this
 * suite fails loudly, because a judge suite that quietly passes by not running is worse
 * than one that fails.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const FIXTURES = path.join(ROOT, "fixtures", "judge");

const IMAGES = {
  python: process.env.JUDGE_IMAGE_PYTHON ?? "python:3.12-slim",
  java: process.env.JUDGE_IMAGE_JAVA ?? "eclipse-temurin:21-jdk",
};

interface Manifest {
  problem: { timeLimitMs: number; testCount: number; pointsPerTest: number };
  cases: {
    id: string;
    language: "PYTHON" | "JAVA";
    sourceFile: string;
    expectedVerdict: Verdict;
    /** Optional per-case override; MLE cases need room to actually allocate. */
    timeLimitMs?: number;
    memoryLimitMb?: number;
  }[];
}

const manifest = JSON.parse(
  readFileSync(path.join(FIXTURES, "manifest.json"), "utf8"),
) as Manifest;

const testCases = Array.from({ length: manifest.problem.testCount }, (_, i) => {
  const n = i + 1;
  return {
    testCaseId: `t${n}`,
    ordinal: n,
    inputPath: path.join(FIXTURES, "problem", `${n}.in`),
    expectedOutputPath: path.join(FIXTURES, "problem", `${n}.out`),
    isSample: n === 1,
    points: manifest.problem.pointsPerTest,
    group: null,
  };
});

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
      // Java needs headroom before the JVM even reaches main; the MLE fixtures still blow
      // through this by allocating unboundedly.
      memoryLimitMb: entry.memoryLimitMb ?? (entry.language === "JAVA" ? 512 : 256),
      wallClockKillMs: timeLimitMs * 3,
      pidsLimit: 64,
      tmpfsBytes: 16 * 1024 * 1024,
      cpus: 1,
    },
    comparator: { kind: "whitespace" },
    testCases,
    attempt: 1,
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

  it("has at least 24 fixtures covering every student-reachable verdict", () => {
    expect(manifest.cases.length).toBeGreaterThanOrEqual(24);

    const covered = new Set(manifest.cases.map((c) => c.expectedVerdict));
    expect([...covered].sort()).toEqual(["AC", "CE", "MLE", "RE", "TLE", "WA"]);

    const languages = new Set(manifest.cases.map((c) => c.language));
    expect([...languages].sort()).toEqual(["JAVA", "PYTHON"]);
  });

  for (const entry of manifest.cases) {
    it(`${entry.id} → ${entry.expectedVerdict}`, async () => {
      const result = await judge(jobFor(entry), IMAGES);

      expect(result.verdict).toBe(entry.expectedVerdict);

      // An AC must actually bank the points, or "AC" is just a label.
      if (entry.expectedVerdict === "AC") {
        expect(result.score).toBe(manifest.problem.testCount * manifest.problem.pointsPerTest);
      } else {
        expect(result.score).toBeLessThan(
          manifest.problem.testCount * manifest.problem.pointsPerTest,
        );
      }

      // IE means the judge broke. It must never be the answer for a well-formed submission.
      expect(result.verdict).not.toBe("IE");
    });
  }

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
