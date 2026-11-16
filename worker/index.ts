// Standalone tsx entrypoint — load .env before anything reads process.env.
import "dotenv/config";

import { hostname } from "node:os";

import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";

import { startWorkerHeartbeat } from "@/lib/judge/heartbeat";
import { JudgeJobSchema, type JudgeResult } from "@/lib/schemas/judge";
import { JUDGE_QUEUE_NAME, JUDGE_WORKER_LOCK_OPTIONS, MAX_JOB_ATTEMPTS } from "@/lib/judge/queue";
import { parseServerEnv } from "@/lib/schemas/env";
import {
  isDockerAvailable,
  OUTPUT_CAP_FLOOR_BYTES,
  setJudgeInstance,
  sweepAbandonedJudgeContainers,
  sweepJudgeContainers,
} from "@/worker/docker";
import { defaultJudgeConcurrency, hostCpuCount, hostMemoryMb } from "./host";
import { RUNTIMES, VARIANTS, type RuntimeId } from "@/lib/judge/runtimes";
import { describeMissingImages, findMissingImages, requiredImages } from "@/worker/preflight";
import { judge, slotProfileFor, type ImageOverrides } from "@/worker/runner";
import { ContainerPool } from "@/worker/container-pool";
import { JavacService } from "@/worker/javac-service";
import { LaneScheduler } from "@/worker/lanes";
import { requeuesAfter } from "@/worker/requeue";
import { removeStaleWorkspaces } from "@/worker/workspace";
import { hostLimits } from "@/lib/contest/host";
import type { JudgeJob } from "@/lib/schemas/judge";

/**
 * The judge worker.
 *
 * Consumes submissions from BullMQ and runs each one in a fresh, throwaway container. This
 * process never executes untrusted code itself — see worker/docker.ts for the boundary and
 * docs/PRD.md §7 for the rules.
 */

/**
 * Pre-created containers (worker/container-pool.ts): how many submissions' worth to keep ready.
 * Each slot is a build and a run container, created and never started, plus a workspace. 0 turns
 * the pool off and every container is created on demand, as before.
 */
const POOL_SLOTS = Number.parseInt(process.env.JUDGE_POOL_SLOTS ?? "60", 10);

/**
 * The warm javac (worker/javac-service.ts): on unless JUDGE_JAVAC_SERVICE=off, the switch an
 * organizer flips without a deploy. Off, every Java submission compiles in its own container.
 */
const JAVAC_SERVICE_ON = (process.env.JUDGE_JAVAC_SERVICE ?? "on").toLowerCase() !== "off";

/** Finished containers allowed to wait for removal while judging continues. */
const POOL_REMOVAL_BACKLOG = Number.parseInt(process.env.JUDGE_POOL_REMOVAL_BACKLOG ?? "120", 10);

/**
 * The slow lane (worker/lanes.ts). A submission whose test ends over its threshold gives its main
 * lane back and runs its remaining tests JUDGE_SLOW_LANE at a time machine-wide (or on main lanes
 * nobody else is using). JUDGE_PARKED_MAX bounds how many can be parked at once; 0 turns parking off.
 */
const SLOW_LANE = Number.parseInt(process.env.JUDGE_SLOW_LANE ?? "2", 10);
const PARKED_MAX = Number.parseInt(process.env.JUDGE_PARKED_MAX ?? "8", 10);

/** How long the queue must have been quiet before the pool spends CPU on creating or removing. */
const POOL_IDLE_MS = 1_500;

/** Submissions being judged right now, and when the last one started or ended. */
let activeJobs = 0;
let lastJobActivityMs = 0;

function judgeIsBusy(): boolean {
  return activeJobs > 0 || Date.now() - lastJobActivityMs < POOL_IDLE_MS;
}

/**
 * The profile a typical submission will ask for on this host — Java 21 against a 256 MB problem
 * whose answers fit the default output cap, which is most of the bank — so the pool is useful
 * before the first submission arrives. Every other profile is learned from demand.
 */
function expectedProfile(images: ImageOverrides, compileInService: boolean) {
  const host = hostLimits();
  const seed: JudgeJob = {
    submissionId: "pool-seed",
    language: "JAVA_21",
    sourceCode: "",
    limits: {
      timeLimitMs: 1_000,
      memoryLimitMb: Math.min(256, host.memoryLimitMb),
      wallClockKillMs: 3_000,
      pidsLimit: host.pidsLimit,
      tmpfsBytes: host.tmpfsBytes,
      cpus: host.cpus,
    },
    comparator: { kind: "whitespace" },
    testCases: [],
    attempt: 1,
    captureOutput: false,
  };
  return slotProfileFor(seed, images, OUTPUT_CAP_FLOOR_BYTES, compileInService);
}

