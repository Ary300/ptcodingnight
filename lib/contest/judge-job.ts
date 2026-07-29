import path from "node:path";

import { ValidationError } from "@/lib/errors";
import {
  JudgeJobSchema,
  type Comparator,
  type JudgeJob,
  type JudgeTestCase,
  type Language,
} from "@/lib/schemas/judge";

/**
 * Building the job the worker will run.
 *
 * Pure: paths, numbers, and the job shape. No database, no Redis. The two things worth getting
 * right here are the wall-clock kill (always 3x the problem limit, PRD §7.1) and the test-data
 * path resolution, which is a trust boundary even though the paths come from our own database
 * — an organizer uploading a case with `../../etc/shadow` in it should get an error, not a
 * judge that reads it.
 */

/** Wall-clock kill = 3x the problem time limit (PRD §7.1). Carried explicitly, never recomputed. */
export const WALL_CLOCK_MULTIPLIER = 3;

export interface TestCaseInput {
  readonly id: string;
  readonly ordinal: number;
  readonly inputPath: string;
  readonly expectedOutputPath: string;
  readonly isSample: boolean;
  readonly points: number;
  readonly group: string | null;
}

export interface ProblemLimits {
  readonly timeLimitMs: number;
  readonly memoryLimitMb: number;
}

export interface HostLimits {
  readonly testDataRoot: string;
  /** Ceiling from the environment. The effective limit is the lower of this and the problem's. */
  readonly memoryLimitMb: number;
  readonly pidsLimit: number;
  readonly tmpfsBytes: number;
  readonly cpus: number;
}

/**
 * Resolve a stored test-data path against the configured root.
 *
 * Absolute paths are accepted as-is because the judge fixtures use them, but a relative path
 * is confined to the root: after normalization it must still start there. `..` sequences that
 * escape are rejected loudly rather than clamped, because a case that points outside the root
 * is a data error somebody needs to fix.
 */
export function resolveTestDataPath(root: string, storedPath: string): string {
  if (storedPath.trim() === "") throw new ValidationError("Test case has an empty path");
  if (path.isAbsolute(storedPath)) return path.normalize(storedPath);

  const base = path.resolve(root);
  const resolved = path.resolve(base, storedPath);
  const relative = path.relative(base, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new ValidationError("Test case path escapes the test-data root");
  }
  return resolved;
}

/**
 * Parse a Docker-style size string (`"16m"`, `"256M"`, `"1g"`, `"1048576"`) into bytes.
 * The judge environment carries these as strings because that is what Docker takes.
 */
export function parseByteSize(value: string): number {
  const match = /^(\d+)\s*([kmg]?)b?$/i.exec(value.trim());
  if (match === null) throw new ValidationError(`Invalid size "${value}"`);

  const [, digits, unit] = match;
  if (digits === undefined) throw new ValidationError(`Invalid size "${value}"`);

  const scale: Record<string, number> = { "": 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 };
  const factor = scale[(unit ?? "").toLowerCase()] ?? 1;
  return Number.parseInt(digits, 10) * factor;
}

export function bytesToMegabytes(bytes: number): number {
  return Math.max(1, Math.floor(bytes / 1024 ** 2));
}

export interface BuildJudgeJobInput {
  readonly submissionId: string;
  readonly language: Language;
  readonly sourceCode: string;
  readonly problem: ProblemLimits;
  readonly testCases: readonly TestCaseInput[];
  readonly host: HostLimits;
  readonly comparator?: Comparator;
  /** "Run samples" judges the sample cases only and persists nothing (PRD §9.1). */
  readonly samplesOnly?: boolean;
}

export function buildJudgeJob(input: BuildJudgeJobInput): JudgeJob {
  const selected = input.samplesOnly === true
    ? input.testCases.filter((t) => t.isSample)
    : input.testCases;

  if (selected.length === 0) {
    throw new ValidationError(
      input.samplesOnly === true
        ? "This problem has no sample cases to run"
        : "This problem has no test cases yet",
    );
  }

  const testCases: JudgeTestCase[] = [...selected]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((testCase) => ({
      testCaseId: testCase.id,
      ordinal: testCase.ordinal,
      inputPath: resolveTestDataPath(input.host.testDataRoot, testCase.inputPath),
      expectedOutputPath: resolveTestDataPath(
        input.host.testDataRoot,
        testCase.expectedOutputPath,
      ),
      isSample: testCase.isSample,
      points: testCase.points,
      group: testCase.group,
    }));

  // Parsed, not cast: the worker parses the same schema on the way out, and a job that fails
  // there is judged as IE. Failing here instead turns a contract mismatch into a 400 the
  // organizer can read.
  return JudgeJobSchema.parse({
    submissionId: input.submissionId,
    language: input.language,
    sourceCode: input.sourceCode,
    limits: {
      timeLimitMs: input.problem.timeLimitMs,
      // The host ceiling wins when a problem asks for more than the box is willing to give.
      memoryLimitMb: Math.min(input.problem.memoryLimitMb, input.host.memoryLimitMb),
      wallClockKillMs: input.problem.timeLimitMs * WALL_CLOCK_MULTIPLIER,
      pidsLimit: input.host.pidsLimit,
      tmpfsBytes: input.host.tmpfsBytes,
      cpus: input.host.cpus,
    },
    comparator: input.comparator ?? { kind: "whitespace" },
    testCases,
    attempt: 1,
  });
}
