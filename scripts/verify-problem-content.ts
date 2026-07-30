// Standalone tsx entrypoint — load .env before anything reads process.env.
import "dotenv/config";

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

import type { JudgeJob } from "@/lib/schemas/judge";
import { isDockerAvailable, sweepJudgeContainers } from "@/worker/docker";
import { judge } from "@/worker/runner";

/**
 * G13 — reference solutions must survive the real judge.
 *
 * Every problem with authored content has its reference solution run through the actual
 * judge, in real containers, against its own test data. It must score `AC` with full marks.
 *
 * ## Why this is a gate and not a one-off script
 *
 * The content agents verified their references with local `python3`, which proves the
 * *algorithm*. It does not prove the problem is **judgeable**. The first run of this check
 * failed 9 of 20 problems that were all algorithmically correct:
 *
 *   - 8 x TLE, because the judge's Python startup budget was smaller than the measured
 *     interpreter startup, so correct solutions ran out of clock before doing any work.
 *   - 1 x WA, because a fixed 1 MiB stdout cap truncated a legitimately 1.29 MB answer,
 *     killed the container, and returned the same verdict a wrong answer gets.
 *
 * Neither was visible from local execution, and neither was caught by G4, whose fixtures all
 * used a problem whose output is a single line. Without this gate, eight problems ship
 * unsolvable and one punishes every correct submission.
 *
 * Container-bound and deliberately SEQUENTIAL. Must not run concurrently with G8, which is
 * also container-bound — competing workloads make both sets of timings meaningless.
 */

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, "content", "problems");

const IMAGES = {
  python: process.env.JUDGE_IMAGE_PYTHON ?? "python:3.12-slim",
  java: process.env.JUDGE_IMAGE_JAVA ?? "eclipse-temurin:21-jdk",
};

const REQUIRED_FILES = ["problem.json", "statement.md", "reference.py", "generator.py"] as const;

interface ProblemMeta {
  slug: string;
  title: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  sampleCount: number;
}

interface Incomplete {
  slug: string;
  missing: string[];
}

function discover(): { problems: ProblemMeta[]; incomplete: Incomplete[] } {
  if (!existsSync(CONTENT)) return { problems: [], incomplete: [] };

  const problems: ProblemMeta[] = [];
  const incomplete: Incomplete[] = [];

  for (const slug of readdirSync(CONTENT).sort()) {
    const dir = path.join(CONTENT, slug);
    const missing: string[] = REQUIRED_FILES.filter((f) => !existsSync(path.join(dir, f)));

    const testDir = path.join(dir, "tests");
    const inputs = existsSync(testDir)
      ? readdirSync(testDir).filter((f) => f.endsWith(".in"))
      : [];
    if (inputs.length === 0) missing.push("tests/*.in");

    // Every input needs its expected output, or the problem is only partly generated.
    for (const f of inputs) {
      const out = path.join(testDir, f.replace(/\.in$/, ".out"));
      if (!existsSync(out)) missing.push(`tests/${path.basename(out)}`);
    }

    if (missing.length > 0) {
      incomplete.push({ slug, missing });
      continue;
    }

    const raw = JSON.parse(
      readFileSync(path.join(dir, "problem.json"), "utf8"),
    ) as Partial<ProblemMeta>;

    problems.push({
      slug,
      title: raw.title ?? slug,
      timeLimitMs: raw.timeLimitMs ?? 2000,
      memoryLimitMb: raw.memoryLimitMb ?? 256,
      sampleCount: raw.sampleCount ?? 2,
    });
  }

  return { problems, incomplete };
}

function jobFor(meta: ProblemMeta): JudgeJob {
  const dir = path.join(CONTENT, meta.slug);
  const testDir = path.join(dir, "tests");

  const testCases = readdirSync(testDir)
    .filter((f) => f.endsWith(".in"))
    .sort()
    .map((f, i) => {
      const base = f.replace(/\.in$/, "");
      return {
        testCaseId: base,
        ordinal: i + 1,
        inputPath: path.join(testDir, f),
        expectedOutputPath: path.join(testDir, `${base}.out`),
        isSample: i < meta.sampleCount,
        points: 10,
        group: null,
      };
    });

  return {
    submissionId: `g13-${meta.slug}`,
    language: "PYTHON",
    sourceCode: readFileSync(path.join(dir, "reference.py"), "utf8"),
    limits: {
      timeLimitMs: meta.timeLimitMs,
      memoryLimitMb: meta.memoryLimitMb,
      wallClockKillMs: meta.timeLimitMs * 3,
      pidsLimit: 64,
      tmpfsBytes: 16 * 1024 * 1024,
      cpus: 1,
    },
    comparator: { kind: "whitespace" },
    testCases,
    attempt: 1,
  };
}

