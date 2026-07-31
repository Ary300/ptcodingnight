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

/**
 * What these readers accept.
 *
 * Deliberately wider than `NodeJS.ProcessEnv`, which Next augments with a *required* `NODE_ENV`.
 * Nothing here may depend on a key being present — every field is optional or defaulted — and a
 * test must be able to state the exact environment it means without inheriting the real one.
 */
export type EnvSource = Readonly<Partial<Record<string, string>>>;

/**
 * An optional setting where **an empty string means absent**.
 *
 * `.min(1).optional()` is not the same thing, and the difference took the deployment down.
 * `docker-compose.prod.yml` writes `GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}`, so an unset
 * variable reaches the process as `""` — which is *present* and *too short*, so validation
 * failed and the production boot check refused to start:
 *
 *   GITHUB_CLIENT_SECRET: Too small: expected string to have >=1 characters
 *
 * That is "leave a provider blank to turn it off" — the behaviour this file's own comments
 * promise, and `.env.production.example` instructs — preventing the site from starting at all.
 *
 * Empty means unset everywhere else in the shell and compose world; it means unset here too.
 */
function optional<T extends z.ZodType<string, string>>(schema: T) {
  return z
    .string()
    .transform((value) => (value.trim() === "" ? undefined : value))
    .pipe(z.union([schema, z.undefined()]))
    .optional();
}

export const ContestEnvSchema = z.object({
  /**
   * HMAC key for session cookies. 32 characters minimum — a shorter key makes forging a
   * session a brute-force problem rather than an impossible one.
   */
  SESSION_SECRET: optional(z.string().min(32)),
  /** Shared passcode for the organizer console. Absent means nobody can hold an admin session. */
  ADMIN_PASSCODE: optional(z.string().min(8)),

  /**
   * OAuth provider credentials. All optional, and that is the design: a provider with no
   * credentials configured is simply **off**, and its routes answer 503 rather than failing
   * mid-flow with something that looks like the student's fault.
   *
   * Neither provider is ever the only way in — `User.passwordHash` is NOT NULL, so an
   * OAuth-only account cannot exist (docs/AUTH.md §3).
   */
  GOOGLE_CLIENT_ID: optional(z.string().min(1)),
  GOOGLE_CLIENT_SECRET: optional(z.string().min(1)),
  GITHUB_CLIENT_ID: optional(z.string().min(1)),
  GITHUB_CLIENT_SECRET: optional(z.string().min(1)),

  /**
   * Public origin, used to build OAuth redirect URIs.
   *
   * Must match the redirect URI registered with each provider exactly, including the port —
   * a mismatch is the single most common OAuth setup failure and the providers' error messages
   * for it are famously unhelpful.
   */
  PUBLIC_ORIGIN: optional(z.url()),

  /**
   * How many trusted proxies sit in front of the app. See `clientKey` in rate-limit.ts.
   *
   * Zero — the default — means `x-forwarded-for` is ignored entirely, because without a proxy it
   * is attacker-controlled input. The `docker-compose.prod.yml` deployment puts Caddy in front,
   * so that deployment sets this to 1.
   */
  TRUSTED_PROXY_COUNT: optional(z.string().regex(/^[0-9]+$/)),

  /**
   * Whether session cookies carry the `Secure` attribute.
   *
   * **Defaults to `true`, and production refuses to start if it is false** — see the refinement
   * below. The only legitimate `false` is a plain-HTTP local `npm run dev`, where a `Secure`
   * cookie would never be stored and nobody could sign in.
   *
   * This used to be a hardcoded `false`, justified by a classroom LAN with no certificate. That
   * justification is dead: the deployment is a real domain behind Let's Encrypt. A session cookie
   * without `Secure` is sent over any plain-HTTP request to the same host, so anyone on the path
   * — the venue wifi, a shared uplink — reads a session token and becomes that student, or the
   * organizer.
   */
  COOKIE_SECURE: z
    .string()
    .refine(
      (v) => v === "true" || v === "false",
      'COOKIE_SECURE must be exactly "true" or "false"',
    )
    .default("true"),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
})
  .superRefine((env, ctx) => {
    /**
     * Production must not serve a cookie that a network observer can lift. This is checked in the
     * schema rather than at the call site so that *every* entry point inherits it — the web
     * server, the worker, a script — and `instrumentation.ts` turns it into a boot failure rather
     * than a first-request failure.
     */
    if (env.NODE_ENV === "production" && env.COOKIE_SECURE === "false") {
      ctx.addIssue({
        code: "custom",
        path: ["COOKIE_SECURE"],
        message:
          "COOKIE_SECURE must be true in production. A session cookie without Secure is " +
          "readable by anyone on the network path. If you genuinely cannot terminate TLS, do " +
          "not run with NODE_ENV=production.",
      });
    }

    /**
     * A `https://` origin is not cosmetic here: it is the redirect URI the provider is told to
     * send the student back to. An `http://` origin in production means either TLS is not
     * actually terminated, or the registered redirect URI will not match — and the providers'
     * error messages for a mismatch are famously unhelpful.
     *
     * Only enforced when a provider is actually configured, so a contest running without OAuth
     * is not forced to set a variable it does not use.
     */
    const oauthConfigured =
      env.GOOGLE_CLIENT_ID !== undefined || env.GITHUB_CLIENT_ID !== undefined;
    if (env.NODE_ENV === "production" && oauthConfigured) {
      if (env.PUBLIC_ORIGIN === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["PUBLIC_ORIGIN"],
          message:
            "PUBLIC_ORIGIN is required in production when Google or GitHub sign-in is " +
            "configured. It must match the redirect URI registered with the provider exactly.",
        });
      } else if (!env.PUBLIC_ORIGIN.startsWith("https://")) {
        ctx.addIssue({
          code: "custom",
          path: ["PUBLIC_ORIGIN"],
          message: `PUBLIC_ORIGIN must be https:// in production, got ${env.PUBLIC_ORIGIN}`,
        });
      }
    }
  });