async function processJob(
  job: Job,
  images: ImageOverrides,
  pool: ContainerPool | null,
  javacService: JavacService | null,
  lanes: LaneScheduler,
): Promise<JudgeResult> {
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
  activeJobs += 1;
  lastJobActivityMs = Date.now();
  const lane = lanes.enter();
  let result: JudgeResult;
  try {
    result = await judge(
      parsed.data,
      images,
      {
        enqueuedAtMs: job.timestamp,
        dequeuedAtMs: job.processedOn ?? Date.now(),
        attempt: job.attemptsMade + 1,
      },
      {
        ...(pool === null ? {} : { pool }),
        ...(javacService === null ? {} : { javacService }),
        lane,
      },
    );
  } finally {
    lane.finish();
    activeJobs -= 1;
    lastJobActivityMs = Date.now();
    if (pool !== null) scheduleMaintenance(pool);
  }

  // An IE is our fault, not the student's. Throwing hands the job back to BullMQ for its one
  // retry; on the final attempt we stop retrying and surface it for an admin instead of
  // spinning forever.
  if (requeuesAfter(result.verdict, job.attemptsMade + 1)) {
    throw new Error(`Internal judge error on submission ${result.submissionId}; requeueing`);
  }

  return result;
}

/** Once the queue has been quiet for POOL_IDLE_MS, remove finished containers and refill. */
function scheduleMaintenance(pool: ContainerPool): void {
  setTimeout(() => {
    if (!judgeIsBusy()) void pool.maintain();
  }, POOL_IDLE_MS + 50);
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

  // A previous crash of THIS worker may have left containers behind; start from a clean slate.
  // Pooled and pending-removal containers carry the same label, so this clears both after a
  // crash; their workspaces go with them. Other workers' containers are left alone (see
  // INSTANCE_LABEL in worker/docker.ts): the id is stable across restarts of this worker, and
  // JUDGE_WORKER_ID distinguishes two workers that share a hostname.
  setJudgeInstance(process.env.JUDGE_WORKER_ID ?? hostname());
  const swept = await sweepJudgeContainers();
  if (swept > 0) console.warn(`swept ${swept} judge container(s) left by a previous run`);
  const abandoned = await sweepAbandonedJudgeContainers();
  if (abandoned > 0) console.warn(`removed ${abandoned} long-exited judge container(s) of other instances`);
  await removeStaleWorkspaces("pool-");

  const pool =
    POOL_SLOTS > 0
      ? new ContainerPool({
          target: POOL_SLOTS,
          removalBacklog: POOL_REMOVAL_BACKLOG,
          isBusy: judgeIsBusy,
        })
      : null;

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

  // One compile lane per concurrent judge, so a lane is always free for a submission that wants
  // one. A lane that is busy, restarting or missing sends its submission to a container.
  const javacService = JAVAC_SERVICE_ON
    ? new JavacService({
        lanes: concurrency,
        image: images.jdk21 ?? RUNTIMES.jdk21.image,
        runtime: RUNTIMES.jdk21,
      })
    : null;
  // Started and warmed while nothing is queued; until a lane is ready, Java compiles in containers.
  if (javacService !== null) {
    const compileCommand = VARIANTS.JAVA_21.compileCommand;
    void javacService.start().then(async () => {
      if (compileCommand !== undefined) await javacService.warmUp(compileCommand, RUNTIMES.jdk21.compileTimeoutMs);
    });
  }
  if (pool !== null) {
    pool.expect(expectedProfile(images, javacService !== null));
    void pool.maintain();
  }

  // Concurrency is main lanes plus parked submissions: parking one lets the queue's next job start.
  let workerRef: Worker | null = null;
  const lanes = new LaneScheduler({
    main: concurrency,
    slow: Math.max(1, SLOW_LANE),
    maxParked: Math.max(0, PARKED_MAX),
    onConcurrency: (n) => {
      if (workerRef !== null) workerRef.concurrency = n;
    },
  });

  const worker = new Worker(JUDGE_QUEUE_NAME, (job) => processJob(job, images, pool, javacService, lanes), {
    connection,
    concurrency,
    ...JUDGE_WORKER_LOCK_OPTIONS,
  });
  workerRef = worker;

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
    await pool?.close();
    await javacService?.close();
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
      poolSlots: pool === null ? 0 : POOL_SLOTS,
      javacLanes: javacService === null ? 0 : concurrency,
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