/**
 * A problem that has left DRAFT without being authored has shipped without ever being
 * verified — the thing PRD §8 forbids.
 *
 * The condition is on the CONTENT, not on a filesystem directory. `content/problems/` is the
 * seed route for problems authored ahead of time; the normal route is an organizer typing a
 * statement into the admin UI, which lands in the database and never touches the repo. The
 * first version of this check required a directory and duly flagged the E2E fixture — whose
 * statement lives in the DB exactly as a hand-authored problem's would. That was the check
 * being wrong, not the data.
 *
 * What actually has to hold for a problem to leave DRAFT: a non-empty statement, and at least
 * one test case. Checked only when the database is reachable; when it is not, that is reported
 * rather than silently passed.
 */
async function checkPublishedAreAuthored(): Promise<string[] | null> {
  try {
    const { prisma } = await import("@/lib/db");
    const published = await prisma.problem.findMany({
      where: { state: { not: "DRAFT" } },
      select: { slug: true, statementMd: true, _count: { select: { testCases: true } } },
    });

    return published
      .filter((p) => p.statementMd.trim().length === 0 || p._count.testCases === 0)
      .map((p) =>
        p.statementMd.trim().length === 0
          ? `${p.slug} (no statement)`
          : `${p.slug} (no test cases)`,
      );
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  if (!(await isDockerAvailable())) {
    console.error("G13 FAIL: Docker daemon is not reachable. This is a FAIL, not a skip.");
    process.exit(1);
  }

  const { problems, incomplete } = discover();
  await sweepJudgeContainers();

  let failures = incomplete.length;

  for (const bad of incomplete) {
    console.log(`FAIL  ${bad.slug.padEnd(30)} incomplete content: missing ${bad.missing.join(", ")}`);
  }

  console.log(`\nverifying ${problems.length} reference solutions through the real judge\n`);

  let totalTests = 0;
  for (const meta of problems) {
    const job = jobFor(meta);
    const started = Date.now();
    const result = await judge(job, IMAGES);
    const elapsed = Date.now() - started;

    const fullMarks = job.testCases.length * 10;
    const pass = result.verdict === "AC" && result.score === fullMarks;
    totalTests += job.testCases.length;
    if (!pass) failures += 1;

    const slowest = Math.max(0, ...result.testResults.map((r) => r.runtimeMs ?? 0));
    console.log(
      `${pass ? "PASS" : "FAIL"}  ${meta.slug.padEnd(30)} ${result.verdict.padEnd(4)} ` +
        `${String(result.score).padStart(3)}/${fullMarks}  ${job.testCases.length} tests  ` +
        `slowest ${slowest}ms  total ${(elapsed / 1000).toFixed(1)}s`,
    );

    if (!pass) {
      if (result.compileError !== null) {
        console.log(`      compileError: ${result.compileError.slice(0, 200)}`);
      }
      for (const r of result.testResults.filter((t) => t.verdict !== "AC")) {
        console.log(`      ${r.testCaseId}: ${r.verdict} ${r.runtimeMs ?? "?"}ms`);
      }
    }
  }

  const orphans = await checkPublishedAreAuthored();
  if (orphans === null) {
    console.log(
      "\nNOTE: database unreachable — could not confirm that every non-DRAFT problem is " +
        "authored. The judge portion of this gate still ran in full.",
    );
  } else if (orphans.length > 0) {
    failures += orphans.length;
    console.log(`\nFAIL  ${orphans.length} problem(s) left DRAFT without being authored:`);
    for (const slug of orphans) console.log(`      ${slug}`);
  } else {
    console.log("\nevery non-DRAFT problem has a statement and test cases");
  }

  const swept = await sweepJudgeContainers();
  console.log(
    `\n${problems.length - (failures - incomplete.length - (orphans?.length ?? 0))}/${problems.length} ` +
      `references verified, ${totalTests} test cases executed, ${swept} containers swept`,
  );

  if (failures > 0) {
    console.error(`\nG13 FAIL: ${failures} problem(s) cannot ship.`);
    process.exit(1);
  }
  console.log("\nG13 PASS");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