export type ContestEnv = z.infer<typeof ContestEnvSchema>;

export function parseContestEnv(source: EnvSource = process.env): ContestEnv {
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
export function sessionSecret(source: EnvSource = process.env): string {
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

export function adminPasscode(source: EnvSource = process.env): string | null {
  return parseContestEnv(source).ADMIN_PASSCODE ?? null;
}

/**
 * Whether cookies this process sets should carry `Secure`.
 *
 * Read at call time rather than memoized: a memo would make the value a property of whichever
 * request happened to arrive first, and the tests would need a reset seam for no gain. Parsing is
 * a Zod pass over a small object.
 */
export function cookiesAreSecure(source: EnvSource = process.env): boolean {
  return parseContestEnv(source).COOKIE_SECURE === "true";
}

/**
 * Fail the boot rather than the first sign-in.
 *
 * Called from `instrumentation.ts`, which Next runs once per server process at startup. Every
 * check here is already enforced by `ContestEnvSchema`; the point of a separate entry point is
 * *when* it fires. Without it, a production server with `COOKIE_SECURE=false` starts happily,
 * serves the marketing page, and only fails when the first student tries to sign in — which on a
 * contest night is a room full of people watching.
 */
export function assertAuthEnvIsDeployable(source: EnvSource = process.env): void {
  const env = parseContestEnv(source);
  if (env.NODE_ENV !== "production") return;

  if (env.SESSION_SECRET === undefined) {
    throw new Error(
      "SESSION_SECRET is required in production. Generate one with: openssl rand -hex 32",
    );
  }
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
  source: EnvSource = process.env,
): { clientId: string; clientSecret: string; redirectUri: string } | null {
  const env = parseContestEnv(source);

  const clientId = provider === "google" ? env.GOOGLE_CLIENT_ID : env.GITHUB_CLIENT_ID;
  const clientSecret =
    provider === "google" ? env.GOOGLE_CLIENT_SECRET : env.GITHUB_CLIENT_SECRET;

  if (clientId === undefined || clientSecret === undefined) return null;

  // Defaulted rather than required, and defaulted to **http** on purpose.
  //
  // This is the `redirect_uri` handed to Google and GitHub, so it has to match what is registered
  // with them character for character. In production the schema above refuses to boot without a
  // PUBLIC_ORIGIN and refuses one that is not https, so the only case reaching this line is local
  // development — where the dev server speaks plain http. Guessing https here is what sends a
  // developer to `https://localhost:3000`, which nothing is listening on, and the browser reports
  // it as "Safari can't open the page" with no hint that OAuth was involved.
  const origin = env.PUBLIC_ORIGIN ?? "http://localhost:3000";

  return {
    clientId,
    clientSecret,
    redirectUri: `${origin.replace(/\/+$/, "")}/api/auth/${provider}/callback`,
  };
}
