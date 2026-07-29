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

  TEST_DATA_ROOT: z.string().min(1).default("./data/testcases"),
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
