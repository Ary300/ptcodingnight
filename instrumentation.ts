/**
 * Next runs `register()` once per server process, before the first request is served.
 *
 * This exists so that a misconfigured production deployment **stops** rather than failing at the
 * first sign-in. The distinction matters on a contest night: a server that boots and serves the
 * join page looks healthy, and the fault surfaces as forty students unable to log in at once, at
 * the moment nobody has time to read a stack trace.
 */

/**
 * Why this exits the process rather than just throwing.
 *
 * Next binds the port before `register()` resolves, and it turns a rejection here into an
 * `unhandledRejection` that it logs and then carries on from. Measured: the server stays up and
 * answers **500 on every route**, including `/`. Under `restart: unless-stopped` that is an
 * invisible restart loop; behind a healthcheck it is a container that reports itself unhealthy
 * for a reason buried three stack traces deep.
 *
 * Exiting non-zero makes the failure exactly what it is — the deployment did not come up — and
 * puts the operator's next action on the last line of the log.
 */
function fatal(error: unknown): never {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `\n[31mFATAL: refusing to start.[0m\n\n${detail}\n\n` +
      "See docs/DEPLOY.md for the deployed configuration, or docs/AUTH.md §5 for what these\n" +
      "cookie settings protect.\n\n",
  );
  process.exit(1);
}

export async function register(): Promise<void> {
  // Edge and browser runtimes do not have the environment this checks, and importing the server
  // schema there would pull server-only code into a bundle that must not have it.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { assertAuthEnvIsDeployable } = await import("@/lib/contest/env");
    assertAuthEnvIsDeployable();
  } catch (error: unknown) {
    fatal(error);
  }
}
