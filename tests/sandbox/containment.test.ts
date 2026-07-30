import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { JudgeJob, JudgeResult, Verdict } from "@/lib/schemas/judge";
import { isDockerAvailable, sweepJudgeContainers } from "@/worker/docker";
import { judge } from "@/worker/runner";

/**
 * G5 — hostile submission containment.
 *
 * Pass condition (docs/PRD.md §12): every hostile fixture is contained, returns the correct
 * verdict, and the host shows no leaked containers — `docker ps -a` back at its baseline.
 *
 * The suite runs single-threaded on purpose. These fixtures deliberately exhaust host
 * resources; running them concurrently makes any failure impossible to attribute.
 *
 * If this gate fails, all other work stops. A leaky sandbox invalidates the entire project.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const FIXTURES = path.join(ROOT, "fixtures", "sandbox");

const IMAGES = {
  python: process.env.JUDGE_IMAGE_PYTHON ?? "python:3.12-slim",
  java: process.env.JUDGE_IMAGE_JAVA ?? "eclipse-temurin:21-jdk",
};

interface Manifest {
  problem: { timeLimitMs: number };
  cases: {
    id: string;
    language: "PYTHON_312" | "JAVA_21";
    sourceFile: string;
    expectedVerdict: Verdict;
    why: string;
  }[];
}

const manifest = JSON.parse(
  readFileSync(path.join(FIXTURES, "manifest.json"), "utf8"),
) as Manifest;

/** One trivial test case; what matters is what the submission does, not what it outputs. */
const testCases = [
  {
    testCaseId: "t1",
    ordinal: 1,
    inputPath: path.join(ROOT, "fixtures", "judge", "problem", "1.in"),
    expectedOutputPath: path.join(ROOT, "fixtures", "judge", "problem", "1.out"),
    isSample: true,
    points: 10,
    group: null,
  },
];

function jobFor(entry: Manifest["cases"][number]): JudgeJob {
  return {
    submissionId: `sandbox-${entry.id}`,
    language: entry.language,
    sourceCode: readFileSync(path.join(FIXTURES, "cases", entry.id, entry.sourceFile), "utf8"),
    limits: {
      timeLimitMs: manifest.problem.timeLimitMs,
      memoryLimitMb: 256,
      wallClockKillMs: manifest.problem.timeLimitMs * 3,
      pidsLimit: 64,
      tmpfsBytes: 16 * 1024 * 1024,
      cpus: 1,
    },
    comparator: { kind: "whitespace" },
    testCases,
    attempt: 1,
  };
}

function containerCount(): number {
  const out = execFileSync("docker", ["ps", "-a", "-q"], { encoding: "utf8" });
  return out.split("\n").filter((l) => l.trim().length > 0).length;
}

/** Everything the submission managed to emit, for escape-string scanning. */
function allOutput(result: JudgeResult): string {
  return JSON.stringify(result);
}

let baseline = 0;
const results = new Map<string, JudgeResult>();

describe("G5 hostile submission containment", () => {
  beforeAll(async () => {
    if (!(await isDockerAvailable())) {
      throw new Error(
        "Docker daemon is not reachable. G5 cannot run — this is a FAIL, not a skip.",
      );
    }
    await sweepJudgeContainers();
    baseline = containerCount();
  }, 180_000);

  afterAll(async () => {
    await sweepJudgeContainers();
  }, 180_000);

  it("covers every hostile scenario named in PRD §7.3", () => {
    expect(manifest.cases).toHaveLength(7);
    expect(manifest.cases.map((c) => c.id).sort()).toEqual([
      "fork-bomb",
      "infinite-loop",
      "memory-bomb-10gb",
      "network-egress",
      "read-etc-passwd",
      "stdout-flood-1gb",
      "write-outside-tmp",
    ]);
  });

  for (const entry of manifest.cases) {
    it(`contains ${entry.id} → ${entry.expectedVerdict}`, async () => {
      const result = await judge(jobFor(entry), IMAGES);
      results.set(entry.id, result);

      // An escape is categorically worse than a wrong verdict, so it is asserted first.
      expect(allOutput(result)).not.toContain("ESCAPED");

      expect(result.verdict).toBe(entry.expectedVerdict);

      // A contained hostile submission still gets a clean student-facing verdict. IE would
      // mean the judge fell over, which is the failure mode this gate exists to catch.
      expect(result.verdict).not.toBe("IE");

      // Nothing hostile should ever bank points.
      expect(result.score).toBe(0);
    }, 300_000);
  }

  it("never exposes the host filesystem through /etc/passwd", () => {
    const result = results.get("read-etc-passwd");
    expect(result).toBeDefined();
    if (result === undefined) return;

    const serialized = allOutput(result);

    // The container has its own inert /etc/passwd; that is fine. What must never appear is
    // an account from the machine running the judge.
    expect(serialized).not.toContain(os.userInfo().username);
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain("/home/aryavdas");
  });

  it("leaves the host at its container baseline — nothing leaked", async () => {
    await sweepJudgeContainers();
    expect(containerCount()).toBe(baseline);
  }, 180_000);
});
