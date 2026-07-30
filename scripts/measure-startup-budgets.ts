import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { LANGUAGE_IDS, RUNTIMES, VARIANTS, type RuntimeId } from "@/lib/judge/runtimes";
import type { JudgeJob } from "@/lib/schemas/judge";
import { isDockerAvailable, sweepJudgeContainers } from "@/worker/docker";
import { judge } from "@/worker/runner";

/**
 * Measure `startupBudgetMs` for every runtime **through the full judge path**.
 *
 * ## Why this script exists
 *
 * Three times now a startup budget has been fitted to a baseline that did not match what the runner
 * actually measures, and each time correct solutions were failed as TLE:
 *
 *  1. Python at 1000 ms against a measured floor of 1006 ms — lost 8 of 20 reference solutions.
 *  2. Java before the budget was additive at all — intermittent TLE on correct code.
 *  3. All five budgets sized from DIRECT interpreter invocation (`docker run python main.py`)
 *     rather than from the judge.
 *
 * The third one is why this script calls `judge()`. A real test also pays for coreutils `timeout`,
 * a shell, the batch driver, and reads and writes across bind mounts, so measuring the interpreter
 * alone measures a thing no student ever experiences.
 *
 * **It was assumed the direct method simply under-reported. It does not.** Running both showed
 * python312 and gcc14 measuring ~2x higher on the full path, jdk21 ~5x higher, and node22 and go123
 * measuring *lower* — 3636 ms directly against 462 ms through the judge. The disagreement runs in
 * both directions and is dominated by where a sample lands relative to host contention, not by the
 * method. So the useful output of this script is not a number but a WORST OBSERVED value, and
 * budgets are multiples of it.
 *
 * ## What is measured
 *
 * The per-test `durationMs` the runner itself reports, for a correct trivial solution, under
 * container churn. That is exactly the quantity compared against
 * `problemLimit * multiplier + startupBudgetMs`, so it is apples to apples by construction.
 *
 * Container creation is excluded because the runner excludes it — it is charged to the host, not
 * the student (docs/HOSTING.md §2).
 *
 * ## Usage
 *
 *   npx tsx scripts/measure-startup-budgets.ts [--reps 3] [--churn 4]
 *
 * Must not run concurrently with G8 or G13: competing container workloads make every number here
 * meaningless.
 */

const ROOT = path.resolve(__dirname, "..");
const FIXTURES = path.join(ROOT, "fixtures", "judge");

/** A known-correct fixture per runtime. These are the G4 AC cases, so they are already proven. */
const AC_FIXTURE: Readonly<Record<RuntimeId, { caseId: string; language: string }>> = {
  python312: { caseId: "py-ac-readall", language: "PYTHON_312" },
  jdk21: { caseId: "java-ac-bufferedreader", language: "JAVA_21" },
  gcc14: { caseId: "cpp-ac-iostream", language: "CPP_17" },
  node22: { caseId: "js-ac-readfile", language: "JAVASCRIPT_NODE22" },
  go123: { caseId: "go-ac-bufio", language: "GO_123" },
};

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const REPS = arg("reps", 3);
const CHURN = arg("churn", 4);

/** `--only jdk21` narrows to one runtime, for investigating an outlier without paying for five. */
const ONLY = ((): RuntimeId | null => {
  const i = process.argv.indexOf("--only");
  const v = process.argv[i + 1];
  return i !== -1 && v !== undefined && v in RUNTIMES ? (v as RuntimeId) : null;
})();

/** Continuously create and reap containers, so the daemon is loaded rather than idle. */
function startChurn(count: number): () => void {
  const children = Array.from({ length: count }, () =>
    spawn(
      "sh",
      [
        "-c",
        "while :; do docker run --rm --network=none --read-only --tmpfs=/tmp:rw,size=16m " +
          "--user=65534:65534 --cap-drop=ALL --memory=128m --cpus=1 python:3.12-slim " +
          "python -c pass >/dev/null 2>&1; done",
      ],
      { stdio: "ignore", detached: true },
    ),
  );

  return () => {
    for (const child of children) {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }
  };
}

