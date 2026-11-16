/**
 * Measures the two things the stall settings in lib/judge/queue.ts trade against each other, with
 * the worker's own options, on a real Redis and a PRIVATE queue (nothing a live worker consumes).
 *
 *   1. A long job is never taken for stalled: one job whose processor runs `--long` seconds, with
 *      the event loop free the way the judge leaves it. Pass: processed once, zero `stalled`.
 *   2. A crashed worker's job comes back: a child process takes a job and SIGKILLs itself. A second
 *      worker, already running, reports how long until it gets the job.
 *
 *   REDIS_URL=redis://127.0.0.1:6379 npx tsx scripts/measure-stall-recovery.ts [--long 150] [--crashes 3]
 */
import { spawn } from "node:child_process";

import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

import { JUDGE_WORKER_LOCK_OPTIONS } from "@/lib/judge/queue";

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const QUEUE = `ptcn-stall-probe-${String(process.pid)}`;

function argNumber(flag: string, fallback: number): number {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${flag} needs a positive number`);
  return value;
}

const connect = () => new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The crashing child: take one job, then die without releasing it, as a killed worker does. */
async function child(): Promise<void> {
  const connection = connect();
  new Worker(
    queueFromEnv(),
    async () => {
      process.stdout.write("taken\n");
      await sleep(200);
      process.kill(process.pid, "SIGKILL");
      await sleep(60_000);
    },
    { connection, ...JUDGE_WORKER_LOCK_OPTIONS },
  );
  await sleep(600_000);
}

function queueFromEnv(): string {
  const name = process.env.PTCN_STALL_QUEUE;
  if (name === undefined) throw new Error("PTCN_STALL_QUEUE is not set");
  return name;
}

async function longJob(seconds: number): Promise<void> {
  const connection = connect();
  const queue = new Queue(`${QUEUE}-long`, { connection });
  let runs = 0;
  let stalls = 0;
  const worker = new Worker(
    `${QUEUE}-long`,
    async () => {
      runs += 1;
      await sleep(seconds * 1000);
    },
    { connection: connect(), ...JUDGE_WORKER_LOCK_OPTIONS },
  );
  worker.on("stalled", () => (stalls += 1));
  const done = new Promise<void>((resolve) => worker.on("completed", () => resolve()));
  await queue.add("long", {}, { attempts: 2 });
  await done;
  await sleep(JUDGE_WORKER_LOCK_OPTIONS.stalledInterval * 2);
  console.log(`long job: ${String(seconds)} s, processed ${String(runs)} time(s), stalled ${String(stalls)} time(s)`);
  await worker.close();
  await queue.obliterate({ force: true });
  await queue.close();
  await connection.quit();
}

async function crashRecovery(): Promise<number> {
  const name = `${QUEUE}-crash-${String(Date.now())}`;
  const connection = connect();
  const queue = new Queue(name, { connection });
  await queue.add("crash", {}, { attempts: 2 });

  // The crashing worker takes the job first; the survivor starts only once it has.
  const taken = new Promise<void>((resolve, reject) => {
    const proc = spawn(process.execPath, ["--import", "tsx", __filename, "--child"], {
      env: { ...process.env, PTCN_STALL_QUEUE: name },
      stdio: ["ignore", "pipe", "inherit"],
    });
    proc.stdout.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("taken")) resolve();
    });
    proc.on("error", reject);
  });
  await taken;
  const crashedAt = Date.now();

  let markRecovered: (ms: number) => void = () => undefined;
  const recovered = new Promise<number>((resolve) => (markRecovered = resolve));
  const survivor = new Worker(
    name,
    async () => {
      markRecovered(Date.now() - crashedAt);
    },
    { connection: connect(), ...JUDGE_WORKER_LOCK_OPTIONS },
  );
  const ms = await recovered;
  await survivor.close();
  await queue.obliterate({ force: true });
  await queue.close();
  await connection.quit();
  return ms;
}

/** Fail loudly on a wrong URL or password: BullMQ's connections would otherwise retry forever. */
async function checkRedis(): Promise<void> {
  const probe = new IORedis(REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
  try {
    await probe.connect();
    await probe.ping();
  } finally {
    probe.disconnect();
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--child")) return child();
  await checkRedis();
  console.log(
    `lockDuration ${String(JUDGE_WORKER_LOCK_OPTIONS.lockDuration)} ms, renewed every ${String(JUDGE_WORKER_LOCK_OPTIONS.lockDuration / 2)} ms, stalled check every ${String(JUDGE_WORKER_LOCK_OPTIONS.stalledInterval)} ms`,
  );
  const crashes = argNumber("--crashes", 3);
  const longSeconds = argNumber("--long", 150);
  const [recoveries] = await Promise.all([
    (async () => {
      const out: number[] = [];
      for (let i = 0; i < crashes; i += 1) out.push(await crashRecovery());
      return out;
    })(),
    longJob(longSeconds),
  ]);
  console.log(`crash recovery: ${recoveries.map((ms) => `${(ms / 1000).toFixed(1)} s`).join(", ")}`);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
