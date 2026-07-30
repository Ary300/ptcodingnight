// Standalone tsx entrypoint — load .env before anything reads process.env.
import "dotenv/config";

import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";

import { JudgeJobSchema, type JudgeResult } from "@/lib/schemas/judge";
import { JUDGE_QUEUE_NAME, MAX_JOB_ATTEMPTS, STALLED_JOB_GRACE_MS } from "@/lib/judge/queue";
import { parseServerEnv } from "@/lib/schemas/env";
import { isDockerAvailable, sweepJudgeContainers } from "@/worker/docker";
import { RUNTIMES, type RuntimeId } from "@/lib/judge/runtimes";
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

  const result = await judge(parsed.data, images);

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

  // A previous crash may have left containers behind; start from a clean host.
  const swept = await sweepJudgeContainers();
  if (swept > 0) console.warn(`swept ${swept} judge container(s) left by a previous run`);

  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
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

  const worker = new Worker(JUDGE_QUEUE_NAME, (job) => processJob(job, images), {
    connection,
    concurrency: env.JUDGE_CONCURRENCY,
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

  const shutdown = async (signal: string) => {
    console.warn(`${signal} received; draining judge worker`);
    await worker.close();
    await sweepJudgeContainers();
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
      concurrency: env.JUDGE_CONCURRENCY,
      // Every image the judge will actually use, not just the overridden ones — a startup line that
      // lists two images on a five-runtime judge invites exactly the wrong conclusion.
      images: Object.fromEntries(
        (Object.keys(RUNTIMES) as RuntimeId[]).map((id) => [id, images[id] ?? RUNTIMES[id].image]),
      ),
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
