import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { JudgeJob, JudgeResult } from "@/lib/schemas/judge";
import type { SubmissionLane } from "@/worker/lanes";
import { judge } from "@/worker/runner";

/**
 * The slow lane must never change a verdict, a score, or a test's measured time beyond noise.
 *
 * Each submission is judged twice: with no lane, and with a lane that parks it at its first test
 * over the threshold and then makes EVERY later test wait 4 s for its slot — far longer than any
 * real wait, so a test that measured the wait, or a credibility check that counted the idle
 * container against the program, would show it. Both must agree test by test.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const FIXTURES = path.join(ROOT, "fixtures", "judge");
const WAIT_MS = 4_000;

function job(id: string, tests: number): JudgeJob {
  return {
    submissionId: `lane-${id}`,
    language: "JAVA_21",
    sourceCode: readFileSync(path.join(FIXTURES, "cases", id, "Main.java"), "utf8"),
    limits: { timeLimitMs: 2000, memoryLimitMb: 512, wallClockKillMs: 6000, pidsLimit: 64, tmpfsBytes: 16 << 20, cpus: 1 },
    comparator: { kind: "whitespace" },
    testCases: Array.from({ length: tests }, (_, i) => ({
      testCaseId: `t${String(i + 1)}`,
      ordinal: i + 1,
      inputPath: path.join(FIXTURES, "problem", `${String(i + 1)}.in`),
      expectedOutputPath: path.join(FIXTURES, "problem", `${String(i + 1)}.out`),
      isSample: i === 0,
      points: 10,
      group: null,
    })),
    attempt: 1,
    captureOutput: false,
  };
}

function slowLane(): SubmissionLane & { readonly slots: number } {
  let parked = false;
  let slots = 0;
  return {
    get parked() {
      return parked;
    },
    get slots() {
      return slots;
    },
    demote: () => {
      parked = true;
      return true;
    },
    testSlot: async () => {
      slots += 1;
      await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
      return () => undefined;
    },
  };
}

function shape(result: JudgeResult) {
  return { verdict: result.verdict, score: result.score, tests: result.testResults.map((t) => t.verdict) };
}

describe("slow lane", () => {
  for (const [id, expected] of [
    ["java-tle-first-then-ac", { verdict: "TLE", score: 20, tests: ["TLE", "AC", "AC"] }],
    ["java-tle-spin", { verdict: "TLE", score: 0, tests: ["TLE", "TLE", "TLE"] }],
    ["java-ac-scanner", { verdict: "AC", score: 30, tests: ["AC", "AC", "AC"] }],
  ] as const) {
    it(`${id}: parked and kept waiting, it is judged exactly as without a lane`, async () => {
      const plain = await judge(job(id, 3));
      const lane = slowLane();
      const parked = await judge(job(id, 3), undefined, undefined, { lane });
      expect(shape(plain)).toEqual(expected);
      expect(shape(parked)).toEqual(expected);
      // It really was parked, and really waited, whenever a test went over the threshold first.
      expect(lane.parked).toBe(expected.tests[0] === "TLE");
      expect(lane.slots).toBe(expected.tests[0] === "TLE" ? 2 : 0);
      // Per-test times are the program's, not the wait's.
      for (const [i, t] of parked.testResults.entries()) {
        if (t.verdict === "AC") expect(t.runtimeMs ?? 0).toBeLessThan(WAIT_MS);
        expect(Math.abs((t.runtimeMs ?? 0) - (plain.testResults[i]?.runtimeMs ?? 0))).toBeLessThan(2_000);
      }
    }, 300_000);
  }
});
