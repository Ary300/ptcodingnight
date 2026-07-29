import { describe, expect, it } from "vitest";

import { aggregate, aggregateScore, aggregateVerdict } from "@/lib/judge/aggregate";
import type { JudgeTestCase, JudgeTestResult, Verdict } from "@/lib/schemas/judge";

const result = (verdict: Verdict, id = "t1"): JudgeTestResult => ({
  testCaseId: id,
  verdict,
  runtimeMs: 10,
  memoryKb: null,
  diffSnippet: null,
});

const testCase = (id: string, points: number): JudgeTestCase => ({
  testCaseId: id,
  ordinal: Number(id.slice(1)),
  inputPath: `/tmp/${id}.in`,
  expectedOutputPath: `/tmp/${id}.out`,
  isSample: false,
  points,
  group: null,
});

describe("aggregateVerdict", () => {
  it("is AC only when every test passed", () => {
    expect(aggregateVerdict([result("AC", "t1"), result("AC", "t2")])).toBe("AC");
  });

  it("reports the worst verdict across tests", () => {
    expect(aggregateVerdict([result("AC", "t1"), result("WA", "t2")])).toBe("WA");
    expect(aggregateVerdict([result("WA", "t1"), result("TLE", "t2")])).toBe("TLE");
    expect(aggregateVerdict([result("TLE", "t1"), result("RE", "t2")])).toBe("RE");
  });

  it("lets IE outrank everything", () => {
    // An internal error means we do not know whether the submission was correct, so it
    // cannot be reported as any specific student-facing failure.
    expect(aggregateVerdict([result("RE", "t1"), result("IE", "t2")])).toBe("IE");
    expect(aggregateVerdict([result("AC", "t1"), result("IE", "t2")])).toBe("IE");
  });

  it("treats a submission with no tests as IE, not AC", () => {
    // Zero tests means the problem is misconfigured. Calling that a pass hands out points
    // for nothing.
    expect(aggregateVerdict([])).toBe("IE");
  });
});

describe("aggregateScore", () => {
  const cases = [testCase("t1", 10), testCase("t2", 20), testCase("t3", 30)];

  it("awards points only for passing tests, enabling partial credit", () => {
    const results = [result("AC", "t1"), result("WA", "t2"), result("AC", "t3")];
    expect(aggregateScore(results, cases)).toBe(40);
  });

  it("awards nothing when everything failed", () => {
    expect(aggregateScore([result("WA", "t1"), result("TLE", "t2")], cases)).toBe(0);
  });

  it("ignores a result for an unknown test case rather than throwing", () => {
    expect(aggregateScore([result("AC", "ghost")], cases)).toBe(0);
  });
});

describe("aggregate", () => {
  const cases = [testCase("t1", 10), testCase("t2", 20)];

  it("short-circuits to CE when compilation failed", () => {
    const out = aggregate({
      submissionId: "s1",
      results: [result("AC", "t1")],
      testCases: cases,
      compileError: "Main.java:3: error: ';' expected",
    });

    expect(out.verdict).toBe("CE");
    expect(out.score).toBe(0);
    // No test ever ran, so reporting per-test results would be a fiction.
    expect(out.testResults).toEqual([]);
    expect(out.compileError).toContain("';' expected");
  });

  it("banks no points for an IE", () => {
    const out = aggregate({
      submissionId: "s1",
      results: [result("AC", "t1"), result("IE", "t2")],
      testCases: cases,
    });

    expect(out.verdict).toBe("IE");
    expect(out.score).toBe(0);
  });

  it("reports max runtime across tests, not the sum", () => {
    const out = aggregate({
      submissionId: "s1",
      results: [
        { ...result("AC", "t1"), runtimeMs: 100 },
        { ...result("AC", "t2"), runtimeMs: 250 },
      ],
      testCases: cases,
    });

    expect(out.runtimeMs).toBe(250);
  });

  it("reports null timing when nothing measured", () => {
    const out = aggregate({
      submissionId: "s1",
      results: [{ ...result("AC", "t1"), runtimeMs: null }],
      testCases: cases,
    });

    expect(out.runtimeMs).toBeNull();
    expect(out.memoryKb).toBeNull();
  });

  it("carries the full score on a clean sweep", () => {
    const out = aggregate({
      submissionId: "s1",
      results: [result("AC", "t1"), result("AC", "t2")],
      testCases: cases,
    });

    expect(out.verdict).toBe("AC");
    expect(out.score).toBe(30);
    expect(out.compileError).toBeNull();
  });
});
