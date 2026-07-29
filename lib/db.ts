import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { parseServerEnv } from "@/lib/schemas/env";

/**
 * Prisma 7 reaches Postgres through a driver adapter rather than a URL in schema.prisma.
 *
 * The client is created **lazily**, on first property access, and that is not a
 * micro-optimisation. `next build` imports every route module to collect page data; if the
 * client were constructed at import time, the build would parse the environment and throw
 * on a machine with no `.env` — so the production build would depend on a file that is
 * gitignored by design. That breaks G10's "fresh clone, copy .env.example, done" cold start
 * in the least obvious way possible: a build failure that looks like a code error.
 *
 * Memoised on globalThis so Next's dev-mode module reloading does not open a new connection
 * pool on every edit.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Pool ceiling for the web process.
 *
 * Bounded on purpose: with a cap, a burst of 40 submissions QUEUES on a connection and each
 * request waits a few milliseconds. Unbounded, the same burst opens connections until
 * Postgres refuses and the request fails outright — a slow submission is recoverable, a
 * rejected one is a lost submission. `postgres:16-alpine` defaults to 100 connections total,
 * shared with the worker, the seeder and any psql session an organizer has open.
 */
const WEB_POOL_SIZE = 20;

function createClient(): PrismaClient {
  const env = parseServerEnv();
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL, max: WEB_POOL_SIZE });
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * ALWAYS memoised, in every environment. This is not the usual "cache in dev so HMR does not
 * leak pools" idiom, and getting that wrong here was a production-only outage.
 *
 * The earlier version cached only when `NODE_ENV !== "production"`. With an eager
 * module-level client that was harmless — the module ran once. With the lazy Proxy below it
 * is catastrophic: the memo is never populated in production, so **every property access
 * constructs a new PrismaClient with its own connection pool**. `prisma.submission` opens
 * one, `prisma.participant` opens another. G8 hit Postgres's 100-connection ceiling within
 * seconds and refused 35 of 40 submissions with `too many clients already`, which is exactly
 * what a room of students submitting at once would have produced on the night.
 */
function getClient(): PrismaClient {
  globalForPrisma.prisma ??= createClient();
  return globalForPrisma.prisma;
}

/**
 * Behaves exactly like a PrismaClient, but nothing happens until the first property is
 * touched. `prisma.submission.findUnique(...)` connects; merely importing `prisma` does not.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    return Reflect.get(getClient(), property, receiver) as unknown;
  },
  has(_target, property) {
    return Reflect.has(getClient(), property);
  },
  getPrototypeOf() {
    return Reflect.getPrototypeOf(getClient());
  },
});
