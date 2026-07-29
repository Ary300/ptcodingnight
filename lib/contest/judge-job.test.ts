import path from "node:path";

import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import {
  WALL_CLOCK_MULTIPLIER,
  buildJudgeJob,
  bytesToMegabytes,
  parseByteSize,
  resolveTestDataPath,
  type BuildJudgeJobInput,
  type TestCaseInput,
} from "@/lib/contest/judge-job";

const ROOT = "/srv/ptcn/testcases";

function testCase(overrides: Partial<TestCaseInput> = {}): TestCaseInput {
  return {
    id: "tc-1",
    ordinal: 1,
    inputPath: "bill-division/1.in",
    expectedOutputPath: "bill-division/1.out",
    isSample: false,
    points: 25,
    group: null,
    ...overrides,
  };
}

function input(overrides: Partial<BuildJudgeJobInput> = {}): BuildJudgeJobInput {
  return {
    submissionId: "sub-1",
    language: "PYTHON",
    sourceCode: "print(1)",
    problem: { timeLimitMs: 2000, memoryLimitMb: 256 },
    testCases: [testCase(), testCase({ id: "tc-2", ordinal: 2, isSample: true })],
    host: { testDataRoot: ROOT, memoryLimitMb: 256, pidsLimit: 64, tmpfsBytes: 16 * 1024 ** 2, cpus: 1 },
    ...overrides,
  };
}

describe("resolveTestDataPath", () => {
  it("resolves a relative path under the root", () => {
    expect(resolveTestDataPath(ROOT, "p/1.in")).toBe(path.join(ROOT, "p", "1.in"));
  });

  it("passes an absolute path through, which is how the judge fixtures are stored", () => {
    expect(resolveTestDataPath(ROOT, "/tmp/fixtures/1.in")).toBe("/tmp/fixtures/1.in");
  });

  it("refuses a path that climbs out of the root", () => {
    expect(() => resolveTestDataPath(ROOT, "../../etc/shadow")).toThrow(ValidationError);
  });

  it("refuses a path that climbs out and back, which normalization would otherwise hide", () => {
    expect(() => resolveTestDataPath(ROOT, "p/../../../etc/shadow")).toThrow(ValidationError);
  });

  it("refuses an empty path", () => {
    expect(() => resolveTestDataPath(ROOT, "   ")).toThrow(ValidationError);
  });
});

describe("parseByteSize", () => {
  it.each([
    ["16m", 16 * 1024 ** 2],
    ["256M", 256 * 1024 ** 2],
    ["1g", 1024 ** 3],
    ["512k", 512 * 1024],
    ["1048576", 1048576],
    ["16mb", 16 * 1024 ** 2],
  ])("parses %s", (value, expected) => {
    expect(parseByteSize(value)).toBe(expected);
  });

  it("refuses nonsense rather than guessing a limit", () => {
    expect(() => parseByteSize("lots")).toThrow(ValidationError);
    expect(() => parseByteSize("")).toThrow(ValidationError);
  });

  it("converts to whole megabytes, never rounding down to zero", () => {
    expect(bytesToMegabytes(256 * 1024 ** 2)).toBe(256);
    expect(bytesToMegabytes(1)).toBe(1);
  });
});

describe("buildJudgeJob", () => {
  it("sets the wall-clock kill at three times the problem limit", () => {
    const job = buildJudgeJob(input());
    expect(job.limits.wallClockKillMs).toBe(2000 * WALL_CLOCK_MULTIPLIER);
  });

  it("takes the lower of the problem's memory ask and the host's ceiling", () => {
    const job = buildJudgeJob(
      input({
        problem: { timeLimitMs: 1000, memoryLimitMb: 4096 },
        host: {
          testDataRoot: ROOT,
          memoryLimitMb: 256,
          pidsLimit: 64,
          tmpfsBytes: 1024,
          cpus: 1,
        },
      }),
    );
    expect(job.limits.memoryLimitMb).toBe(256);
  });

  it("resolves every test-case path against the root", () => {
    const job = buildJudgeJob(input());
    expect(job.testCases[0]?.inputPath).toBe(path.join(ROOT, "bill-division", "1.in"));
  });

  it("orders test cases by ordinal", () => {
    const job = buildJudgeJob(
      input({
        testCases: [
          testCase({ id: "b", ordinal: 5 }),
          testCase({ id: "a", ordinal: 2 }),
        ],
      }),
    );
    expect(job.testCases.map((t) => t.ordinal)).toEqual([2, 5]);
  });

  it("runs samples only when asked, so a free run cannot touch hidden cases", () => {
    const job = buildJudgeJob(input({ samplesOnly: true }));
    expect(job.testCases).toHaveLength(1);
    expect(job.testCases.every((t) => t.isSample)).toBe(true);
  });

  it("refuses a problem with no test cases rather than judging nothing", () => {
    expect(() => buildJudgeJob(input({ testCases: [] }))).toThrow(ValidationError);
  });

  it("refuses a samples-only run on a problem with no samples", () => {
    expect(() => buildJudgeJob(input({ testCases: [testCase()], samplesOnly: true }))).toThrow(
      ValidationError,
    );
  });

  it("defaults to the whitespace comparator", () => {
    expect(buildJudgeJob(input()).comparator).toEqual({ kind: "whitespace" });
  });

  it("starts at attempt 1 so the worker's retry budget is intact", () => {
    expect(buildJudgeJob(input()).attempt).toBe(1);
  });
});
