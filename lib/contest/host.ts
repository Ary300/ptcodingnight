import { ValidationError } from "@/lib/errors";
import { parseServerEnv } from "@/lib/schemas/env";
import { bytesToMegabytes, parseByteSize, type HostLimits } from "@/lib/contest/judge-job";

/**
 * The ceilings this host is willing to give a submission, read once from the environment.
 *
 * These are the host's limits, not the problem's. A problem asking for more memory than the box
 * allows gets the box's answer — see `buildJudgeJob`, which takes the lower of the two.
 */

let cached: HostLimits | null = null;

export function hostLimits(): HostLimits {
  if (cached !== null) return cached;

  const env = parseServerEnv();
  const cpus = Number.parseFloat(env.JUDGE_CPU_LIMIT);
  if (!Number.isFinite(cpus) || cpus <= 0) {
    throw new ValidationError("JUDGE_CPU_LIMIT must be a positive number");
  }

  cached = {
    testDataRoot: env.TEST_DATA_ROOT,
    memoryLimitMb: bytesToMegabytes(parseByteSize(env.JUDGE_MEMORY_LIMIT)),
    pidsLimit: env.JUDGE_PIDS_LIMIT,
    tmpfsBytes: parseByteSize(env.JUDGE_TMPFS_SIZE),
    cpus,
  };
  return cached;
}
