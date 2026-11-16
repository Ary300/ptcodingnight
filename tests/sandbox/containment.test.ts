import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { JudgeJob, JudgeResult, Verdict } from "@/lib/schemas/judge";
import { INSTANCE_LABEL, isDockerAvailable, judgeInstance, sweepJudgeContainers } from "@/worker/docker";
import { VARIANTS } from "@/lib/judge/runtimes";
import { ContainerPool } from "@/worker/container-pool";
import { JavacService } from "@/worker/javac-service";
import { RUNTIMES } from "@/lib/judge/runtimes";
import { judge, slotProfileForJob } from "@/worker/runner";

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
  java: process.env.JUDGE_IMAGE_JAVA ?? "ptcn-jdk:21",
};

interface Manifest {
  problem: { timeLimitMs: number };
  cases: {
    id: string;
    language: "PYTHON_312" | "JAVA_21";
    sourceFile: string;
    expectedVerdict: Verdict;
    why: string;
    /**
     * Optional: judge against this many tests of the G4 problem instead of the one trivial test.
     * A fixture that attacks the hand-over BETWEEN tests needs a next test to attack: test 1 is
     * the sample, whose snippet the student sees, and the rest are hidden.
     */
    testCount?: number;
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

/** The G4 problem's first `count` tests; only the first is a sample. */
function problemTests(count: number): JudgeJob["testCases"] {
  return Array.from({ length: count }, (_, i) => ({
    testCaseId: `t${String(i + 1)}`,
    ordinal: i + 1,
    inputPath: path.join(ROOT, "fixtures", "judge", "problem", `${String(i + 1)}.in`),
    expectedOutputPath: path.join(ROOT, "fixtures", "judge", "problem", `${String(i + 1)}.out`),
    isSample: i === 0,
    points: 10,
    group: null,
  }));
}

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
    testCases: entry.testCount === undefined ? testCases : problemTests(entry.testCount),
    attempt: 1,
    captureOutput: false,
  };
}

/**
 * Containers THIS gate could have made: the on-demand ones are named after the `sandbox-`
 * submission ids below, and the pre-created ones carry the pool's `pool-` infix. Counting every
 * container on the host (`docker ps -a`) failed this gate whenever anything else on the machine —
 * another checkout's gates, an MCP server — started or stopped a container meanwhile; the count
 * and the thing it checks have to name the same set (CLAUDE.md). The instance label narrows it to
 * this process, so another checkout's G5 running at the same time is not counted either.
 */
function containerCount(): number {
  const out = execFileSync(
    "docker",
    ["ps", "-a", "--filter", `label=${INSTANCE_LABEL}=${judgeInstance()}`, "--format", "{{.Names}}"],
    { encoding: "utf8" },
  );
  return out
    .split("\n")
    .filter((name) => name.startsWith("ptcn-judge-sandbox-") || name.startsWith("ptcn-judge-pool-"))
    .length;
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

  it("covers every hostile scenario named in PRD §7.4", () => {
    // Asserted as SCENARIOS present, not as an exact id list.
    //
    // Fixtures are named `[<runtime>-]<scenario>`, because containment is enforced by the container
    // flags — which are language-agnostic — while each runtime reaches the kernel by a different
    // path: raw BSD sockets in C++, Go's own network poller, libuv in Node. An exact-id assertion
    // made adding a per-runtime variant look like a failure, which is backwards: more coverage of
    // the same scenario is the thing this suite wants.
    const RUNTIME_PREFIXES = ["cpp-", "go-", "js-", "py-", "java-"];
    const scenarioOf = (id: string): string => {
      const prefix = RUNTIME_PREFIXES.find((p) => id.startsWith(p));
      return prefix === undefined ? id : id.slice(prefix.length);
    };

    const scenarios = new Set(manifest.cases.map((c) => scenarioOf(c.id)));

    expect([...scenarios].sort()).toEqual([
      /**
       * `/out` is the only mount that is genuinely WRITABLE, and it had no fixture at all.
       *
       * The four `write-outside-tmp` cases probe `/work`, `/etc`, `/` and `/usr/local` — every one
       * of them read-only. They proved the read-only rootfs and never touched the surface a
       * submission can actually write to, which is how a submission could fill the judge host's
       * disk through a passing G5 (T4).
       */
      "disk-fill-out",
      "disk-fill-subdir",
      /**
       * The other half of attacking the hand-over: print the right answer, forge "done" so the
       * clock stops, and keep running past the limit. Per process that is TLE, and so it must be
       * here — the driver times only to the output it froze and corroborates "done" from /proc.
       */
      "forged-done-busy",
      "fork-bomb",
      /**
       * The Java harness runs every test in one JVM, so a program shares a process with the code
       * that hands its tests over. This fixture forges that hand-over from inside — replies on the
       * harness's pipe, bells to the host, results for other tests — and leaves a thread behind
       * hunting for the next test's input. A hidden input reaching anything it can see is printed
       * after ESCAPED, which the escape check below catches.
       */
      "handshake-forgery",
      "infinite-loop",
      "memory-bomb-10gb",
      "network-egress",
      "read-etc-passwd",
      "stdout-flood-1gb",
      "write-outside-tmp",
    ]);
  });

  it("probes the kernel boundary from more than one runtime", () => {
    // Proving the boundary once in Python does not prove the boundary a C++ submission sees. The
    // flags are the same; the syscall path is not.
    const runtimes = new Set(manifest.cases.map((c) => VARIANTS[c.language].runtime));
    expect(runtimes.size).toBeGreaterThanOrEqual(4);
  });

  /**
   * Every case runs twice: in containers created on demand, and in containers PRE-CREATED by the
   * worker's pool (worker/container-pool.ts) — created before the submission existed, started for
   * it, queued for removal after it. The isolation flags are the same by construction (one spec,
   * one argument builder); this proves the containment is too.
   */
  const pool = new ContainerPool({ target: 0, removalBacklog: 10_000, isBusy: () => false });
  // Java compiles through the warm javac service in both modes, as in production.
  const javacService = new JavacService({ lanes: 1, image: RUNTIMES.jdk21.image, runtime: RUNTIMES.jdk21 });
  beforeAll(async () => {
    await javacService.start();
  }, 180_000);
  const pooledUse: boolean[] = [];

  for (const [mode, label] of [["fresh", ""], ["pooled", " (pre-created container)"]] as const) {
    for (const entry of manifest.cases) {
      it(`contains ${entry.id} → ${entry.expectedVerdict}${label}`, async () => {
        const job = jobFor(entry);
        if (mode === "pooled") await pool.prefill(await slotProfileForJob(job, IMAGES, true), 1);
        const result = await judge(job, IMAGES, undefined, {
          ...(mode === "pooled" ? { pool } : {}),
          javacService,
          onReport: (report) => {
            if (mode === "pooled") pooledUse.push(report.pooled);
          },
        });
        if (mode === "fresh") results.set(entry.id, result);

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
  }

  it("ran every pooled case in its pre-created containers", () => {
    expect(pooledUse.length).toBeGreaterThan(0);
    expect(pooledUse.every((used) => used)).toBe(true);
  });

  it("is back at its container baseline once the pool's removals have run", async () => {
    // The pool's idle-time work: remove every finished container it was holding for removal.
    await pool.maintain();
    expect(pool.stats().pendingRemoval).toBe(0);
    expect(containerCount()).toBe(baseline);
    await pool.close();
    await javacService.close();
  }, 180_000);

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
