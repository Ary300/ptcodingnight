import { randomBytes } from "node:crypto";

import { z } from "zod";

/**
 * The environment this scope owns.
 *
 * `lib/schemas/env.ts` is the orchestrator's file and covers the database, the queue, and the
 * judge. The two values below exist only for the API trust boundary, so they are parsed here
 * rather than by widening a file this agent does not own. **Request to the orchestrator:**
 * fold `SESSION_SECRET` and `ADMIN_PASSCODE` into `ServerEnvSchema` and `.env.example` so a
 * cold start (G10) fails loudly on a missing secret instead of at first login.
 */

export const ContestEnvSchema = z.object({
  /**
   * HMAC key for session cookies. 32 characters minimum — a shorter key makes forging a
   * session a brute-force problem rather than an impossible one.
   */
  SESSION_SECRET: z.string().min(32).optional(),
  /** Shared passcode for the organizer console. Absent means nobody can hold an admin session. */
  ADMIN_PASSCODE: z.string().min(8).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type ContestEnv = z.infer<typeof ContestEnvSchema>;

export function parseContestEnv(source: NodeJS.ProcessEnv = process.env): ContestEnv {
  const result = ContestEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}\n\nCopy .env.example to .env.`);
  }
  return result.data;
}

let cachedSecret: string | null = null;

/**
 * The session signing key.
 *
 * In production a missing key is fatal: silently inventing one would mean every restart
 * logged the whole room out mid-contest, and two web replicas would reject each other's
 * cookies. In development and test an ephemeral per-process key keeps `npm run dev` working
 * without a `.env` edit.
 */
export function sessionSecret(source: NodeJS.ProcessEnv = process.env): string {
  if (cachedSecret !== null) return cachedSecret;

  const env = parseContestEnv(source);
  if (env.SESSION_SECRET !== undefined) {
    cachedSecret = env.SESSION_SECRET;
    return cachedSecret;
  }

  if (env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET is required in production. Set at least 32 characters in .env.",
    );
  }

  cachedSecret = randomBytes(32).toString("hex");
  return cachedSecret;
}

/** Test seam: forget the memoized key so a test can supply its own environment. */
export function resetSessionSecretForTests(): void {
  cachedSecret = null;
}

export function adminPasscode(source: NodeJS.ProcessEnv = process.env): string | null {
  return parseContestEnv(source).ADMIN_PASSCODE ?? null;
}
