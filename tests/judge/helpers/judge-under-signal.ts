/**
 * Judges one G4 fixture and prints the result as one JSON line. Used by
 * tests/judge/shutdown.test.ts, which signals this process mid-judge.
 *
 * It handles SIGTERM and SIGINT the way the worker does (worker/index.ts): note it and keep
 * going, because a draining worker finishes its in-flight jobs. Whatever the signal reaches
 * besides this process — the `docker` clients it spawned, if they share its process group — is
 * exactly what the test is about.
 *
 *   npx tsx tests/judge/helpers/judge-under-signal.ts <fixture-id>
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { JudgeJob } from "@/lib/schemas/judge";
import type { LanguageId } from "@/lib/judge/runtimes";
import { judge } from "@/worker/runner";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const FIXTURES = path.join(ROOT, "fixtures", "judge");

interface ManifestCase {
  id: string;
  language: LanguageId;
  sourceFile: string;
  timeLimitMs?: number;
}

const signals: string[] = [];
process.on("SIGTERM", () => signals.push("SIGTERM"));
process.on("SIGINT", () => signals.push("SIGINT"));

async function main(): Promise<void> {
  const id = process.argv[2];
  if (id === undefined) throw new Error("usage: judge-under-signal.ts <fixture-id>");
  const manifest = JSON.parse(readFileSync(path.join(FIXTURES, "manifest.json"), "utf8")) as {
    problem: { timeLimitMs: number; testCount: number; pointsPerTest: number };
    cases: ManifestCase[];
  };
  const entry = manifest.cases.find((c) => c.id === id);
  if (entry === undefined) throw new Error(`no fixture ${id}`);
  const timeLimitMs = entry.timeLimitMs ?? manifest.problem.timeLimitMs;
  const job: JudgeJob = {
    submissionId: `signal-${id}`,
    language: entry.language,
    sourceCode: readFileSync(path.join(FIXTURES, "cases", id, entry.sourceFile), "utf8"),
    limits: {
      timeLimitMs,
      memoryLimitMb: 512,
      wallClockKillMs: timeLimitMs * 3,
      pidsLimit: 64,
      tmpfsBytes: 16 * 1024 * 1024,
      cpus: 1,
    },
    comparator: { kind: "whitespace" },
    testCases: Array.from({ length: manifest.problem.testCount }, (_, i) => ({
      testCaseId: `t${String(i + 1)}`,
      ordinal: i + 1,
      inputPath: path.join(FIXTURES, "problem", `${String(i + 1)}.in`),
      expectedOutputPath: path.join(FIXTURES, "problem", `${String(i + 1)}.out`),
      isSample: i === 0,
      points: manifest.problem.pointsPerTest,
      group: null,
    })),
    attempt: 1,
    captureOutput: false,
  };
  let modes: readonly string[] = [];
  const result = await judge(job, undefined, undefined, {
    onReport: (report) => {
      modes = report.modes;
    },
  });
  process.stdout.write(
    `${JSON.stringify({
      verdict: result.verdict,
      tests: result.testResults.map((t) => ({ verdict: t.verdict, runtimeMs: t.runtimeMs })),
      modes,
      signals,
    })}\n`,
  );
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exit(1);
  },
);
