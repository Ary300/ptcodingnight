import { availableParallelism, cpus, totalmem } from "node:os";

/**
 * What the machine this worker is running on can actually give a container.
 *
 * ## Why this exists
 *
 * Every resource limit in `lib/judge/runtimes.ts` was measured on a developer laptop, and a value
 * fitted to one machine is wrong on every other one — the same class of mistake as the runtime
 * startup budgets. `--cpus=4` is the sharp end of it: Docker does not clamp, it REFUSES, with
 *
 *     range of CPUs is from 0.01 to 2.00, as there are only 2 CPUs available
 *
 * so a two-vCPU host does not run Go submissions slowly, it fails to run them at all. That was
 * found by deploying, not by testing, because the laptop had enough cores for the number to be
 * invisible.
 *
 * ## Why clamping rather than validating
 *
 * A judge that refuses to start because its config asks for more cores than it has is correct and
 * useless: the contest is in ninety minutes and nobody is going to retune five compile budgets.
 * Clamping keeps the contest running on whatever hardware it landed on, and the numbers are
 * reported at startup so a smaller box is a visible fact rather than a silent one.
 */

/** Cached: the core count cannot change under us, and this is called per container. */
let cachedCpuCount: number | null = null;

/**
 * Cores available to THIS process, not cores in the machine.
 *
 * `availableParallelism()` respects cgroup limits, which is what matters when the worker is itself
 * containerised — `cpus().length` reports the host's cores even inside a container pinned to one,
 * which would put the clamp back above what Docker will accept.
 */
export function hostCpuCount(): number {
  if (cachedCpuCount !== null) return cachedCpuCount;
  let count: number;
  try {
    count = availableParallelism();
  } catch {
    count = cpus().length;
  }
  cachedCpuCount = Math.max(1, count);
  return cachedCpuCount;
}

/** Total RAM in MB, for sizing memory limits against the box rather than against a laptop. */
export function hostMemoryMb(): number {
  return Math.floor(totalmem() / (1024 * 1024));
}

/**
 * The largest `--cpus` value Docker will accept here, given what was asked for.
 *
 * Floors at 0.01 because that is Docker's own minimum, and a request of 0 would be rejected just
 * as surely as a request of 4 on a two-core box.
 */
export function clampCpus(requested: number): number {
  const ceiling = hostCpuCount();
  if (!Number.isFinite(requested) || requested <= 0) return Math.min(1, ceiling);
  return Math.min(requested, ceiling);
}

/**
 * How many submissions to judge at once, when nothing is configured.
 *
 * One per core, floored at 1 and capped at 4. The old default was a flat 4, which on the two-vCPU
 * droplet means four containers competing for two cores — and the thing that degrades is verdict
 * latency, which is the one number G8 exists to measure. `JUDGE_CONCURRENCY` still overrides it;
 * this is only what happens when nobody has thought about it.
 */
export function defaultJudgeConcurrency(): number {
  return Math.max(1, Math.min(4, hostCpuCount()));
}

/** One line at worker startup, so the box's size is in the log before anything goes wrong. */
export function describeHost(): string {
  return `host: ${String(hostCpuCount())} cpu, ${String(hostMemoryMb())} MB RAM`;
}

/**
 * Rewrite a `GOMAXPROCS=<n>` in a registry command to what this host can actually offer.
 *
 * `--cpus` bounds the cgroup; it does NOT stop the Go runtime asking the kernel how many cores
 * exist and starting a thread per core. On a small box the surplus threads hit `--pids-limit` and
 * the build fails with errno=11 — which is why the registry pins the value at all. The pinned
 * number was 4, chosen on a laptop, so on a two-vCPU host it is simultaneously the wrong hint and
 * the one the comment says must be bounded.
 *
 * Safe to substitute: GOMAXPROCS is an environment variable, not a build flag, so it is not part
 * of Go's build cache key and changing it cannot cost the warm cache. That distinction is the
 * whole reason this is done here rather than by editing the registry string per host.
 */
export function withHostMaxProcs(command: string): string {
  return command.replace(/GOMAXPROCS=\d+/g, `GOMAXPROCS=${String(hostCpuCount())}`);
}
