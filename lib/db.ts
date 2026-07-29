import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { parseServerEnv } from "@/lib/schemas/env";

/**
 * Prisma 7 reaches Postgres through a driver adapter rather than a URL in schema.prisma.
 *
 * The client is memoized on globalThis so Next's dev-mode module reloading does not open a
 * new connection pool on every edit — a classic way to exhaust Postgres connections during
 * development.
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

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
