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

  /**
   * OAuth provider credentials. All optional, and that is the design: a provider with no
   * credentials configured is simply **off**, and its routes answer 503 rather than failing
   * mid-flow with something that looks like the student's fault.
   *
   * Neither provider is ever the only way in — `User.passwordHash` is NOT NULL, so an
   * OAuth-only account cannot exist (docs/AUTH.md §3).
   */
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),

  /**
   * Public origin, used to build OAuth redirect URIs.
   *
   * Must match the redirect URI registered with each provider exactly, including the port —
   * a mismatch is the single most common OAuth setup failure and the providers' error messages
   * for it are famously unhelpful.
   */
  PUBLIC_ORIGIN: z.string().url().optional(),

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

/**
 * Resolved OAuth configuration for one provider, or null when it is not configured.
 *
 * Null is a first-class answer rather than an error: a contest that never set up GitHub should
 * still start, and its GitHub route should say "not configured on this server" instead of
 * throwing something that reads like the student did wrong.
 */
export function oauthConfig(
  provider: "google" | "github",
  source: NodeJS.ProcessEnv = process.env,
): { clientId: string; clientSecret: string; redirectUri: string } | null {
  const env = parseContestEnv(source);

  const clientId = provider === "google" ? env.GOOGLE_CLIENT_ID : env.GITHUB_CLIENT_ID;
  const clientSecret =
    provider === "google" ? env.GOOGLE_CLIENT_SECRET : env.GITHUB_CLIENT_SECRET;

  if (clientId === undefined || clientSecret === undefined) return null;

  // Defaulting the origin rather than requiring it: on the contest LAN the app is reached at a
  // fixed host:port, and forcing PUBLIC_ORIGIN into .env for local development would be one more
  // thing to get wrong before anything works.
  const origin = env.PUBLIC_ORIGIN ?? "http://localhost:3000";

  return {
    clientId,
    clientSecret,
    redirectUri: `${origin.replace(/\/+$/, "")}/api/auth/${provider}/callback`,
  };
}
