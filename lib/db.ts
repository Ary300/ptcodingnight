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

function createClient(): PrismaClient {
  const env = parseServerEnv();
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function getClient(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (existing !== undefined) return existing;

  const client = createClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
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
