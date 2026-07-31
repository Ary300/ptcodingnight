import { z } from "zod";

/**
 * Environment is a trust boundary: parse it once, at startup, and fail loudly. A missing
 * DATABASE_URL should stop the process with a readable message, not surface as a null
 * dereference during a contest.
 */

/**
 * Env values are always strings, so the default is a string too and the numeric coercion
 * happens after it. Defaulting to a number here would be an input/output type mismatch.
 */
const numeric = (label: string, fallback: string) =>
  z
    .string()
    .regex(/^\d+$/, `${label} must be a whole number`)
    .default(fallback)
    .transform((s) => Number.parseInt(s, 10))
    .pipe(z.number().int().positive());

export const ServerEnvSchema = z.object({
  DATABASE_URL: z.url("DATABASE_URL must be a valid postgresql:// URL"),
  REDIS_URL: z.url("REDIS_URL must be a valid redis:// URL"),

  /**
   * Signs the session cookie. Required in production and validated here so a missing secret
   * stops the process at startup with a readable message, rather than surfacing as the first
   * student failing to log in on contest night.
   */
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters")
    .optional(),
  /** Shared passcode for the organizer console. */
  ADMIN_PASSCODE: z.string().min(8, "ADMIN_PASSCODE must be at least 8 characters").optional(),

  /**
   * Email domains allowed to CREATE an account by signing in with Google or GitHub.
   *
   * Comma-separated, no `@`: `parktudor.org` or `parktudor.org,students.parktudor.org`.
   *
   * **Unset means self-signup is off**, and the OAuth paths behave exactly as they did before it
   * existed: link to an account an organizer already created, or refuse. Fail-closed is the only
   * safe default here, because the failure is silent and public — `ptcodingnight.com` is on the
   * open internet, and an allowlist that defaults to "anyone" lets anyone on Earth with a Google
   * account enrol in a school contest without a single error being logged.
   *
   * This never grants a role. Passing the allowlist makes you a COMPETITOR and nothing else; see
   * `selfSignUpFromOAuth` in lib/contest/accounts.ts, where the role is a literal.
   */
  SIGNUP_ALLOWED_EMAIL_DOMAINS: z.string().optional(),

  TEST_DATA_ROOT: z.string().min(1).default("./data/testcases"),
  /**
   * Where the judge stages a submission's source, inputs and results.
   *
   * **This path must mean the same thing to the worker and to the Docker daemon**, and when the
   * worker runs inside a container those are different namespaces. The worker asks the HOST
   * daemon to bind-mount these directories into each judge container, and the host resolves the
   * path in its own namespace — so a container-local default like `/app/.judge-tmp` resolves on
   * the host to a directory that does not exist, the judge container receives a silently EMPTY
   * mount, and every submission fails with nothing in the log to explain it.
   *
   * Configurable for exactly that reason: `docker-compose.prod.yml` mounts one host directory at
   * the identical path inside the worker and points this at it. The default is right for a worker
   * running directly on the host, which is how G4, G5 and G13 run.
   */
  JUDGE_SCRATCH_ROOT: z.string().min(1).optional(),
  JUDGE_CONCURRENCY: numeric("JUDGE_CONCURRENCY", "4"),

  JUDGE_IMAGE_PYTHON: z.string().min(1).default("python:3.12-slim"),
  JUDGE_IMAGE_JAVA: z.string().min(1).default("eclipse-temurin:21-jdk"),

  JUDGE_MEMORY_LIMIT: z.string().min(1).default("256m"),
  JUDGE_CPU_LIMIT: z.string().min(1).default("1.0"),
  JUDGE_PIDS_LIMIT: numeric("JUDGE_PIDS_LIMIT", "64"),
  JUDGE_TMPFS_SIZE: z.string().min(1).default("16m"),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

/**
 * Parse and return the server environment. Throws a readable aggregate error listing every
 * missing or malformed variable at once, rather than failing on the first.
 */
export function parseServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const result = ServerEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}\n\nCopy .env.example to .env.`);
  }
  return result.data;
}