function jobFor(runtime: RuntimeId, rep: number): JudgeJob {
  const fixture = AC_FIXTURE[runtime];
  const variant = VARIANTS[fixture.language as (typeof LANGUAGE_IDS)[number]];
  const sourceCode = readFileSync(
    path.join(FIXTURES, "cases", fixture.caseId, variant.sourceFile),
    "utf8",
  );

  // A generous problem limit on purpose. This run must measure how long startup TAKES, not whether
  // it fits inside a limit — a TLE here would produce no duration to record.
  const timeLimitMs = 60_000;

  return {
    submissionId: `budget-${runtime}-${rep}`,
    language: variant.id,
    sourceCode,
    limits: {
      timeLimitMs,
      memoryLimitMb: RUNTIMES[runtime].id === "jdk21" ? 512 : 256,
      wallClockKillMs: timeLimitMs * 3,
      pidsLimit: 64,
      tmpfsBytes: 16 * 1024 * 1024,
      cpus: 1,
    },
    comparator: { kind: "whitespace" },
    testCases: [1, 2, 3].map((n) => ({
      testCaseId: `t${n}`,
      ordinal: n,
      inputPath: path.join(FIXTURES, "problem", `${n}.in`),
      expectedOutputPath: path.join(FIXTURES, "problem", `${n}.out`),
      isSample: n === 1,
      points: 10,
      group: null,
    })),
    attempt: 1,
  };
}

function summarize(samples: readonly number[]): {
  min: number;
  max: number;
  median: number;
} {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    median: sorted[Math.floor(sorted.length / 2)] ?? 0,
  };
}

async function main(): Promise<void> {
  if (!(await isDockerAvailable())) {
    console.error("Docker daemon is not reachable. Cannot measure anything.");
    process.exit(1);
  }

  console.log(`Measuring through the FULL judge path: ${REPS} reps, ${CHURN} churn workers.`);
  console.log("Each rep judges a correct 3-test solution; every per-test duration is a sample.\n");

  await sweepJudgeContainers();
  const stopChurn = startChurn(CHURN);
  // Let the daemon reach a loaded steady state before sampling.
  await new Promise((resolve) => setTimeout(resolve, 5_000));

  const results: { runtime: RuntimeId; samples: number[]; verdicts: string[] }[] = [];

  try {
    const runtimes = (Object.keys(RUNTIMES) as RuntimeId[]).filter(
      (r) => ONLY === null || r === ONLY,
    );

    for (const runtime of runtimes) {
      const samples: number[] = [];
      const verdicts: string[] = [];

      for (let rep = 0; rep < REPS; rep += 1) {
        const result = await judge(jobFor(runtime, rep));
        verdicts.push(result.verdict);
        for (const test of result.testResults) {
          if (test.runtimeMs !== null) samples.push(test.runtimeMs);
        }
      }

      const stats = summarize(samples);
      const current = RUNTIMES[runtime].startupBudgetMs;
      const multiple = stats.max === 0 ? Infinity : current / stats.max;

      console.log(
        `${runtime.padEnd(11)} n=${String(samples.length).padEnd(3)} ` +
          `min=${String(stats.min).padEnd(6)} median=${String(stats.median).padEnd(6)} ` +
          `max=${String(stats.max).padEnd(6)} ` +
          `budget=${String(current).padEnd(6)} (${multiple.toFixed(1)}x max) ` +
          `verdicts=${[...new Set(verdicts)].join(",")}`,
      );
      // Every sample, not just the summary. A single outlier driving a 3x budget deserves to be
      // visible rather than hidden behind a max.
      console.log(`            samples: ${[...samples].sort((a, b) => a - b).join(" ")}`);

      results.push({ runtime, samples, verdicts });
    }
  } finally {
    stopChurn();
    await sweepJudgeContainers();
  }

  console.log("\n--- recommended budgets at 3x the full-path max ---");
  for (const { runtime, samples } of results) {
    const { max } = summarize(samples);
    // 3x, rounded up to the next whole second, floored at 4000 ms. Three because the observed
    // spread within a single run already reaches 5-18x on this host, so a 2x margin is inside the
    // noise rather than outside it.
    const recommended = Math.max(4_000, Math.ceil((max * 3) / 1_000) * 1_000);
    const current = RUNTIMES[runtime].startupBudgetMs;
    const verdict = current >= recommended ? "OK" : "RAISE";
    console.log(
      `${runtime.padEnd(11)} max=${String(max).padEnd(6)} ` +
        `recommend=${String(recommended).padEnd(7)} current=${String(current).padEnd(7)} ${verdict}`,
    );
  }

  const allSamples = results.flatMap((r) => r.samples);
  if (allSamples.length === 0) {
    console.error("\nNo samples collected. Every judge run failed; the numbers above mean nothing.");
    process.exit(1);
  }

  const bad = results.filter((r) => r.verdicts.some((v) => v !== "AC"));
  if (bad.length > 0) {
    console.error(
      `\nWARNING: non-AC verdicts from ${bad.map((b) => b.runtime).join(", ")}. ` +
        "A run that did not finish correctly is not a measurement of startup.",
    );
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
