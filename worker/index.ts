// Standalone tsx entrypoint — load .env before anything reads process.env.
import "dotenv/config";

import { hostname } from "node:os";

import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";

import { startWorkerHeartbeat } from "@/lib/judge/heartbeat";
import { JudgeJobSchema, type JudgeResult } from "@/lib/schemas/judge";
import { JUDGE_QUEUE_NAME, MAX_JOB_ATTEMPTS, STALLED_JOB_GRACE_MS } from "@/lib/judge/queue";
import { parseServerEnv } from "@/lib/schemas/env";
import { isDockerAvailable, sweepJudgeContainers } from "@/worker/docker";
import { defaultJudgeConcurrency, hostCpuCount, hostMemoryMb } from "./host";
import { RUNTIMES, type RuntimeId } from "@/lib/judge/runtimes";
import { describeMissingImages, findMissingImages, requiredImages } from "@/worker/preflight";
import { judge, type ImageOverrides } from "@/worker/runner";

/**
 * The judge worker.
 *
 * Consumes submissions from BullMQ and runs each one in a fresh, throwaway container. This
 * process never executes untrusted code itself — see worker/docker.ts for the boundary and
 * docs/PRD.md §7 for the rules.
 */

async function processJob(job: Job, images: ImageOverrides): Promise<JudgeResult> {
  // Parsed, not cast. A malformed job means the enqueuer and this worker disagree about the
  // contract, and guessing at the difference is how a submission gets judged against the
  // wrong problem.
  const parsed = JudgeJobSchema.safeParse({ ...job.data, attempt: job.attemptsMade + 1 });

  if (!parsed.success) {
    throw new Error(
      `Malformed judge job ${job.id}: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }

  // Queue wait comes from BullMQ's own clocks — `timestamp` is stamped at enqueue and
  // `processedOn` when this worker picked the job up. `processedOn` is set before the processor
  // runs, so the fallback is unreachable in practice; it exists because the field is typed
  // optional, and "now" is the honest value at the only moment the fallback could fire.
  const result = await judge(parsed.data, images, {
    enqueuedAtMs: job.timestamp,
    dequeuedAtMs: job.processedOn ?? Date.now(),
    attempt: job.attemptsMade + 1,
  });

  // An IE is our fault, not the student's. Throwing hands the job back to BullMQ for its one
  // retry; on the final attempt we stop retrying and surface it for an admin instead of
  // spinning forever.
  if (result.verdict === "IE" && job.attemptsMade + 1 < MAX_JOB_ATTEMPTS) {
    throw new Error(`Internal judge error on submission ${result.submissionId}; requeueing`);
  }

  return result;
}

async function main(): Promise<void> {
  const env = parseServerEnv();

  // Refuse to start without a daemon. A worker that accepts jobs it cannot run would fail
  // every one of them as IE, which reads to a student as a broken platform.
  if (!(await isDockerAvailable())) {
    console.error("Docker daemon is not reachable. The judge worker cannot run without it.");
    process.exit(1);
  }

  // Keyed by RuntimeId, which is what `judge()` looks up.
  //
  // This was `{ python, java }` — keys that match no RuntimeId, so every override was silently
  // ignored and the registry's own images were used regardless of what JUDGE_IMAGE_* said. It did
  // no harm because the values agreed, and it would have been invisible until somebody set
  // JUDGE_IMAGE_PYTHON on a host and watched it do nothing.
  //
  // Only the two stock images have env overrides today; the other three come from the registry.
  // ptcn-go:1.23 deliberately has none — it is BUILT, not pulled, so pointing it elsewhere would
  // just as likely find an image with a cold build cache (see docker/go/Dockerfile).
  const images: ImageOverrides = {
    python312: env.JUDGE_IMAGE_PYTHON,
    jdk21: env.JUDGE_IMAGE_JAVA,
  };

  // Refuse to start with any runtime image missing, same reasoning as the daemon check above:
  // a worker without an image does not fail at boot on its own, it fails every submission for
  // that runtime as IE at run time — silence now, a student's 12-minute wait later.
  const missing = await findMissingImages(requiredImages(images));
  if (missing.length > 0) {
    console.error(describeMissingImages(missing));
    process.exit(1);
  }

  // A previous crash may have left containers behind; start from a clean host.
  const swept = await sweepJudgeContainers();
  if (swept > 0) console.warn(`swept ${swept} judge container(s) left by a previous run`);

  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

  /*
    Concurrency follows the box unless somebody has actually chosen a number.

    The schema's default was a flat 4, fitted to a laptop. On the two-vCPU droplet that is four
    containers competing for two cores, and what degrades is verdict latency — the one number G8
    exists to measure. An explicit `JUDGE_CONCURRENCY` still wins; this only decides what happens
    when nobody has thought about it, which is the case that reached production.
  */
  const concurrency =
    process.env.JUDGE_CONCURRENCY === undefined
      ? defaultJudgeConcurrency()
      : env.JUDGE_CONCURRENCY;

  const worker = new Worker(JUDGE_QUEUE_NAME, (job) => processJob(job, images), {
    connection,
    concurrency,
    stalledInterval: STALLED_JOB_GRACE_MS,
  });

  worker.on("failed", (job, error) => {
    console.error(
      JSON.stringify({
        level: "error",
        event: "judge.failed",
        jobId: job?.id ?? null,
        attempt: (job?.attemptsMade ?? 0) + 1,
        maxAttempts: MAX_JOB_ATTEMPTS,
        message: error.message,
      }),
    );
  });

  worker.on("completed", (job, result: JudgeResult) => {
    console.log(
      JSON.stringify({
        level: "info",
        event: "judge.completed",
        jobId: job.id,
        submissionId: result.submissionId,
        verdict: result.verdict,
        score: result.score,
        runtimeMs: result.runtimeMs,
      }),
    );
  });

  // Assigned right after judge.started below; the shutdown handler closes over the holder so
  // registration order does not matter.
  let stopHeartbeat: (() => Promise<void>) | null = null;

  const shutdown = async (signal: string) => {
    console.warn(`${signal} received; draining judge worker`);
    await worker.close();
    await sweepJudgeContainers();
    // Before the connection closes, because the stop DELETES the heartbeat key — an orderly
    // shutdown reads as "no worker" immediately rather than after a 30 s TTL of doubt.
    await stopHeartbeat?.();
    await connection.quit();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  console.log(
    JSON.stringify({
      level: "info",
      event: "judge.started",
      queue: JUDGE_QUEUE_NAME,
      concurrency,
      concurrencySource: process.env.JUDGE_CONCURRENCY === undefined ? "derived from cpu count" : "JUDGE_CONCURRENCY",
      /*
        The box, in the first line of the log.

        Every resource limit in the registry was measured on a laptop, and the failure they cause
        elsewhere is not gradual: Docker REFUSES a `--cpus` above the core count rather than
        clamping it, so a runtime whose compile asks for 4 is simply unjudgeable on a 2-vCPU host.
        The limits are clamped at the container boundary now, but the clamp has to be visible —
        a judge quietly running Go compiles at half the intended parallelism should be a fact
        somebody can read, not something inferred from timings.
      */
      host: { cpus: hostCpuCount(), memoryMb: hostMemoryMb() },
      // Every image the judge will actually use, not just the overridden ones — a startup line that
      // lists two images on a five-runtime judge invites exactly the wrong conclusion.
      images: Object.fromEntries(
        (Object.keys(RUNTIMES) as RuntimeId[]).map((id) => [id, images[id] ?? RUNTIMES[id].image]),
      ),
    }),
  );

  /*
    "A judge is alive" as a positive, queryable fact — started only now, AFTER judge.started,
    because the heartbeat is a claim to be consuming and everything above this line can still
    refuse the boot. It rides the same Redis connection the queue uses (BullMQ issues its
    blocking reads on its own duplicate, so plain SETs here do not contend), and a worker that
    dies without cleanup stops renewing the key, which expires 30 s later: "no worker" becomes
    visible to the console without anyone having been able to log it.
  */
  stopHeartbeat = startWorkerHeartbeat(connection, {
    // Hostname plus pid: unique per process, so two workers are two keys — and the key name
    // itself says where to go looking when one of them stops beating.
    workerId: `${hostname()}-${process.pid}`,
    startedAt: new Date().toISOString(),
    pid: process.pid,
    concurrency,
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
